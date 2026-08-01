import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createAudit } from './audit.js';
import { guardianModelConfigured, runGuardianAgent } from './agent.js';
import { assessProjectObjective } from './objective-assessment.js';
import {
  ANALYSIS_TERMINAL_STATUSES,
  AnalysisRunConflictError,
  claimAnalysisStep,
  completeAnalysisStep,
  failAnalysisStep,
} from './project-analysis.js';
import { serializeProjectIntent } from './project-intents.js';
import { importManifest } from './manifest.js';
import { applySnapshotRetention, diffSnapshots, materializeSnapshotIndex, scanDirectory } from './scanner.js';
import { stableEdgeId } from './store.js';
import { githubEvidenceToGraph } from './integrations/github.js';
import { structuredLog } from './observability.js';
import { extractArchive } from './upload.js';
import { snapshotToEvidenceGraph } from './snapshot-to-graph.js';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const AgentObjectiveSummarySchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  evidenceIds: z.array(z.string().min(1).max(200)).max(100),
  missingEvidence: z.array(z.string().trim().min(1).max(500)).max(50),
  limitations: z.array(z.string().trim().min(1).max(500)).max(50),
}).strict();

function parseAgentObjectiveSummary(response) {
  const text = String(response || '').trim();
  const json = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
    : text;
  try {
    return AgentObjectiveSummarySchema.parse(JSON.parse(json));
  } catch {
    throw Object.assign(new Error('ADK summary did not match the required structured schema'), { code: 'ADK_INVALID_OUTPUT' });
  }
}

function mergeGraph(state, graph) {
  state.evidence ||= [];
  for (const node of graph.nodes || []) {
    const index = state.nodes.findIndex((item) => item.id === node.id);
    if (index >= 0) state.nodes[index] = node;
    else state.nodes.push(node);
  }
  for (const edge of graph.edges || []) {
    edge.id ||= stableEdgeId(edge);
    const index = state.edges.findIndex((item) => item.id === edge.id);
    if (index >= 0) state.edges[index] = edge;
    else state.edges.push(edge);
  }
  for (const evidence of graph.evidence || []) {
    const index = state.evidence.findIndex((item) => item.id === evidence.id);
    if (index >= 0) state.evidence[index] = evidence;
    else state.evidence.push(evidence);
  }
}

function mergeFindings(state, audit) {
  const key = (finding) => `${finding.projectId}:${finding.type}:${[...(finding.affectedEntities || [])].sort().join(',')}`;
  const existingByKey = new Map(state.findings.map((finding) => [key(finding), finding]));
  for (const finding of audit.findings) {
    const existing = existingByKey.get(key(finding));
    if (!existing) {
      state.findings.unshift(finding);
      existingByKey.set(key(finding), finding);
    } else {
      Object.assign(existing, finding, { status: 'open' });
    }
  }
}

function fileFromManifestRecord(record) {
  const token = record.path_token || record.asset_id;
  const extension = record.extension || path.posix.extname(String(token || '')).toLowerCase();
  return {
    pathToken: token,
    sizeBytes: record.size_bytes,
    modifiedAt: record.modified_at,
    kind: record.asset_type || record.kind,
    mediaType: record.media_type,
    extension,
    contentHash: record.content_hash,
    fingerprint: record.fingerprint,
    fingerprintStrength: record.fingerprint?.strength,
  };
}

async function ingestCollectorManifest(store, objectStore, run) {
  if (!run.inputObjectKey || !run.inputSha256) throw new Error('Analysis input object is unavailable');
  const stored = await objectStore.get(run.inputObjectKey);
  if (stored.sha256 !== run.inputSha256) throw new Error('Analysis input checksum mismatch');
  const raw = JSON.parse(stored.content.toString('utf8'));
  const source = (store.get().sources || []).find((item) => item.id === run.sourceId);
  if (!source || source.status !== 'active') throw Object.assign(new Error('Collector source is disconnected'), { code: 'SOURCE_DISCONNECTED' });
  const imported = importManifest(raw, run.projectId, {
    requireSignature: true,
    trustedFingerprints: [source.collectorFingerprint],
  });
  const project = store.get().projects.find((item) => item.id === run.projectId);
  if (imported.manifest.project_key !== project.slug && imported.manifest.project_id !== project.id) {
    throw Object.assign(new Error('Collector manifest belongs to another project'), { code: 'PROJECT_MISMATCH' });
  }
  let outcome;
  await store.update((state) => {
    state.importedBundles ||= [];
    const currentRun = state.analysisRuns.find((item) => item.id === run.id);
    currentRun.pipelineState ||= {};
    const existing = (state.importedBundles || []).find((item) => (
      item.projectId === run.projectId && item.sourceId === run.sourceId
      && item.bundleId === imported.manifest.bundle_id
    ));
    if (existing) {
      currentRun.pipelineState.snapshotId = existing.snapshotId;
      currentRun.pipelineState.bundleId = existing.bundleId;
      outcome = existing;
      return;
    }
    mergeGraph(state, imported);
    const assets = imported.manifest.records.filter((record) => record.record_type === 'asset');
    const previousRecord = state.snapshots
      .filter((snapshot) => snapshot.projectId === run.projectId && snapshot.sourceId === run.sourceId)
      .at(-1);
    const previous = previousRecord ? materializeSnapshotIndex(previousRecord) : null;
    const snapshot = {
      id: `snapshot_${imported.manifest.bundle_id}`,
      projectId: run.projectId,
      sourceId: run.sourceId,
      sourceRevision: run.sourceRevision,
      bundleId: imported.manifest.bundle_id,
      collectedAt: imported.manifest.captured_at || run.queuedAt,
      collectorVersion: imported.manifest.collector?.version || 'unknown',
      fileCount: assets.length,
      warnings: imported.manifest.stats?.scan_warnings || [],
      files: assets.map(fileFromManifestRecord),
    };
    snapshot.changes = diffSnapshots(previous, snapshot);
    state.snapshots.push(snapshot);
    applySnapshotRetention(state, run.projectId);
    outcome = {
      id: `import_${imported.manifest.bundle_id}`,
      projectId: run.projectId,
      sourceId: run.sourceId,
      bundleId: imported.manifest.bundle_id,
      snapshotId: snapshot.id,
      importedAt: new Date().toISOString(),
      signerFingerprint: imported.signerFingerprint,
    };
    state.importedBundles.push(outcome);
    const currentSource = state.sources.find((item) => item.id === run.sourceId);
    currentSource.lastBundleId = imported.manifest.bundle_id;
    currentSource.lastSourceRevision = run.sourceRevision;
    currentSource.lastSeenAt = outcome.importedAt;
    currentSource.updatedAt = outcome.importedAt;
    Object.assign(currentRun.pipelineState, {
      snapshotId: snapshot.id,
      bundleId: imported.manifest.bundle_id,
      signerFingerprint: imported.signerFingerprint,
    });
  });
  return {
    output: { snapshotId: outcome.snapshotId, bundleId: outcome.bundleId },
    artifactRefs: [{ kind: 'snapshot', id: outcome.snapshotId }],
  };
}

function attachSnapshot(state, run, snapshot) {
  const previousRecord = state.snapshots
    .filter((item) => item.projectId === run.projectId && item.sourceId === run.sourceId)
    .at(-1);
  const previous = previousRecord ? materializeSnapshotIndex(previousRecord) : null;
  snapshot.projectId = run.projectId;
  snapshot.sourceId = run.sourceId;
  snapshot.sourceRevision = run.sourceRevision;
  snapshot.baseline = !previous;
  snapshot.changes = diffSnapshots(previous, snapshot);
  state.snapshots.push(snapshot);
  applySnapshotRetention(state, run.projectId);
  const project = state.projects.find((item) => item.id === run.projectId);
  if (project) {
    project.lastScan = snapshot.collectedAt;
    project.updatedAt = snapshot.collectedAt;
  }
  const source = state.sources.find((item) => item.id === run.sourceId);
  if (source) {
    source.lastSourceRevision = run.sourceRevision;
    source.lastSeenAt = snapshot.collectedAt;
    source.updatedAt = snapshot.collectedAt;
  }
  const currentRun = state.analysisRuns.find((item) => item.id === run.id);
  currentRun.pipelineState ||= {};
  currentRun.pipelineState.snapshotId = snapshot.id;
  return snapshot;
}

async function loadInputObject(objectStore, run) {
  if (!run.inputObjectKey || !run.inputSha256) throw new Error('Analysis input object is unavailable');
  const stored = await objectStore.get(run.inputObjectKey);
  if (stored.sha256 !== run.inputSha256) throw new Error('Analysis input checksum mismatch');
  return stored;
}

async function ingestGitHubEvidence(store, objectStore, run) {
  const existingId = store.get().analysisRuns.find((item) => item.id === run.id)?.pipelineState?.snapshotId;
  if (existingId) return { output: { snapshotId: existingId, sourceRevision: run.sourceRevision }, artifactRefs: [{ kind: 'snapshot', id: existingId }] };
  const stored = await loadInputObject(objectStore, run);
  const input = JSON.parse(stored.content.toString('utf8'));
  const evidence = input.schemaVersion === 'lablineage.github-analysis-input.v1' ? input.evidence : input;
  if (evidence.repositorySnapshot?.headSha !== run.sourceRevision) {
    throw Object.assign(new Error('GitHub evidence revision does not match the queued run'), { code: 'SOURCE_REVISION_MISMATCH' });
  }
  const graph = githubEvidenceToGraph(run.projectId, evidence);
  const tree = evidence.repositorySnapshot?.tree || [];
  const collectedAt = evidence.capturedAt || run.queuedAt;
  let snapshot;
  let archiveStats = null;
  if (input.archive?.objectKey && input.archive?.sha256) {
    const archiveObject = await objectStore.get(input.archive.objectKey);
    if (archiveObject.sha256 !== input.archive.sha256) throw new Error('GitHub archive checksum mismatch');
    const workspace = await mkdtemp(path.join(tmpdir(), 'lablineage-github-analysis-'));
    try {
      const zipPath = path.join(workspace, 'repository.zip');
      await writeFile(zipPath, archiveObject.content, { flag: 'wx' });
      const extracted = await extractArchive(zipPath, workspace);
      snapshot = await scanDirectory(extracted.destDir, {
        allowedRoot: extracted.destDir,
        includeTextContent: false,
        redactPaths: false,
        maxFiles: 10_000,
        maxBytes: 200 * 1024 * 1024,
      });
      snapshot.sourceLabel = `${evidence.repository.fullName}@${run.sourceRevision.slice(0, 12)}`;
      snapshot.collectedAt = collectedAt;
      snapshot.historyCoverage = 'pinned_repository_archive';
      snapshot.warnings = [
        ...(snapshot.warnings || []),
        ...extracted.warnings,
        ...(evidence.repositorySnapshot?.treeTruncated ? ['GitHub tree response was truncated'] : []),
      ];
      archiveStats = { sha256: input.archive.sha256, extractedFiles: extracted.extractedFiles, extractedBytes: extracted.extractedBytes };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  } else {
    snapshot = {
      id: `snapshot_github_${evidence.repository.id}_${run.sourceRevision}`,
      collectedAt,
      sourceLabel: evidence.repository.fullName,
      fileCount: tree.length,
      directoryRootHash: `sha256:${sha256(canonicalJson(tree))}`,
      historyCoverage: 'provider_metadata',
      textDiffCapture: 'disabled',
      warnings: ['Source archive was unavailable; snapshot contains provider metadata only.', ...(evidence.repositorySnapshot?.treeTruncated ? ['GitHub tree response was truncated'] : [])],
      files: tree.map((item) => ({
        pathToken: item.pathToken,
        sizeBytes: item.sizeBytes || 0,
        modifiedAt: collectedAt,
        kind: item.kind || 'file',
        mediaType: 'application/octet-stream',
        extension: path.posix.extname(item.pathToken || '').toLowerCase(),
        contentHash: item.contentHash,
        fingerprint: item.fingerprint,
        fingerprintStrength: item.fingerprint?.strength || 'strong',
      })),
    };
  }
  await store.update((state) => {
    mergeGraph(state, graph);
    attachSnapshot(state, run, snapshot);
    const current = state.analysisRuns.find((item) => item.id === run.id);
    current.pipelineState.repository = {
      fullName: evidence.repository.fullName,
      headSha: run.sourceRevision,
      treeEntries: tree.length,
      treeTruncated: Boolean(evidence.repositorySnapshot?.treeTruncated),
      archive: archiveStats,
    };
  });
  return {
    output: { snapshotId: snapshot.id, sourceRevision: run.sourceRevision, treeEntries: tree.length, archiveFiles: archiveStats?.extractedFiles || 0 },
    artifactRefs: [{ kind: 'snapshot', id: snapshot.id }, { kind: 'github_revision', sha: run.sourceRevision }],
  };
}

async function ingestZipArchive(store, objectStore, run) {
  const existingId = store.get().analysisRuns.find((item) => item.id === run.id)?.pipelineState?.snapshotId;
  if (existingId) return { output: { snapshotId: existingId, sourceRevision: run.sourceRevision }, artifactRefs: [{ kind: 'snapshot', id: existingId }] };
  const stored = await loadInputObject(objectStore, run);
  const workspace = await mkdtemp(path.join(tmpdir(), 'lablineage-analysis-'));
  try {
    const zipPath = path.join(workspace, 'archive.zip');
    await writeFile(zipPath, stored.content, { flag: 'wx' });
    const extracted = await extractArchive(zipPath, workspace);
    const snapshot = await scanDirectory(extracted.destDir, {
      allowedRoot: extracted.destDir,
      includeTextContent: false,
      redactPaths: false,
      maxFiles: 10_000,
      maxBytes: 200 * 1024 * 1024,
    });
    snapshot.sourceLabel = 'ZIP fallback import';
    snapshot.warnings = [...(snapshot.warnings || []), ...extracted.warnings];
    await store.update((state) => {
      attachSnapshot(state, run, snapshot);
      const current = state.analysisRuns.find((item) => item.id === run.id);
      current.pipelineState.archive = {
        sha256: run.inputSha256,
        extractedFiles: extracted.extractedFiles,
        extractedBytes: extracted.extractedBytes,
        warningCount: extracted.warnings.length,
      };
    });
    return {
      output: { snapshotId: snapshot.id, extractedFiles: extracted.extractedFiles, extractedBytes: extracted.extractedBytes },
      artifactRefs: [{ kind: 'snapshot', id: snapshot.id }],
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function scanStep(store, run) {
  const snapshotId = store.get().analysisRuns.find((item) => item.id === run.id)?.pipelineState?.snapshotId;
  const snapshotRecord = store.get().snapshots.find((item) => item.id === snapshotId);
  if (!snapshotRecord) throw new Error('Ingest step did not produce a snapshot');
  const snapshot = materializeSnapshotIndex(snapshotRecord);
  const digest = sha256(canonicalJson(snapshot.files || []));
  await store.update((state) => {
    const current = state.analysisRuns.find((item) => item.id === run.id);
    current.pipelineState.scanSha256 = digest;
  });
  return {
    output: { snapshotId, fileCount: snapshot.fileCount, scanSha256: digest },
    artifactRefs: [{ kind: 'snapshot', id: snapshotId }],
  };
}

async function graphStep(store, run) {
  let summary;
  await store.update((state) => {
    const current = state.analysisRuns.find((item) => item.id === run.id);
    const snapshotRecord = state.snapshots.find((item) => item.id === current.pipelineState?.snapshotId);
    if (!snapshotRecord) throw new Error('Snapshot not found for graph step');
    const snapshot = materializeSnapshotIndex(snapshotRecord);
    const graph = snapshotToEvidenceGraph(run.projectId, snapshot);
    const existingPaths = new Set(state.nodes.filter((node) => node.projectId === run.projectId)
      .map((node) => node.pathToken || node.details?.pathToken).filter(Boolean));
    graph.nodes = graph.nodes.filter((node) => !existingPaths.has(node.pathToken));
    graph.evidence = graph.evidence.filter((item) => graph.nodes.some((node) => node.evidenceIds.includes(item.id)));
    mergeGraph(state, graph);
    summary = {
      nodesAdded: graph.nodes.length,
      edgesAdded: graph.edges.length,
      evidenceAdded: graph.evidence.length,
    };
    current.pipelineState.graph = summary;
  });
  return { output: summary, artifactRefs: [{ kind: 'lineage_graph', projectId: run.projectId }] };
}

async function auditStep(store, run) {
  let auditSummary;
  await store.update((state) => {
    const current = state.analysisRuns.find((item) => item.id === run.id);
    const existing = current.pipelineState?.auditId
      ? state.audits.find((item) => item.id === current.pipelineState.auditId)
      : null;
    if (existing) {
      auditSummary = existing;
      return;
    }
    const nodes = state.nodes.filter((node) => node.id === run.projectId || node.projectId === run.projectId);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = state.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const audit = createAudit(run.projectId, nodes, edges);
    state.audits.unshift({ ...audit, findings: undefined });
    mergeFindings(state, audit);
    current.pipelineState ||= {};
    current.pipelineState.auditId = audit.id;
    auditSummary = { ...audit, findings: undefined };
  });
  return {
    output: { auditId: auditSummary.id, level: auditSummary.level, score: auditSummary.score },
    artifactRefs: [{ kind: 'audit', id: auditSummary.id }],
  };
}

async function goalCoverageStep(store, run) {
  let assessment;
  await store.update((state) => {
    const current = state.analysisRuns.find((item) => item.id === run.id);
    const intentRecord = state.projectIntents.find((item) => item.id === run.intentVersionId);
    if (!intentRecord) throw new Error('Bound project objective version is unavailable');
    const intent = serializeProjectIntent(state, intentRecord);
    const audit = state.audits.find((item) => item.id === current.pipelineState?.auditId) || null;
    assessment = assessProjectObjective({
      intent,
      evidence: state.evidence.filter((item) => item.projectId === run.projectId),
      nodes: state.nodes.filter((item) => item.projectId === run.projectId || item.id === run.projectId),
      findings: state.findings.filter((item) => item.projectId === run.projectId),
      audit,
    });
    current.pipelineState ||= {};
    current.pipelineState.assessment = assessment;
  });
  return {
    output: { overallStatus: assessment.overallStatus, coverageScore: assessment.coverageScore },
    artifactRefs: [{ kind: 'objective_assessment_draft', runId: run.id }],
  };
}

async function agentSummaryStep(store, run, invokeAgent) {
  if (!guardianModelConfigured()) {
    throw Object.assign(new Error('Google ADK is not configured'), { code: 'ADK_UNAVAILABLE' });
  }
  const current = store.get().analysisRuns.find((item) => item.id === run.id);
  const assessment = current.pipelineState?.assessment;
  if (!assessment) throw new Error('Deterministic assessment is unavailable');
  const prompt = [
    'Explain this deterministic project objective assessment to a reviewer.',
    'Do not change statuses or scores. Do not claim scientific correctness.',
    'Only cite evidence IDs already present in the assessment; clearly state missing evidence and limitations.',
    'Return only JSON with exactly these fields: summary (string), evidenceIds (string array), missingEvidence (string array), limitations (string array).',
    canonicalJson(assessment),
  ].join('\n\n');
  const result = await invokeAgent(store, {
    projectId: run.projectId,
    message: prompt,
    userId: run.actorSubject,
    conversationId: `analysis_${run.id}`,
  });
  const summary = parseAgentObjectiveSummary(result.response);
  const validEvidenceIds = new Set([
    ...(assessment.criterionResults || []).flatMap((item) => item.evidenceIds || []),
    ...(assessment.keyOutputResults || []).flatMap((item) => item.evidenceIds || []),
  ]);
  const invalid = [...new Set(summary.evidenceIds)].filter((id) => !validEvidenceIds.has(id));
  if (invalid.length > 0) throw Object.assign(new Error('ADK summary cited unknown evidence'), { code: 'ADK_INVALID_EVIDENCE' });
  await store.update((state) => {
    const runState = state.analysisRuns.find((item) => item.id === run.id);
    runState.pipelineState.agent = {
      explanation: summary.summary,
      structuredSummary: summary,
      traceId: result.traceId,
      model: result.model,
      toolCalls: result.toolCalls,
    };
  });
  return {
    output: { traceId: result.traceId, model: result.model },
    artifactRefs: [{ kind: 'agent_trace', traceId: result.traceId }],
  };
}

async function finalizeStep(store, objectStore, run) {
  const current = store.get().analysisRuns.find((item) => item.id === run.id);
  const assessment = current.pipelineState?.assessment;
  if (!assessment) throw new Error('Deterministic assessment is unavailable');
  const agent = current.pipelineState?.agent || null;
  const document = {
    ...assessment,
    runId: run.id,
    projectId: run.projectId,
    sourceId: run.sourceId,
    sourceRevision: run.sourceRevision,
    agentExplanation: agent?.explanation || null,
    agentTraceId: agent?.traceId || null,
    model: agent?.model || null,
    agentStatus: agent ? 'available' : 'unavailable',
    createdAt: current.pipelineState?.finalizeStartedAt || run.updatedAt,
  };
  const content = Buffer.from(`${canonicalJson(document)}\n`);
  const digest = sha256(content);
  const objectKey = `analysis-reports/${run.projectId}/${run.id}/${digest}.json`;
  const stored = await objectStore.putImmutable({
    key: objectKey,
    content,
    contentType: 'application/json',
    metadata: { projectId: run.projectId, runId: run.id, intentVersionId: run.intentVersionId },
  });
  const report = {
    id: `analysis_report_${run.id}`,
    runId: run.id,
    projectId: run.projectId,
    intentVersionId: run.intentVersionId,
    auditExternalId: current.pipelineState?.auditId || null,
    overallStatus: assessment.overallStatus,
    coverageScore: assessment.coverageScore,
    objectKey,
    storageUri: stored.uri,
    sha256: digest,
    mediaType: 'application/json',
    model: agent?.model || null,
    traceId: agent?.traceId || null,
    createdAt: document.createdAt,
  };
  await store.update((state) => {
    const existing = state.analysisReports.findIndex((item) => item.runId === run.id);
    if (existing >= 0) {
      if (state.analysisReports[existing].sha256 !== digest) throw new Error('Immutable analysis report already exists with different content');
    } else {
      state.analysisReports.push(report);
    }
    const runState = state.analysisRuns.find((item) => item.id === run.id);
    runState.pipelineState.reportId = report.id;
  });
  return {
    output: { reportId: report.id, sha256: digest },
    artifactRefs: [{ kind: 'analysis_report', id: report.id, sha256: digest }],
  };
}

async function executeStep(store, objectStore, run, stepName, invokeAgent) {
  if (stepName === 'ingest') {
    if (run.inputKind === 'collector_manifest') return ingestCollectorManifest(store, objectStore, run);
    if (run.inputKind === 'github') return ingestGitHubEvidence(store, objectStore, run);
    if (run.inputKind === 'zip') return ingestZipArchive(store, objectStore, run);
    throw Object.assign(new Error(`Unsupported analysis input kind: ${run.inputKind}`), { code: 'UNSUPPORTED_INPUT' });
  }
  if (stepName === 'scan') return scanStep(store, run);
  if (stepName === 'graph') return graphStep(store, run);
  if (stepName === 'audit') return auditStep(store, run);
  if (stepName === 'goal_coverage') return goalCoverageStep(store, run);
  if (stepName === 'agent_summary') return agentSummaryStep(store, run, invokeAgent);
  if (stepName === 'finalize') return finalizeStep(store, objectStore, run);
  throw new Error(`Unknown analysis step: ${stepName}`);
}

export async function executeAnalysisRun(store, runId, {
  objectStore,
  leaseOwner,
  invokeAgent = runGuardianAgent,
  leaseMs = 5 * 60 * 1000,
} = {}) {
  if (!objectStore) throw new Error('objectStore is required');
  if (!leaseOwner) throw new Error('leaseOwner is required');
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const current = store.get().analysisRuns.find((item) => item.id === runId);
    if (!current || ANALYSIS_TERMINAL_STATUSES.includes(current.status)) return current || null;
    let claimed;
    try {
      await store.update((state) => {
        const run = state.analysisRuns.find((item) => item.id === runId);
        if (run.currentStep === 'finalize') {
          run.pipelineState ||= {};
          run.pipelineState.finalizeStartedAt ||= new Date().toISOString();
        }
        claimed = claimAnalysisStep(state, {
          runId,
          expectedVersion: run.version,
          leaseOwner,
          leaseMs,
        });
      });
    } catch (error) {
      if (error instanceof AnalysisRunConflictError) return store.get().analysisRuns.find((item) => item.id === runId);
      throw error;
    }
    if (!claimed) return store.get().analysisRuns.find((item) => item.id === runId);
    structuredLog('info', 'analysis_step_started', {
      runId,
      projectId: claimed.run.projectId,
      step: claimed.step.name,
      attempt: claimed.step.attempt,
    });
    try {
      const result = await executeStep(store, objectStore, claimed.run, claimed.step.name, invokeAgent);
      const outputSha256 = sha256(canonicalJson(result.output));
      await store.update((state) => {
        completeAnalysisStep(state, {
          runId,
          stepName: claimed.step.name,
          leaseOwner,
          expectedVersion: claimed.run.version,
          inputSha256: claimed.run.inputSha256 || null,
          outputSha256,
          artifactRefs: result.artifactRefs || [],
        });
      });
      structuredLog('info', 'analysis_step_completed', {
        runId,
        projectId: claimed.run.projectId,
        step: claimed.step.name,
        outputSha256,
      });
    } catch (error) {
      const errorCode = String(error.code || (claimed.step.name === 'agent_summary' ? 'ADK_FAILED' : 'ANALYSIS_STEP_FAILED')).slice(0, 100);
      await store.update((state) => {
        const run = state.analysisRuns.find((item) => item.id === runId);
        failAnalysisStep(state, {
          runId,
          stepName: claimed.step.name,
          leaseOwner,
          expectedVersion: run.version,
          errorCode,
          errorSummary: error.message,
        });
      });
      structuredLog('error', 'analysis_step_failed', {
        runId,
        projectId: claimed.run.projectId,
        step: claimed.step.name,
        errorCode,
      });
      const afterFailure = store.get().analysisRuns.find((item) => item.id === runId);
      if (!afterFailure || afterFailure.status === 'failed') return afterFailure || null;
    }
  }
  throw new Error('Analysis pipeline exceeded its bounded step count');
}
