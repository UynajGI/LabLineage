import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError, z } from 'zod';
import { createAudit } from './lib/audit.js';
import { guardianModelConfigured, runGuardianAgent } from './lib/agent.js';
import { GuardianSessionService } from './lib/agent-session-service.js';
import { authenticateRequest, authMode, authorizeProject, authorizeRole, serviceActorSummaries } from './lib/auth.js';
import { postgresConfigured } from './lib/database.js';
import {
  getMcpInternalToken,
  handleReadOnlyMcpRequest,
  requireInternalMcpToken
} from './lib/mcp-server.js';
import { recordAgentUsage, renderPrometheusMetrics, requestObservability, structuredLog } from './lib/observability.js';
import { createObjectStore } from './lib/object-store.js';
import { deploymentProfile, publicDeploymentCapabilities } from './lib/deployment-mode.js';
import { createAnalysisDispatcher } from './lib/analysis-dispatcher.js';
import { executeAnalysisRun } from './lib/analysis-pipeline.js';
import { authenticateCloudTask } from './lib/cloud-task-auth.js';
import {
  authenticateCollectorSignature,
  claimCollectorPairing,
  createCollectorPairing,
  publicCollectorCredential,
  publicCollectorPairing,
  revokeCollectorCredential,
} from './lib/collector-pairing.js';
import { importManifest } from './lib/manifest.js';
import { createIdempotencyMiddleware } from './lib/idempotency.js';
import {
  applySnapshotRetention,
  diffSnapshots,
  materializeSnapshotIndex,
  scanDirectory
} from './lib/scanner.js';
import { projectSummary, stableEdgeId } from './lib/store.js';
import {
  IntentVersionConflictError,
  appendNextProjectIntent,
  appendProjectIntent,
  createIntentVersionSchema,
  createProjectSchema,
  projectDetail
} from './lib/project-intents.js';
import {
  cancelAnalysisRun,
  createAnalysisRun,
  publicAnalysisRun,
  retryAnalysisRun,
} from './lib/project-analysis.js';
import { extractArchive, uploadArchiveMiddleware } from './lib/upload.js';
import { LINEAGE_NODE_TYPES, LINEAGE_RELATIONS, prepareLineageProposal } from './lib/lineage-proposals.js';
import {
  HandoffStateError,
  HandoffVersionConflictError,
  assertEditable,
  assertReceiver,
  assertReviewer,
  assertTransition,
  assertVersion,
  canComplete,
  computeOverdue,
  nextOrderNumber
} from './lib/handoff-orders.js';
import { createStore } from './lib/store-factory.js';
import {
  createGitHubClientFromEnv,
  githubEvidenceToGraph,
  githubWebhookToGraph,
  verifyGitHubWebhook
} from './lib/integrations/github.js';
import { LocalGitClient } from './lib/integrations/local-git.js';
import { buildHandoffPayload, createGoogleWorkspaceClientFromEnv } from './lib/integrations/workspace.js';
import { openApiDocument } from './openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDeployment = deploymentProfile();
const port = Number(process.env.LABLINEAGE_PORT || process.env.PORT || 8788);
const host = process.env.LABLINEAGE_HOST || (runtimeDeployment.mode === 'google_cloud' ? '0.0.0.0' : '127.0.0.1');
export const store = await createStore();
const requireIdempotentWrite = createIdempotencyMiddleware(store);
const analysisObjectStore = {
  putImmutable: (input) => createObjectStore({ dataDir: store.dataDir }).putImmutable(input),
  get: (key) => createObjectStore({ dataDir: store.dataDir }).get(key),
};
const analysisDispatcher = createAnalysisDispatcher({ store, objectStore: analysisObjectStore });

function parseGitHubRepository(value) {
  const raw = String(value || '').trim();
  let pathValue = raw;
  if (/^https?:\/\//iu.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { throw Object.assign(new Error('GitHub repository URL is invalid'), { statusCode: 400 }); }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.search || url.hash || url.port) {
      throw Object.assign(new Error('Only canonical HTTPS github.com repository URLs are accepted'), { statusCode: 400 });
    }
    pathValue = url.pathname.replace(/^\/+|\/+$/gu, '');
  }
  const match = pathValue.replace(/\.git$/iu, '').match(/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/u);
  if (!match) throw Object.assign(new Error('Repository must be a GitHub URL or owner/repo'), { statusCode: 400 });
  return { owner: match[1], repo: match[2] };
}

function projectGraph(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const nodes = state.nodes.filter((node) => node.id === projectId || node.projectId === projectId);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return { project, nodes, edges };
}

function mergeGraphEvidence(state, graph) {
  state.evidence ||= [];
  for (const node of graph.nodes) {
    const index = state.nodes.findIndex((item) => item.id === node.id);
    if (index >= 0) state.nodes[index] = node;
    else state.nodes.push(node);
  }
  for (const edge of graph.edges) {
    edge.id ||= stableEdgeId(edge);
    const key = `${edge.source}:${edge.target}:${edge.relation}`;
    const index = state.edges.findIndex((item) => `${item.source}:${item.target}:${item.relation}` === key);
    if (index >= 0) state.edges[index] = edge;
    else state.edges.push(edge);
  }
  for (const item of graph.evidence) {
    const index = state.evidence.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) state.evidence[index] = item;
    else state.evidence.push(item);
  }
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function requireProject(req, res, next) {
  if (!store.get().projects.some((project) => project.id === req.params.projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  authorizeProject(req.method === 'GET' ? 'viewer' : 'editor')(req, res, next);
}

function requireReadableProject(req, res, next) {
  if (!store.get().projects.some((project) => project.id === req.params.projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  authorizeProject('viewer')(req, res, next);
}

async function persistSnapshot(projectId, snapshot) {
  snapshot.projectId = projectId;
  const previousRecord = store.get().snapshots.filter((item) => item.projectId === projectId).at(-1);
  const previous = previousRecord ? materializeSnapshotIndex(previousRecord) : null;
  snapshot.baseline = !previous;
  const changes = diffSnapshots(previous, snapshot);
  snapshot.changes = changes;
  await store.update((state) => {
    state.snapshots.push(snapshot);
    applySnapshotRetention(state, projectId);
    const project = state.projects.find((item) => item.id === projectId);
    project.lastScan = snapshot.collectedAt;
    project.updatedAt = snapshot.collectedAt;
  });
  return changes;
}

async function ingestManifest(raw, actor, { sourceId = null } = {}) {
  const manifestBody = raw?.manifest || raw;
  const project = store.get().projects.find((item) => item.slug === manifestBody?.project_key || item.id === manifestBody?.project_id);
  if (!project) throw Object.assign(new Error('Manifest project_key does not match a project'), { statusCode: 404 });
  if (!actor.projects.includes('*') && !actor.projects.includes(project.id)) {
    throw Object.assign(new Error('Project access denied'), { statusCode: 403 });
  }
  const imported = importManifest(raw, project.id, {
    requireSignature: process.env.LABLINEAGE_REQUIRE_SIGNED_MANIFESTS === 'true' || process.env.NODE_ENV === 'production',
    trustedFingerprints: (process.env.LABLINEAGE_TRUSTED_COLLECTOR_KEYS || '').split(',').map((item) => item.trim()).filter(Boolean)
  });
  const result = {
    bundleId: imported.manifest.bundle_id,
    nodes: imported.nodes.length,
    edges: imported.edges.length,
    evidence: imported.evidence.length,
    signerFingerprint: imported.signerFingerprint
  };
  const outcome = await store.update((state) => {
    state.importedBundles ||= [];
    state.evidence ||= [];
    const existing = state.importedBundles.find((item) => item.bundleId === result.bundleId);
    if (existing) return { ...existing, idempotent: true };
    for (const node of imported.nodes) {
      const index = state.nodes.findIndex((item) => item.id === node.id);
      if (index >= 0) state.nodes[index] = node;
      else state.nodes.push(node);
    }
    for (const edge of imported.edges) {
      edge.id ||= stableEdgeId(edge);
      const index = state.edges.findIndex((item) => (
        item.source === edge.source &&
        item.target === edge.target &&
        item.relation === edge.relation &&
        (item.evidenceIds?.[0] || '') === (edge.evidenceIds?.[0] || '')
      ));
      if (index >= 0) state.edges[index] = edge;
      else state.edges.push(edge);
    }
    for (const item of imported.evidence) {
      const index = state.evidence.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) state.evidence[index] = item;
      else state.evidence.push(item);
    }
    const importedAt = new Date().toISOString();
    const assets = imported.manifest.records.filter((record) => record.record_type === 'asset');
    const previousSnapshotRecord = state.snapshots
      .filter((snapshot) => snapshot.projectId === project.id && snapshot.sourceId === sourceId)
      .at(-1);
    const previousSnapshot = previousSnapshotRecord ? materializeSnapshotIndex(previousSnapshotRecord) : null;
    const snapshot = {
      id: `snapshot_${imported.manifest.bundle_id}`,
      projectId: project.id,
      sourceId,
      bundleId: imported.manifest.bundle_id,
      collectedAt: imported.manifest.captured_at || importedAt,
      collectorVersion: imported.manifest.collector?.version || 'unknown',
      fileCount: assets.length,
      warnings: imported.manifest.stats?.scan_warnings || [],
      files: assets.filter((record) => record.path_token || record.asset_id).map((record) => ({
        pathToken: record.path_token || record.asset_id,
        contentHash: record.content_hash,
        sizeBytes: record.size_bytes,
        modifiedAt: record.modified_at,
        fingerprint: record.fingerprint
      }))
    };
    snapshot.changes = diffSnapshots(previousSnapshot, snapshot);
    state.snapshots.push(snapshot);
    applySnapshotRetention(state, project.id);
    const stored = { ...result, projectId: project.id, sourceId, snapshotId: snapshot.id, importedAt };
    state.importedBundles.push(stored);
    return stored;
  });
  if (!outcome.idempotent) {
    await store.log({
      action: 'import_manifest',
      resource: `project/${project.id}`,
      actor: actor.subject,
      details: `Imported ${imported.nodes.length} nodes, ${imported.edges.length} edges and ${imported.evidence.length} evidence records.`
    });
  }
  return outcome;
}

function actorCanAccessProject(actor, projectId) {
  return actor.projects.includes('*') || actor.projects.includes(projectId);
}

function snapshotSummaryForApi(snapshot) {
  const { files: _files, changes: _changes, compressedIndex, ...summary } = snapshot;
  return {
    ...summary,
    ...(compressedIndex ? {
      compressedIndex: {
        encoding: compressedIndex.encoding,
        sha256: compressedIndex.sha256,
        originalBytes: compressedIndex.originalBytes,
        compressedBytes: compressedIndex.compressedBytes
      }
    } : {})
  };
}

function publicHandoffReport(report, markdown) {
  const {
    storagePath: _legacyStoragePath,
    storageInternalPath: _storageInternalPath,
    ...publicReport
  } = report;
  return { ...publicReport, ...(markdown === undefined ? {} : { markdown }) };
}

async function loadHandoffReportMarkdown(report) {
  if (report.markdown !== undefined) return report.markdown;
  if (!report.objectKey) throw new Error('Handoff report object key is unavailable');
  const stored = await createObjectStore({ dataDir: store.dataDir }).get(report.objectKey);
  if (stored.sha256 !== report.sha256) {
    throw Object.assign(new Error('Handoff report object checksum mismatch'), { statusCode: 500 });
  }
  return stored.content.toString('utf8');
}

function safeIngestionError(error) {
  const statusCode = error.statusCode || (error instanceof ZodError ? 400 : 500);
  return {
    code: statusCode,
    message: statusCode >= 500 ? 'Internal server error' : error.message,
    ...(error instanceof ZodError ? { issues: error.issues } : {})
  };
}

const ingestionInstanceId = `ingestion-worker_${randomUUID()}`;
const ingestionExecutions = new Map();
const INGESTION_LEASE_MS = 5 * 60 * 1000;
const INGESTION_MAX_ATTEMPTS = 3;

function publicIngestionJob(job) {
  if (!job) return job;
  const {
    payload: _payload,
    payloadObjectKey: _payloadObjectKey,
    payloadStorageUri: _payloadStorageUri,
    payloadStorageGeneration: _payloadStorageGeneration,
    leaseOwner: _leaseOwner,
    ...publicJob
  } = job;
  return publicJob;
}

async function executeIngestionJob(jobId) {
  let claimed;
  await store.update((state) => {
    const job = state.ingestionJobs.find((item) => item.id === jobId);
    if (!job) throw new Error('Ingestion job disappeared');
    const now = Date.now();
    if (['completed', 'failed'].includes(job.status)) {
      claimed = { skip: true, job: structuredClone(job) };
      return;
    }
    if (
      job.status === 'processing'
      && job.leaseOwner !== ingestionInstanceId
      && Date.parse(job.leaseExpiresAt || 0) > now
    ) {
      claimed = { skip: true, job: structuredClone(job) };
      return;
    }
    if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now) {
      claimed = { skip: true, job: structuredClone(job) };
      return;
    }
    if (!job.payload && !job.payloadObjectKey) {
      job.status = 'failed';
      job.error = { code: 500, message: 'Durable ingestion payload is unavailable' };
      job.updatedAt = new Date(now).toISOString();
      job.completedAt = job.updatedAt;
      claimed = { skip: true, job: structuredClone(job) };
      return;
    }
    job.status = 'processing';
    job.attempts = (job.attempts || 0) + 1;
    job.leaseOwner = ingestionInstanceId;
    job.leaseExpiresAt = new Date(now + INGESTION_LEASE_MS).toISOString();
    job.startedAt ||= new Date(now).toISOString();
    job.updatedAt = new Date(now).toISOString();
    delete job.nextAttemptAt;
    claimed = {
      payload: job.payload ? structuredClone(job.payload) : null,
      payloadObjectKey: job.payloadObjectKey,
      payloadSha256: job.payloadSha256,
      sourceId: job.sourceId,
      actor: {
        subject: job.actorSubject,
        roles: job.actorRoles || ['editor'],
        projects: [job.projectId],
        kind: job.actorKind || 'user'
      }
    };
  });
  if (claimed.skip) return publicIngestionJob(claimed.job);

  try {
    let payload = claimed.payload;
    if (!payload && claimed.payloadObjectKey) {
      const storedPayload = await createObjectStore({ dataDir: store.dataDir }).get(claimed.payloadObjectKey);
      if (storedPayload.sha256 !== claimed.payloadSha256) {
        throw Object.assign(new Error('Durable ingestion payload checksum mismatch'), { statusCode: 500 });
      }
      payload = JSON.parse(storedPayload.content.toString('utf8'));
    }
    const result = await ingestManifest(payload, claimed.actor, { sourceId: claimed.sourceId });
    await store.update((state) => {
      const job = state.ingestionJobs.find((item) => item.id === jobId);
      job.status = 'completed';
      job.result = result;
      job.updatedAt = new Date().toISOString();
      job.completedAt = job.updatedAt;
      delete job.payload;
      delete job.payloadObjectKey;
      delete job.payloadStorageUri;
      delete job.payloadStorageGeneration;
      delete job.leaseOwner;
      delete job.leaseExpiresAt;
      delete job.error;
    });
  } catch (error) {
    const safeError = safeIngestionError(error);
    await store.update((state) => {
      const job = state.ingestionJobs.find((item) => item.id === jobId);
      job.updatedAt = new Date().toISOString();
      job.error = safeError;
      delete job.leaseOwner;
      delete job.leaseExpiresAt;
      if (safeError.code >= 500 && job.attempts < INGESTION_MAX_ATTEMPTS) {
        job.status = 'queued';
        job.nextAttemptAt = new Date(Date.now() + (2 ** (job.attempts - 1)) * 1000).toISOString();
      } else {
        job.status = 'failed';
        job.completedAt = job.updatedAt;
        delete job.payload;
        delete job.payloadObjectKey;
        delete job.payloadStorageUri;
        delete job.payloadStorageGeneration;
      }
    });
  }
  return publicIngestionJob(store.get().ingestionJobs.find((item) => item.id === jobId));
}

function scheduleIngestionJob(jobId, delayMs = 0) {
  if (ingestionExecutions.has(jobId)) return;
  const wait = new Promise((resolve) => {
    if (delayMs > 0) {
      const timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    } else {
      setImmediate(resolve);
    }
  });
  const execution = wait
    .then(() => executeIngestionJob(jobId))
    .catch((error) => {
      structuredLog('error', 'ingestion_worker_error', { jobId, error: error.message });
      return null;
    })
    .finally(() => {
      ingestionExecutions.delete(jobId);
      const job = store.get().ingestionJobs.find((item) => item.id === jobId);
      if (job?.status === 'queued') {
        const retryDelay = Math.max(0, Date.parse(job.nextAttemptAt || 0) - Date.now());
        scheduleIngestionJob(jobId, retryDelay);
      }
    });
  ingestionExecutions.set(jobId, execution);
}

async function recoverIngestionJobs() {
  const now = Date.now();
  await store.update((state) => {
    for (const job of state.ingestionJobs || []) {
      if (job.status === 'processing' && Date.parse(job.leaseExpiresAt || 0) <= now) {
        job.status = 'queued';
        delete job.leaseOwner;
        delete job.leaseExpiresAt;
        job.updatedAt = new Date(now).toISOString();
      }
    }
  });
  for (const job of store.get().ingestionJobs || []) {
    if (job.status !== 'queued') continue;
    scheduleIngestionJob(job.id, Math.max(0, Date.parse(job.nextAttemptAt || 0) - Date.now()));
  }
}

export function buildApp({ githubClientFactory = createGitHubClientFromEnv } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.LABLINEAGE_TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  app.use((_req, res, next) => {
    const connectSources = ["'self'"];
    for (const endpoint of [process.env.LABLINEAGE_OIDC_AUTHORIZATION_ENDPOINT, process.env.LABLINEAGE_OIDC_TOKEN_ENDPOINT]) {
      try {
        if (endpoint) connectSources.push(new URL(endpoint).origin);
      } catch {
        // Configuration validation is exposed through /api/client-config.
      }
    }
    res.set({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ${[...new Set(connectSources)].join(' ')}`
    });
    next();
  });
  app.use(requestObservability());
  app.post(
    '/api/webhooks/github',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
    express.raw({ type: 'application/json', limit: '2mb' }),
    async (req, res) => {
    const secret = process.env.LABLINEAGE_GITHUB_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'GitHub webhook is not configured' });
    if (!verifyGitHubWebhook(req.body, req.get('x-hub-signature-256'), secret)) {
      return res.status(401).json({ error: 'GitHub webhook signature is invalid' });
    }
    const deliveryId = req.get('x-github-delivery');
    const eventName = req.get('x-github-event');
    if (!deliveryId || !eventName) return res.status(400).json({ error: 'GitHub delivery and event headers are required' });
    if (typeof store.refresh === 'function') await store.refresh();
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'GitHub webhook payload must be valid JSON' });
    }
    const repository = payload.repository?.full_name;
    const mappings = z.array(z.object({
      projectId: z.string().min(1),
      owner: z.string().min(1),
      repo: z.string().min(1)
    })).parse(JSON.parse(process.env.LABLINEAGE_GITHUB_REPOSITORIES_JSON || '[]'));
    const mapping = mappings.find((item) => `${item.owner}/${item.repo}`.toLowerCase() === String(repository).toLowerCase());
    if (!mapping || !store.get().projects.some((project) => project.id === mapping.projectId)) {
      return res.status(202).json({ accepted: true, ignored: true, reason: 'repository_not_mapped' });
    }
    const graph = githubWebhookToGraph(mapping.projectId, eventName, payload);
    let duplicate = false;
    await store.update((state) => {
      state.githubWebhookDeliveries ||= [];
      if (state.githubWebhookDeliveries.some((item) => item.deliveryId === deliveryId)) {
        duplicate = true;
        return;
      }
      mergeGraphEvidence(state, graph);
      state.githubWebhookDeliveries.unshift({
        deliveryId,
        eventName,
        repository,
        projectId: mapping.projectId,
        receivedAt: new Date().toISOString()
      });
      state.githubWebhookDeliveries = state.githubWebhookDeliveries.slice(0, 10_000);
    });
    if (!duplicate) {
      await store.log({
        action: 'github_webhook',
        actor: `github:${repository}`,
        resource: `project/${mapping.projectId}`,
        details: `Accepted ${eventName} delivery ${deliveryId}; ${graph.evidence.length} evidence records.`
      });
    }
    res.status(202).json({
      accepted: true,
      duplicate,
      event: eventName,
      evidence: duplicate ? 0 : graph.evidence.length
    });
    }
  );
  app.use(express.json({ limit: process.env.API_PAYLOAD_MAX_SIZE || '5mb' }));
  app.post(
    '/mcp/projects/:projectId',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
    requireInternalMcpToken,
    async (req, res) => {
      await handleReadOnlyMcpRequest(store, req, res);
    }
  );

  app.post(
    '/v1/collector/pairings/:pairingId/claim',
    rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }),
    (req, _res, next) => {
      req.actor = { subject: `pairing-claim:${req.params.pairingId}`, roles: [], projects: [], kind: 'pairing' };
      next();
    },
    requireIdempotentWrite,
    async (req, res) => {
      if (typeof store.refresh === 'function') await store.refresh();
      const input = z.object({
        code: z.string().min(8).max(32),
        publicKeyPem: z.string().min(80).max(5_000),
        deviceName: z.string().trim().min(1).max(160),
      }).strict().parse(req.body);
      let claimed;
      await store.update((state) => {
        claimed = claimCollectorPairing(state, { pairingId: req.params.pairingId, ...input });
      });
      await store.log({
        action: 'claim_collector_pairing',
        actor: `service:${claimed.collector.collectorId}`,
        resource: `project/${claimed.collector.projectId}/collector/${claimed.collector.collectorId}`,
        details: `Paired collector fingerprint ${claimed.collector.publicKeyFingerprint.slice(0, 12)}.`,
      });
      res.status(201).json({
        pairing: claimed.pairing,
        collector: claimed.collector,
        source: claimed.source,
        submitUrl: `/v1/projects/${encodeURIComponent(claimed.collector.projectId)}/collector-runs`,
      });
    },
  );

  const requireSignedCollector = async (req, res, next) => {
    try {
      if (typeof store.refresh === 'function') await store.refresh();
      const project = store.get().projects.find((item) => item.id === req.params.projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const imported = importManifest(req.body, project.id, { requireSignature: true });
      if (imported.manifest.project_key !== project.slug && imported.manifest.project_id !== project.id) {
        return res.status(409).json({ error: 'Collector manifest belongs to another project' });
      }
      const authenticated = authenticateCollectorSignature(store.get(), {
        projectId: project.id,
        publicKeyFingerprint: imported.signerFingerprint,
      });
      if (!authenticated) return res.status(401).json({ error: 'Collector is not paired, has expired, or was revoked' });
      req.actor = authenticated.actor;
      req.collectorAuthentication = authenticated;
      req.verifiedCollectorManifest = imported.manifest;
      next();
    } catch (error) {
      next(error);
    }
  };

  app.post(
    '/v1/projects/:projectId/collector-runs',
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    requireSignedCollector,
    requireIdempotentWrite,
    async (req, res) => {
      const manifest = req.verifiedCollectorManifest;
      const content = Buffer.from(JSON.stringify(req.body));
      const inputSha256 = createHash('sha256').update(content).digest('hex');
      const inputObjectKey = `collector-bundles/${req.params.projectId}/${manifest.bundle_id}/${inputSha256}.json`;
      await analysisObjectStore.putImmutable({
        key: inputObjectKey,
        content,
        contentType: 'application/json',
        metadata: {
          projectId: req.params.projectId,
          sourceId: req.collectorAuthentication.source.id,
          bundleId: manifest.bundle_id,
        },
      });
      const sourceRevision = manifest.directory_fingerprint?.value || manifest.bundle_id;
      let created;
      await store.update((state) => {
        created = createAnalysisRun(state, {
          projectId: req.params.projectId,
          sourceId: req.collectorAuthentication.source.id,
          sourceRevision,
          inputKind: 'collector_manifest',
          inputObjectKey,
          inputSha256,
          idempotencyKey: req.get('idempotency-key'),
          actorSubject: req.actor.subject,
        });
      });
      await analysisDispatcher.dispatch(created.run.id);
      if (!created.idempotent) {
        await store.log({
          action: 'queue_collector_analysis',
          actor: req.actor.subject,
          resource: `project/${req.params.projectId}/analysis-run/${created.run.id}`,
          details: `Queued signed collector bundle ${manifest.bundle_id}.`,
        });
      }
      res.status(202).location(`/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`).json({
        sourceId: created.run.sourceId,
        runId: created.run.id,
        statusUrl: `/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`,
        idempotent: created.idempotent,
      });
    },
  );

  app.post(
    '/internal/analysis-worker',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
    (req, res, next) => runtimeDeployment.mode === 'google_cloud'
      ? next()
      : res.status(404).json({ error: 'Cloud analysis worker is not enabled' }),
    authenticateCloudTask(),
    async (req, res) => {
      const input = z.object({ runId: z.string().min(1).max(200) }).strict().parse(req.body);
      const taskName = req.get('x-cloudtasks-taskname');
      if (!taskName) return res.status(400).json({ error: 'Cloud Tasks request metadata is required' });
      const run = (store.get().analysisRuns || []).find((item) => item.id === input.runId);
      if (!run) return res.status(404).json({ error: 'Analysis run not found' });
      const completed = await executeAnalysisRun(store, run.id, {
        objectStore: analysisObjectStore,
        leaseOwner: `cloud-task:${taskName}`,
      });
      res.json({ runId: run.id, status: completed.status });
    },
  );

  app.use('/v1', authenticateRequest());
  app.use('/v1', async (_req, _res, next) => {
    try {
      if (typeof store.refresh === 'function') await store.refresh();
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use('/v1/projects/:projectId/agent', rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false }));
  app.use('/v1/manifests', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => {
    const deployment = publicDeploymentCapabilities();
    res.json({
      status: 'ok',
      version: '0.3.0',
      deployment,
      authMode: authMode(),
      database: deployment.database,
      adkConfigured: guardianModelConfigured(),
      model: process.env.LABLINEAGE_MODEL || 'gemini-2.5-flash'
    });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      if (typeof store.refresh === 'function') await store.refresh();
      res.json({ status: 'ready', deployment: publicDeploymentCapabilities() });
    } catch (error) {
      structuredLog('error', 'readiness_failed', { error: error.message });
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.get('/api/client-config', (_req, res) => {
    const mode = authMode();
    const issuer = process.env.LABLINEAGE_OIDC_ISSUER;
    const clientId = process.env.LABLINEAGE_OIDC_CLIENT_ID;
    const authorizationEndpoint = process.env.LABLINEAGE_OIDC_AUTHORIZATION_ENDPOINT;
    const tokenEndpoint = process.env.LABLINEAGE_OIDC_TOKEN_ENDPOINT;
    const enabled = mode === 'oidc' && Boolean(issuer && clientId && authorizationEndpoint && tokenEndpoint);
    res.json({
      mode,
      enabled,
      ...(enabled ? {
        issuer,
        clientId,
        authorizationEndpoint,
        tokenEndpoint,
        redirectUri: process.env.LABLINEAGE_OIDC_REDIRECT_URI || undefined,
        scope: process.env.LABLINEAGE_OIDC_SCOPE || 'openid profile email'
      } : {})
    });
  });
  app.get('/api/version', (_req, res) => {
    res.json({
      api: 'v1',
      implementation: '0.3.0',
      manifestSchema: 'lablineage.manifest.v1',
      collectorMinimumNode: '22.15'
    });
  });
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));

  app.get('/v1/setup', authorizeRole('admin'), (_req, res) => res.json(store.get().setupConfig));
  app.put('/v1/setup', authorizeRole('admin'), requireIdempotentWrite, async (req, res) => {
    const email = z.union([z.literal(''), z.email()]);
    const input = z.object({
      institutionName: z.string().max(200),
      labName: z.string().max(200),
      adminDisplayName: z.string().max(200),
      adminEmail: email,
      dataResidency: z.string().max(50),
      defaultRegion: z.string().max(100).refine(
        (value) => value === '' || CLOUD_RUN_REGIONS.has(value),
        'defaultRegion must be an allowed Cloud Run region or empty'
      ),
      defaultTimezone: z.string().max(100),
      notificationLanguage: z.string().max(20),
      defaultProjectName: z.string().max(200),
      defaultProjectSlug: z.string().regex(/^[a-z0-9-]*$/).max(100)
    }).strict().parse(req.body);
    await store.update((state) => { state.setupConfig = { ...state.setupConfig, ...input }; });
    await store.log({ action: 'update_setup_config', actor: req.actor.subject, resource: 'system/config', details: 'Configuration updated.' });
    res.status(204).end();
  });

  app.get('/v1/integrations/status', (_req, res) => {
    const deployment = publicDeploymentCapabilities();
    res.json({
      github: { configured: Boolean(process.env.GITHUB_TOKEN || (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_INSTALLATION_ID && process.env.GITHUB_APP_PRIVATE_KEY)), mode: 'read-only' },
      workspace: {
        configured: Boolean(
          (process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || (process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN)) &&
          process.env.GOOGLE_DRIVE_FOLDER_ID &&
          process.env.GOOGLE_SHEETS_SPREADSHEET_ID
        ),
        drive: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
        sheets: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
        gmail: 'drafts-only'
      },
      collector: {
        signedManifestsRequired: process.env.LABLINEAGE_REQUIRE_SIGNED_MANIFESTS === 'true' || process.env.NODE_ENV === 'production',
        trustedKeys: (process.env.LABLINEAGE_TRUSTED_COLLECTOR_KEYS || '').split(',').filter(Boolean).length
      },
      objectStorage: {
        mode: deployment.objectStorage,
        configured: deployment.objectStorage === 'local' || Boolean(process.env.LABLINEAGE_GCS_BUCKET),
        immutableWrites: true
      },
      deployment
    });
  });

  app.get('/v1/capabilities', (req, res) => {
    const deployment = publicDeploymentCapabilities();
    const oidcReady = authMode() === 'oidc' && Boolean(
      process.env.LABLINEAGE_OIDC_ISSUER &&
      process.env.LABLINEAGE_OIDC_AUDIENCE &&
      process.env.LABLINEAGE_OIDC_JWKS_URL
    );
    const queueReady = deployment.taskDispatcher === 'inline' || Boolean(
      process.env.LABLINEAGE_TASKS_QUEUE && process.env.LABLINEAGE_TASKS_LOCATION &&
      process.env.LABLINEAGE_ANALYSIS_WORKER_URL && process.env.LABLINEAGE_TASKS_AUDIENCE &&
      process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT
    );
    res.json({
      actor: { subject: req.actor.subject, kind: req.actor.kind, roles: req.actor.roles },
      capabilities: [
        { id: 'api', title: 'Guardian API', state: 'ready', detail: 'Evidence, lineage, audit, agent and handoff routes are running.' },
        { id: 'deployment', title: 'Deployment profile', state: deployment.explicit ? 'configured' : 'development', detail: `${deployment.mode}: ${deployment.database}, ${deployment.objectStorage}, ${deployment.taskDispatcher}.` },
        { id: 'postgres', title: 'PostgreSQL evidence store', state: postgresConfigured() ? 'configured' : deployment.mode === 'local' ? 'optional' : 'not_configured', detail: postgresConfigured() ? 'DATABASE_URL is configured; run migrations before production use.' : 'Local JSON store is active.' },
        { id: 'auth', title: 'OIDC and project RBAC', state: oidcReady ? 'configured' : authMode() === 'development' ? 'development' : 'not_configured', detail: `Authentication mode: ${authMode()}.` },
        { id: 'collector', title: 'Signed Edge Collector', state: 'ready', detail: 'CLI, SQLite incremental index, static parsers, path tokens and Ed25519 bundles are implemented.' },
        { id: 'github', title: 'GitHub read-only connector', state: (process.env.GITHUB_TOKEN || (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_INSTALLATION_ID && process.env.GITHUB_APP_PRIVATE_KEY)) ? 'configured' : 'not_configured', detail: 'Uses a read-only GitHub App installation token or GITHUB_TOKEN.' },
        { id: 'workspace', title: 'Google Workspace handoff', state: ((process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || (process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN)) && process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) ? 'configured' : 'not_configured', detail: 'Drive report, idempotent Sheets row and Gmail draft only.' },
        { id: 'object-storage', title: 'Immutable report object storage', state: deployment.objectStorage === 'local' ? 'configured' : process.env.LABLINEAGE_GCS_BUCKET ? 'configured' : 'not_configured', detail: deployment.objectStorage === 'local' ? 'Atomic local object store is active.' : 'Google Cloud Storage with generation preconditions is active.' },
        { id: 'analysis-queue', title: 'Automatic analysis dispatcher', state: queueReady ? 'configured' : 'not_configured', detail: deployment.taskDispatcher === 'inline' ? 'Durable runs use the local inline worker with lease recovery.' : 'Cloud Tasks invokes the private worker with OIDC.' },
        { id: 'adk', title: 'Google ADK Guardian Agent', state: guardianModelConfigured() ? 'configured' : 'not_configured', detail: `Model: ${process.env.LABLINEAGE_MODEL || 'gemini-2.5-flash'}.` },
        { id: 'runtime', title: 'Runtime / Registry / Gateway', state: deployment.mode === 'google_cloud' ? 'configured' : 'development', detail: deployment.mode === 'google_cloud' ? 'Google Cloud production profile is active.' : 'Local workstation profile is active.' }
      ]
    });
  });

  app.get('/v1/security/summary', authorizeRole('admin'), (req, res) => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const events = store.get().auditEvents || [];
    const deniedLast24Hours = events.filter((event) => (
      ['denied', 'failed'].includes(event.status) &&
      Date.parse(event.timestamp) >= since
    )).length;
    res.json({
      actor: {
        subject: req.actor.subject,
        kind: req.actor.kind,
        roles: req.actor.roles
      },
      serviceActors: serviceActorSummaries(),
      deniedLast24Hours
    });
  });

  app.get('/v1/projects', (_req, res) => {
    const visible = _req.actor.projects.includes('*')
      ? store.get().projects
      : store.get().projects.filter((project) => _req.actor.projects.includes(project.id));
    res.json(visible.map((project) => projectSummary(store.get(), project.id)));
  });
  app.post('/v1/projects', authorizeRole('admin'), requireIdempotentWrite, async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return res.status(400).json({ error: 'Project name must produce a non-empty slug' });
    if (store.get().projects.some((item) => item.slug === slug)) {
      return res.status(409).json({ error: 'Project slug already exists' });
    }
    const project = {
      id: `project_${randomUUID()}`,
      name: input.name,
      slug,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.update((state) => {
      if (state.projects.some((item) => item.slug === slug)) {
        throw Object.assign(new Error('Project slug already exists'), { statusCode: 409 });
      }
      state.evidence ||= [];
      state.projects.push(project);
      state.nodes.push({ id: project.id, projectId: project.id, type: 'Project', label: project.name, status: 'accepted', humanConfirmed: true, evidenceIds: [] });
      appendProjectIntent(state, {
        projectId: project.id,
        objective: input.objective,
        successCriteria: input.successCriteria,
        keyOutputs: input.keyOutputs,
        constraints: input.constraints,
        actorSubject: req.actor.subject,
        version: 1,
        now: project.createdAt
      });
    });
    await store.log({ action: 'create_project', actor: req.actor.subject, resource: `project/${project.id}`, details: `Created project ${project.slug}.` });
    res.status(201).json(projectDetail(store.get(), project.id));
  });

  app.get('/v1/projects/:projectId', requireProject, (req, res) => {
    res.json(projectDetail(store.get(), req.params.projectId));
  });

  app.post('/v1/projects/:projectId/intent-versions', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = createIntentVersionSchema.parse(req.body);
    let intent;
    try {
      await store.update((state) => {
        intent = appendNextProjectIntent(state, req.params.projectId, input, req.actor.subject);
      });
    } catch (error) {
      if (error instanceof IntentVersionConflictError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    await store.log({
      action: 'create_project_intent_version',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `Created project intent version ${intent.version}.`
    });
    res.status(201).json(intent);
  });

  app.get('/v1/projects/:projectId/collectors', requireProject, (req, res) => {
    const pairings = (store.get().collectorPairings || [])
      .filter((item) => item.projectId === req.params.projectId)
      .map(publicCollectorPairing);
    const collectors = (store.get().collectorCredentials || [])
      .filter((item) => item.projectId === req.params.projectId)
      .map(publicCollectorCredential);
    res.json({ pairings, collectors });
  });

  app.post(
    '/v1/projects/:projectId/collector-pairings',
    requireProject,
    authorizeRole('editor'),
    requireIdempotentWrite,
    async (req, res) => {
      const input = z.object({ expiresInSeconds: z.number().int().min(60).max(900).default(600) }).strict().parse(req.body || {});
      let created;
      await store.update((state) => {
        created = createCollectorPairing(state, {
          projectId: req.params.projectId,
          actorSubject: req.actor.subject,
          expiresInMs: input.expiresInSeconds * 1000,
        });
      });
      await store.log({
        action: 'create_collector_pairing',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}/pairing/${created.pairing.id}`,
        details: `Created collector pairing expiring at ${created.pairing.expiresAt}.`,
      });
      res.status(201).json({ ...created.pairing, code: created.code });
    },
  );

  app.post(
    '/v1/projects/:projectId/collectors/:collectorId/revoke',
    requireProject,
    authorizeRole('admin'),
    requireIdempotentWrite,
    async (req, res) => {
      z.object({ confirmation: z.literal('REVOKE_COLLECTOR') }).strict().parse(req.body);
      const candidate = (store.get().collectorCredentials || []).find((item) => item.collectorId === req.params.collectorId);
      if (!candidate || candidate.projectId !== req.params.projectId) return res.status(404).json({ error: 'Collector not found' });
      let collector;
      await store.update((state) => {
        collector = revokeCollectorCredential(state, {
          collectorId: req.params.collectorId,
          actorSubject: req.actor.subject,
        });
      });
      await store.log({
        action: 'revoke_collector',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}/collector/${req.params.collectorId}`,
        details: 'Revoked collector access and disconnected its source.',
      });
      res.json(collector);
    },
  );

  app.get('/v1/projects/:projectId/analysis-runs', requireProject, (req, res) => {
    const runs = (store.get().analysisRuns || [])
      .filter((run) => run.projectId === req.params.projectId)
      .sort((left, right) => Date.parse(right.createdAt || right.queuedAt) - Date.parse(left.createdAt || left.queuedAt))
      .map((run) => publicAnalysisRun(store.get(), run.id));
    res.json({ runs });
  });

  app.get('/v1/projects/:projectId/analysis-runs/:runId', requireProject, (req, res) => {
    const run = (store.get().analysisRuns || []).find((item) => item.id === req.params.runId);
    if (!run || run.projectId !== req.params.projectId) return res.status(404).json({ error: 'Analysis run not found' });
    res.json(publicAnalysisRun(store.get(), run.id));
  });

  app.post('/v1/projects/:projectId/analysis-runs/:runId/retry', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      expectedVersion: z.number().int().min(1),
      confirmation: z.literal('RETRY_ANALYSIS_RUN'),
    }).strict().parse(req.body);
    const candidate = (store.get().analysisRuns || []).find((item) => item.id === req.params.runId);
    if (!candidate || candidate.projectId !== req.params.projectId) return res.status(404).json({ error: 'Analysis run not found' });
    let run;
    await store.update((state) => {
      run = retryAnalysisRun(state, {
        runId: req.params.runId,
        expectedVersion: input.expectedVersion,
        actorSubject: req.actor.subject,
      });
    });
    await store.log({
      action: 'retry_analysis_run',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}/analysis-run/${run.id}`,
      details: `Retried analysis from ${run.currentStep}.`,
    });
    await analysisDispatcher.dispatch(run.id);
    res.status(202).json(publicAnalysisRun(store.get(), run.id));
  });

  app.post('/v1/projects/:projectId/analysis-runs/:runId/cancel', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      expectedVersion: z.number().int().min(1),
      confirmation: z.literal('CANCEL_ANALYSIS_RUN'),
    }).strict().parse(req.body);
    const candidate = (store.get().analysisRuns || []).find((item) => item.id === req.params.runId);
    if (!candidate || candidate.projectId !== req.params.projectId) return res.status(404).json({ error: 'Analysis run not found' });
    let run;
    await store.update((state) => {
      run = cancelAnalysisRun(state, {
        runId: req.params.runId,
        expectedVersion: input.expectedVersion,
        actorSubject: req.actor.subject,
      });
    });
    await store.log({
      action: 'cancel_analysis_run',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}/analysis-run/${run.id}`,
      details: 'Cancelled pending analysis work.',
    });
    res.status(202).json(publicAnalysisRun(store.get(), run.id));
  });

  app.get('/v1/projects/:projectId/analysis-runs/:runId/report', requireProject, async (req, res) => {
    const run = (store.get().analysisRuns || []).find((item) => item.id === req.params.runId);
    if (!run || run.projectId !== req.params.projectId) return res.status(404).json({ error: 'Analysis run not found' });
    const report = (store.get().analysisReports || []).find((item) => item.runId === run.id);
    if (!report) return res.status(404).json({ error: 'Analysis report not found' });
    let document = report.document;
    if (!document && report.objectKey) {
      const storedObject = await createObjectStore({ dataDir: store.dataDir }).get(report.objectKey);
      if (storedObject.sha256 !== report.sha256) throw new Error('Analysis report object checksum mismatch');
      document = JSON.parse(storedObject.content.toString('utf8'));
    }
    const { objectKey: _objectKey, storageUri: _storageUri, document: _document, ...metadata } = report;
    res.json({ ...metadata, document });
  });

  app.post(
    '/v1/projects/:projectId/sources/github',
    requireProject,
    authorizeRole('editor'),
    requireIdempotentWrite,
    async (req, res) => {
      const input = z.object({
        repository: z.string().trim().min(3).max(300),
        branch: z.string().trim().min(1).max(250).optional(),
      }).strict().parse(req.body);
      const { owner, repo } = parseGitHubRepository(input.repository);
      const client = await githubClientFactory();
      let evidence;
      try {
        evidence = await client.collectRepository(owner, repo, { branch: input.branch, limit: 100 });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || error?.code === 'ABORT_ERR') {
          error.statusCode = 504;
        }
        throw error;
      }
      evidence.capturedAt = new Date().toISOString();
      const sourceRevision = evidence.repositorySnapshot?.headSha;
      if (!sourceRevision) throw Object.assign(new Error('GitHub did not return an immutable head revision'), { statusCode: 502 });
      let archive;
      try {
        archive = await client.downloadRepositoryArchive(owner, repo, sourceRevision);
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || error?.code === 'ABORT_ERR') error.statusCode = 504;
        throw error;
      }
      const archiveSha256 = createHash('sha256').update(archive.content).digest('hex');
      const archiveObjectKey = `analysis-inputs/${req.params.projectId}/github/${sourceRevision}/${archiveSha256}.zip`;
      await analysisObjectStore.putImmutable({
        key: archiveObjectKey,
        content: archive.content,
        contentType: 'application/zip',
        metadata: { projectId: req.params.projectId, provider: 'github', sourceRevision },
      });
      const content = Buffer.from(`${JSON.stringify({
        schemaVersion: 'lablineage.github-analysis-input.v1',
        evidence,
        archive: { objectKey: archiveObjectKey, sha256: archiveSha256, sizeBytes: archive.sizeBytes },
      })}\n`);
      const digest = createHash('sha256').update(content).digest('hex');
      const objectKey = `analysis-inputs/${req.params.projectId}/github/${sourceRevision}/${digest}.json`;
      await analysisObjectStore.putImmutable({
        key: objectKey,
        content,
        contentType: 'application/json',
        metadata: { projectId: req.params.projectId, provider: 'github', sourceRevision },
      });
      const now = evidence.capturedAt;
      const idempotencyKey = req.get('Idempotency-Key');
      let source;
      let created;
      await store.update((state) => {
        source = (state.sources || []).find((item) => (
          item.projectId === req.params.projectId
          && item.type === 'github'
          && item.repositoryFullName?.toLowerCase() === evidence.repository.fullName.toLowerCase()
          && item.branch === (input.branch || evidence.repository.defaultBranch)
          && item.status === 'active'
        ));
        if (!source) {
          source = {
            id: `src_${randomUUID()}`,
            projectId: req.params.projectId,
            name: evidence.repository.fullName,
            type: 'github',
            provider: 'github_app',
            networkMode: 'cloud_pull',
            status: 'active',
            repositoryFullName: evidence.repository.fullName,
            repositoryUrl: evidence.repository.htmlUrl,
            branch: input.branch || evidence.repository.defaultBranch,
            accessPolicy: { contents: 'read', metadata: 'read', actions: 'read', pullRequests: 'read', writes: false },
            createdAt: now,
            updatedAt: now,
          };
          state.sources ||= [];
          state.sources.push(source);
        } else {
          source.updatedAt = now;
        }
        created = createAnalysisRun(state, {
          projectId: req.params.projectId,
          sourceId: source.id,
          sourceRevision,
          inputKind: 'github',
          inputObjectKey: objectKey,
          inputSha256: digest,
          idempotencyKey,
          actorSubject: req.actor.subject,
        });
      });
      await store.log({
        action: 'connect_github_source',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}/source/${source.id}`,
        details: `Queued read-only analysis for ${evidence.repository.fullName} at immutable revision ${sourceRevision}.`,
      });
      await analysisDispatcher.dispatch(created.run.id);
      res.status(202).location(`/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`).json({
        sourceId: source.id,
        runId: created.run.id,
        statusUrl: `/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`,
        idempotent: created.idempotent,
      });
    },
  );

  app.get('/v1/projects/:projectId/sources', requireProject, (req, res) => {
    res.json((store.get().sources || []).filter((source) => source.projectId === req.params.projectId));
  });

  app.post('/v1/projects/:projectId/sources', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      name: z.string().min(1).max(160),
      type: z.enum(['filesystem', 'github', 'google_drive', 'offline_bundle']),
      networkMode: z.enum(['connected', 'outbound_only', 'air_gapped']),
      exportPolicy: z.object({
        rawFileContent: z.literal(false).default(false),
        rawPaths: z.literal(false).default(false),
        signedBundlesRequired: z.boolean().default(true)
      }).default({ rawFileContent: false, rawPaths: false, signedBundlesRequired: true })
    }).parse(req.body);
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = (store.get().sources || []).find((source) => (
      source.projectId === req.params.projectId && source.idempotencyKey === idempotencyKey
    ));
    if (existing) {
      if (existing.requestSha256 !== payloadHash) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
      }
      return res.json({ ...existing, idempotent: true });
    }
    const now = new Date().toISOString();
    const source = {
      id: `src_${randomUUID()}`,
      projectId: req.params.projectId,
      ...input,
      status: 'active',
      idempotencyKey,
      requestSha256: payloadHash,
      createdAt: now,
      updatedAt: now
    };
    await store.update((state) => {
      state.sources ||= [];
      state.sources.push(source);
    });
    await store.log({
      action: 'register_source',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}/source/${source.id}`,
      details: `Registered ${source.type} source in ${source.networkMode} mode.`
    });
    res.status(201).location(`/v1/sources/${source.id}`).json(source);
  });

  app.post('/v1/sources/:sourceId/disconnect', authorizeRole('admin'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({ confirmation: z.literal('DISCONNECT_SOURCE') }).parse(req.body);
    const source = (store.get().sources || []).find((item) => item.id === req.params.sourceId);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (!actorCanAccessProject(req.actor, source.projectId)) return res.status(403).json({ error: 'Project access denied' });
    if (source.status === 'disconnected') return res.json({ ...source, idempotent: true });
    await store.update((state) => {
      const current = state.sources.find((item) => item.id === source.id);
      current.status = 'disconnected';
      current.updatedAt = new Date().toISOString();
      current.disconnectedAt = current.updatedAt;
      current.disconnectedBy = req.actor.subject;
    });
    await store.log({
      action: 'disconnect_source',
      actor: req.actor.subject,
      resource: `project/${source.projectId}/source/${source.id}`,
      details: 'Source access disabled; historical evidence retained.'
    });
    res.json(store.get().sources.find((item) => item.id === source.id));
  });

  app.get('/v1/sources/:sourceId/changes', (req, res) => {
    const source = (store.get().sources || []).find((item) => item.id === req.params.sourceId);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (!actorCanAccessProject(req.actor, source.projectId)) return res.status(403).json({ error: 'Project access denied' });
    const snapshots = store.get().snapshots.filter((snapshot) => snapshot.sourceId === source.id);
    const latest = snapshots.at(-1);
    res.json(latest ? materializeSnapshotIndex(latest).changes || [] : []);
  });

  app.get('/v1/sources/:sourceId/snapshots', (req, res) => {
    const source = (store.get().sources || []).find((item) => item.id === req.params.sourceId);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (!actorCanAccessProject(req.actor, source.projectId)) return res.status(403).json({ error: 'Project access denied' });
    res.json(store.get().snapshots
      .filter((snapshot) => snapshot.sourceId === source.id)
      .map(snapshotSummaryForApi));
  });

  app.post('/v1/sources/:sourceId/bundles', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const source = (store.get().sources || []).find((item) => item.id === req.params.sourceId);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    if (source.status !== 'active') return res.status(409).json({ error: 'Source is disconnected' });
    if (!actorCanAccessProject(req.actor, source.projectId)) return res.status(403).json({ error: 'Project access denied' });
    const manifestBody = req.body?.manifest || req.body;
    const project = store.get().projects.find((item) => item.id === source.projectId);
    if (!manifestBody?.bundle_id) return res.status(400).json({ error: 'bundle_id is required' });
    if (manifestBody.project_key !== project.slug && manifestBody.project_id !== project.id) {
      return res.status(409).json({ error: 'Bundle project does not match the registered source project' });
    }
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const existing = (store.get().ingestionJobs || []).find((job) => (
      job.sourceId === source.id && (job.bundleId === manifestBody.bundle_id || job.idempotencyKey === idempotencyKey)
    ));
    if (existing) {
      if (existing.bundleId !== manifestBody.bundle_id || existing.idempotencyKey !== idempotencyKey) {
        return res.status(409).json({ error: 'Bundle or Idempotency-Key conflicts with an existing ingestion job' });
      }
      return res.status(202).location(`/v1/ingestion-jobs/${existing.id}`).json(publicIngestionJob(existing));
    }
    const now = new Date().toISOString();
    const serializedPayload = JSON.stringify(req.body);
    const payloadSha256 = createHash('sha256').update(serializedPayload).digest('hex');
    const jobId = `job_${randomUUID()}`;
    const payloadObjectKey = `ingestion/${source.projectId}/${jobId}/attempt-0.json`;
    const storedPayload = await createObjectStore({ dataDir: store.dataDir }).putImmutable({
      key: payloadObjectKey,
      content: serializedPayload,
      contentType: 'application/json',
      metadata: {
        projectId: source.projectId,
        sourceId: source.id,
        bundleId: manifestBody.bundle_id,
        jobId,
        sha256: payloadSha256
      }
    });
    const job = {
      id: jobId,
      projectId: source.projectId,
      sourceId: source.id,
      bundleId: manifestBody.bundle_id,
      idempotencyKey,
      payloadSha256,
      payloadBytes: Buffer.byteLength(serializedPayload),
      payloadObjectKey,
      payloadStorageUri: storedPayload.uri,
      payloadStorageGeneration: storedPayload.generation || null,
      status: 'queued',
      actorSubject: req.actor.subject,
      actorRoles: req.actor.roles,
      actorKind: req.actor.kind,
      attempts: 0,
      createdAt: now,
      updatedAt: now
    };
    await store.update((state) => {
      state.ingestionJobs ||= [];
      state.ingestionJobs.push(job);
    });
    scheduleIngestionJob(job.id);
    res.status(202).location(`/v1/ingestion-jobs/${job.id}`).json(publicIngestionJob(job));
  });

  app.get('/v1/ingestion-jobs/:jobId', (req, res) => {
    const job = (store.get().ingestionJobs || []).find((item) => item.id === req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Ingestion job not found' });
    if (!actorCanAccessProject(req.actor, job.projectId)) return res.status(403).json({ error: 'Project access denied' });
    res.json(publicIngestionJob(job));
  });

  app.post('/v1/ingestion-jobs/:jobId/retry', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      confirmation: z.literal('RETRY_INGESTION_JOB'),
      manifest: z.record(z.string(), z.unknown())
    }).parse(req.body);
    const job = (store.get().ingestionJobs || []).find((item) => item.id === req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Ingestion job not found' });
    if (!actorCanAccessProject(req.actor, job.projectId)) return res.status(403).json({ error: 'Project access denied' });
    if (job.status !== 'failed') return res.status(409).json({ error: 'Only a failed ingestion job can be retried' });
    const source = (store.get().sources || []).find((item) => item.id === job.sourceId);
    if (!source || source.status !== 'active') return res.status(409).json({ error: 'Source is unavailable or disconnected' });
    const project = store.get().projects.find((item) => item.id === job.projectId);
    if (input.manifest.bundle_id !== job.bundleId) {
      return res.status(409).json({ error: 'Retry manifest must preserve the original bundle_id' });
    }
    if (input.manifest.project_key !== project.slug && input.manifest.project_id !== project.id) {
      return res.status(409).json({ error: 'Retry manifest does not match the ingestion project' });
    }

    const serialized = JSON.stringify(input.manifest);
    const retrySequence = (job.retryCount || 0) + 1;
    const payloadSha256 = createHash('sha256').update(serialized).digest('hex');
    const payloadObjectKey = `ingestion/${job.projectId}/${job.id}/retry-${retrySequence}.json`;
    const storedPayload = await createObjectStore({ dataDir: store.dataDir }).putImmutable({
      key: payloadObjectKey,
      content: serialized,
      contentType: 'application/json',
      metadata: {
        projectId: job.projectId,
        sourceId: job.sourceId,
        bundleId: job.bundleId,
        jobId: job.id,
        retrySequence,
        sha256: payloadSha256
      }
    });
    await store.update((state) => {
      const current = state.ingestionJobs.find((item) => item.id === job.id);
      current.errorHistory ||= [];
      if (current.error) current.errorHistory.push({ ...current.error, recordedAt: current.completedAt || current.updatedAt });
      current.status = 'queued';
      delete current.payload;
      current.payloadObjectKey = payloadObjectKey;
      current.payloadStorageUri = storedPayload.uri;
      current.payloadStorageGeneration = storedPayload.generation || null;
      current.payloadSha256 = payloadSha256;
      current.payloadBytes = Buffer.byteLength(serialized);
      current.idempotencyKey = req.get('idempotency-key');
      current.actorSubject = req.actor.subject;
      current.actorRoles = req.actor.roles;
      current.actorKind = req.actor.kind;
      current.attempts = 0;
      current.retryCount = (current.retryCount || 0) + 1;
      current.updatedAt = new Date().toISOString();
      delete current.error;
      delete current.completedAt;
      delete current.startedAt;
      delete current.nextAttemptAt;
    });
    scheduleIngestionJob(job.id);
    res.status(202).location(`/v1/ingestion-jobs/${job.id}`).json(
      publicIngestionJob(store.get().ingestionJobs.find((item) => item.id === job.id))
    );
  });

  app.post('/v1/lineage-edges/:edgeId/review', authorizeRole('auditor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      decision: z.enum(['confirm', 'reject']),
      comment: z.string().min(1).max(2000),
      reviewer: z.string().email().optional()
    }).parse(req.body);
    const edge = store.get().edges.find((item) => item.id === req.params.edgeId);
    if (!edge) return res.status(404).json({ error: 'Lineage edge not found' });
    const sourceNode = store.get().nodes.find((node) => node.id === edge.source);
    if (!sourceNode?.projectId || !actorCanAccessProject(req.actor, sourceNode.projectId)) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const existing = (edge.reviews || []).find((review) => review.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.decision !== input.decision || existing.comment !== input.comment) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with a different review' });
      }
      return res.json({ ...existing, idempotent: true });
    }
    const review = {
      id: `review_${randomUUID()}`,
      edgeId: edge.id,
      projectId: sourceNode.projectId,
      decision: input.decision,
      comment: input.comment,
      reviewer: req.actor.subject,
      idempotencyKey,
      createdAt: new Date().toISOString()
    };
    const evidenceId = `ev_${randomUUID()}`;
    await store.update((state) => {
      const current = state.edges.find((item) => item.id === edge.id);
      current.reviews ||= [];
      current.reviews.push(review);
      current.reviewStatus = input.decision === 'confirm' ? 'confirmed' : 'rejected';
      current.originalConfidence ||= current.confidence;
      if (input.decision === 'confirm') current.confidence = 'human_verified';
      current.evidenceIds = [...new Set([...(current.evidenceIds || []), evidenceId])];
      state.evidence.push({
        id: evidenceId,
        projectId: sourceNode.projectId,
        evidenceType: 'human_review',
        source: 'authenticated_reviewer',
        capturedAt: review.createdAt,
        payload: {
          edgeId: edge.id,
          decision: review.decision,
          comment: review.comment,
          reviewer: review.reviewer
        }
      });
    });
    await store.log({
      action: 'review_lineage_edge',
      actor: req.actor.subject,
      resource: `project/${sourceNode.projectId}/edge/${edge.id}`,
      details: `Edge review decision: ${input.decision}.`
    });
    res.status(201).json(review);
  });

  app.post('/v1/assets/:assetId/status-proposals', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      proposed_status: z.enum(['candidate', 'accepted', 'superseded', 'quarantined', 'duplicate']),
      reason: z.string().min(1).max(2000),
      replacement_asset_id: z.string().min(1).max(200).optional()
    }).parse(req.body);
    const asset = store.get().nodes.find((node) => node.id === req.params.assetId && node.type !== 'Project');
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (!actorCanAccessProject(req.actor, asset.projectId)) return res.status(403).json({ error: 'Project access denied' });
    if (input.replacement_asset_id) {
      const replacement = store.get().nodes.find((node) => node.id === input.replacement_asset_id);
      if (!replacement || replacement.projectId !== asset.projectId) {
        return res.status(400).json({ error: 'Replacement asset must exist in the same project' });
      }
    }
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = (store.get().statusProposals || []).find((proposal) => (
      proposal.projectId === asset.projectId && proposal.idempotencyKey === idempotencyKey
    ));
    if (existing) {
      if (existing.requestSha256 !== payloadHash) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with a different proposal' });
      }
      return res.json({ ...existing, idempotent: true });
    }
    const proposal = {
      id: `status_proposal_${randomUUID()}`,
      projectId: asset.projectId,
      assetId: asset.id,
      proposedStatus: input.proposed_status,
      reason: input.reason,
      replacementAssetId: input.replacement_asset_id || null,
      status: 'pending',
      proposedBy: req.actor.subject,
      idempotencyKey,
      requestSha256: payloadHash,
      createdAt: new Date().toISOString()
    };
    await store.update((state) => {
      state.statusProposals ||= [];
      state.statusProposals.push(proposal);
    });
    await store.log({
      action: 'propose_asset_status',
      actor: req.actor.subject,
      resource: `project/${asset.projectId}/asset/${asset.id}`,
      details: `Proposed ${input.proposed_status}; formal asset status was not changed.`
    });
    res.status(201).json(proposal);
  });

  app.post('/v1/projects/:projectId/lineage-proposals', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      nodes: z.array(z.object({
        pathToken: z.string().min(1),
        kind: z.enum(LINEAGE_NODE_TYPES),
        label: z.string().min(1).max(200).optional()
      })).min(1).max(100),
      edges: z.array(z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        relation: z.enum(LINEAGE_RELATIONS)
      })).min(1).max(200),
      rationale: z.string().max(2000).optional()
    }).parse(req.body);
    const latest = store.get().snapshots
      .filter((snapshot) => snapshot.projectId === req.params.projectId)
      .at(-1);
    if (!latest) {
      return res.status(409).json({ error: 'Scan or import a project first: lineage candidates require a snapshot with file evidence' });
    }
    const snapshotFiles = materializeSnapshotIndex(latest).files;
    const proposal = prepareLineageProposal(req.params.projectId, input, snapshotFiles, req.actor.subject);
    let addedNodes = 0;
    let addedEdges = 0;
    let addedEvidence = 0;
    await store.update((state) => {
      state.lineageProposals ||= [];
      const existingProposal = state.lineageProposals.find((item) => item.proposalId === proposal.proposalId);
      if (existingProposal) return;
      for (const node of proposal.nodes) {
        const index = state.nodes.findIndex((item) => item.id === node.id);
        if (index >= 0) state.nodes[index] = node;
        else { state.nodes.push(node); addedNodes += 1; }
      }
      for (const edge of proposal.edges) {
        const exists = state.edges.some((item) => item.source === edge.source && item.target === edge.target && item.relation === edge.relation);
        if (!exists) { state.edges.push(edge); addedEdges += 1; }
      }
      for (const evidence of proposal.evidence) {
        const index = state.evidence.findIndex((item) => item.id === evidence.id);
        if (index < 0) { state.evidence.push(evidence); addedEvidence += 1; }
      }
      state.lineageProposals.push(proposal);
    });
    await store.log({
      action: 'apply_lineage_proposal',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `Applied inferred lineage proposal ${proposal.proposalId}: ${addedNodes} nodes, ${addedEdges} edges, ${addedEvidence} evidence records.`
    });
    res.status(201).json({
      proposalId: proposal.proposalId,
      addedNodes,
      addedEdges,
      addedEvidence,
      nodes: proposal.nodes,
      edges: proposal.edges,
      confidence: 'inferred',
      requiresHumanReview: true
    });
  });
  app.get('/v1/projects/:projectId/lineage-proposals', requireProject, (req, res) => {
    res.json((store.get().lineageProposals || [])
      .filter((item) => item.projectId === req.params.projectId)
      .map((item) => ({
        proposalId: item.proposalId,
        source: item.source,
        actor: item.actor,
        rationale: item.rationale,
        nodeCount: item.nodes.length,
        edgeCount: item.edges.length,
        createdAt: item.createdAt
      })));
  });

  app.get('/v1/projects/:projectId/summary', requireProject, (req, res) => {
    res.json(projectSummary(store.get(), req.params.projectId));
  });
  app.get('/v1/projects/:projectId/lineage', requireProject, (req, res) => {
    const graph = projectGraph(store.get(), req.params.projectId);
    res.json({ nodes: graph.nodes, edges: graph.edges });
  });
  app.get('/v1/projects/:projectId/findings', requireProject, (req, res) => {
    const graph = projectGraph(store.get(), req.params.projectId);
    const ids = new Set(graph.nodes.map((node) => node.id));
    res.json(store.get().findings.filter((finding) => (
      finding.status === 'open' &&
      (finding.projectId === req.params.projectId || finding.affectedEntities.some((id) => ids.has(id)))
    )));
  });
  app.post('/v1/projects/:projectId/findings/:findingId/resolve', requireProject, authorizeRole('auditor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      confirmation: z.literal('RESOLVE_FINDING'),
      note: z.string().trim().max(1000).optional()
    }).parse(req.body);
    let resolved;
    await store.update((state) => {
      const finding = state.findings.find((item) => (
        item.id === req.params.findingId && item.projectId === req.params.projectId
      ));
      if (!finding) throw Object.assign(new Error('Finding not found'), { statusCode: 404 });
      if (finding.status === 'resolved') {
        resolved = { finding, idempotent: true };
        return;
      }
      finding.status = 'resolved';
      finding.resolution = {
        actor: req.actor.subject,
        resolvedAt: new Date().toISOString(),
        note: input.note || 'Manually resolved after review.'
      };
      resolved = { finding, idempotent: false };
    });
    if (!resolved.idempotent) {
      await store.log({
        action: 'resolve_finding',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}/finding/${req.params.findingId}`,
        details: input.note || 'Manually resolved after review.'
      });
    }
    res.status(resolved.idempotent ? 200 : 201).json(resolved);
  });
  app.get('/v1/projects/:projectId/evidence', requireProject, (req, res) => {
    const input = z.object({
      type: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }).parse(req.query);
    const evidence = (store.get().evidence || [])
      .filter((item) => item.projectId === req.params.projectId && (!input.type || item.evidenceType === input.type))
      .sort((left, right) => String(right.capturedAt).localeCompare(String(left.capturedAt)))
      .slice(0, input.limit);
    res.json(evidence);
  });
  app.get('/v1/projects/:projectId/evidence/:evidenceId', requireProject, (req, res) => {
    const evidence = (store.get().evidence || []).find((item) => item.projectId === req.params.projectId && item.id === req.params.evidenceId);
    if (!evidence) return res.status(404).json({ error: 'Evidence not found' });
    res.json(evidence);
  });
  app.get('/v1/projects/:projectId/handoff', requireProject, (req, res) => {
    res.json(store.get().handoffs.find((handoff) => handoff.projectId === req.params.projectId) || {
      status: 'draft', departingMember: '', receivingMember: '', dueDate: '', workspaceLinks: {}
    });
  });

  // ---- HandoffOrder domain: repeatable, approvable, versioned orders ----
  const CLOUD_RUN_REGIONS = new Set([
    'asia-east1', 'asia-east2', 'asia-northeast1', 'asia-northeast2', 'asia-northeast3',
    'asia-south1', 'asia-south2', 'asia-southeast1', 'asia-southeast2',
    'australia-southeast1', 'australia-southeast2',
    'europe-central2', 'europe-north1', 'europe-southwest1', 'europe-west1', 'europe-west2',
    'europe-west3', 'europe-west4', 'europe-west6', 'europe-west8', 'europe-west9',
    'me-central1', 'me-central2', 'me-west1',
    'northamerica-northeast1', 'northamerica-northeast2',
    'southamerica-east1', 'southamerica-west1',
    'us-central1', 'us-east1', 'us-east4', 'us-east5', 'us-south1', 'us-west1', 'us-west2', 'us-west3', 'us-west4'
  ]);

  const requireHandoffOrder = (req, res, next) => {
    const order = (store.get().handoffOrders || []).find((item) => item.id === req.params.handoffId);
    if (!order) return res.status(404).json({ error: 'Handoff order not found' });
    req.handoffOrder = order;
    next();
  };

  const appendHandoffEvent = (state, order, eventType, actorSubject, payload = {}) => {
    state.handoffEvents ||= [];
    state.handoffEvents.push({
      id: `he_${randomUUID()}`,
      orderId: order.id,
      eventType,
      actorSubject,
      payload,
      createdAt: new Date().toISOString()
    });
  };

  const orderView = (state, order) => ({
    ...order,
    overdue: computeOverdue(order),
    tasks: (state.handoffTasks || []).filter((task) => task.orderId === order.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    reviews: (state.handoffReviews || []).filter((review) => review.orderId === order.id),
    exports: (state.handoffExports || []).filter((item) => item.orderId === order.id)
  });

  const handoffTaskInputSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default('')
  });
  const orderInputSchema = z.object({
    departingSubject: z.string().min(1).max(200),
    departingEmailSnapshot: z.email(),
    receivingSubject: z.string().min(1).max(200),
    receivingEmailSnapshot: z.email(),
    reviewerSubject: z.string().min(1).max(200),
    reviewerEmailSnapshot: z.email(),
    dueAt: z.union([z.literal(''), z.iso.datetime()]),
    dueTimezone: z.string().max(100).default('UTC'),
    tasks: z.array(handoffTaskInputSchema).max(50).default([])
  });
  const versionBodySchema = z.object({ expectedVersion: z.number().int().positive() });

  app.get('/v1/projects/:projectId/handoffs', requireProject, (req, res) => {
    const state = store.get();
    let visible = (state.handoffOrders || [])
      .filter((order) => order.projectId === req.params.projectId)
      .map((order) => orderView(state, order));
    if (req.query.status) visible = visible.filter((order) => order.status === req.query.status);
    if (req.query.filter === 'needs_review') {
      visible = visible.filter((order) => order.reviewerSubject === req.actor.subject && ['submitted', 'in_review'].includes(order.status));
    }
    if (req.query.filter === 'needs_accept') {
      visible = visible.filter((order) => order.receivingSubject === req.actor.subject && order.status === 'approved');
    }
    if (req.query.filter === 'overdue') visible = visible.filter((order) => order.overdue);
    visible.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ orders: visible });
  });

  app.post('/v1/projects/:projectId/handoffs', requireProject, requireIdempotentWrite, async (req, res) => {
    const input = orderInputSchema.parse(req.body);
    const createdAt = new Date().toISOString();
    let created;
    await store.update((state) => {
      state.handoffOrders ||= [];
      const orderNumber = nextOrderNumber(state.handoffOrders);
      created = {
        id: `handoff_order_${randomUUID()}`,
        projectId: req.params.projectId,
        orderNumber,
        departingSubject: input.departingSubject,
        departingEmailSnapshot: input.departingEmailSnapshot,
        receivingSubject: input.receivingSubject,
        receivingEmailSnapshot: input.receivingEmailSnapshot,
        reviewerSubject: input.reviewerSubject,
        reviewerEmailSnapshot: input.reviewerEmailSnapshot,
        dueAt: input.dueAt || null,
        dueTimezone: input.dueTimezone,
        status: 'draft',
        version: 1,
        createdAt,
        updatedAt: createdAt
      };
      state.handoffOrders.push(created);
      state.handoffTasks ||= [];
      for (const [index, task] of input.tasks.entries()) {
        state.handoffTasks.push({
          id: `ht_${randomUUID()}`,
          orderId: created.id,
          title: task.title,
          description: task.description,
          status: 'pending',
          sortOrder: index,
          createdAt
        });
      }
      appendHandoffEvent(state, created, 'created', req.actor.subject, { orderNumber });
    });
    await store.log({ action: 'create_handoff_order', actor: req.actor.subject, resource: `project/${req.params.projectId}/handoffs/${created.id}`, details: 'Handoff order created.' });
    res.status(201).json(orderView(store.get(), created));
  });

  app.get('/v1/handoffs/:handoffId', requireHandoffOrder, (_req, res) => {
    res.json(orderView(store.get(), _req.handoffOrder));
  });

  app.patch('/v1/handoffs/:handoffId', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    const patch = z.object({
      expectedVersion: z.number().int().positive(),
      departingSubject: z.string().min(1).max(200).optional(),
      departingEmailSnapshot: z.email().optional(),
      receivingSubject: z.string().min(1).max(200).optional(),
      receivingEmailSnapshot: z.email().optional(),
      reviewerSubject: z.string().min(1).max(200).optional(),
      reviewerEmailSnapshot: z.email().optional(),
      dueAt: z.union([z.literal(''), z.iso.datetime()]).optional(),
      dueTimezone: z.string().max(100).optional(),
      tasks: z.array(handoffTaskInputSchema).max(50).optional()
    }).parse(req.body);
    try {
      assertVersion(req.handoffOrder, patch.expectedVersion);
      assertEditable(req.handoffOrder);
    } catch (error) {
      if (error instanceof HandoffVersionConflictError || error instanceof HandoffStateError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    let updated;
    await store.update((state) => {
      const order = (state.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!order) throw new Error('Handoff order was removed');
      assertVersion(order, patch.expectedVersion);
      assertEditable(order);
      if (patch.departingSubject !== undefined) order.departingSubject = patch.departingSubject;
      if (patch.departingEmailSnapshot !== undefined) order.departingEmailSnapshot = patch.departingEmailSnapshot;
      if (patch.receivingSubject !== undefined) order.receivingSubject = patch.receivingSubject;
      if (patch.receivingEmailSnapshot !== undefined) order.receivingEmailSnapshot = patch.receivingEmailSnapshot;
      if (patch.reviewerSubject !== undefined) order.reviewerSubject = patch.reviewerSubject;
      if (patch.reviewerEmailSnapshot !== undefined) order.reviewerEmailSnapshot = patch.reviewerEmailSnapshot;
      if (patch.dueAt !== undefined) order.dueAt = patch.dueAt || null;
      if (patch.dueTimezone !== undefined) order.dueTimezone = patch.dueTimezone;
      order.version += 1;
      order.updatedAt = new Date().toISOString();
      if (patch.tasks) {
        state.handoffTasks = (state.handoffTasks || []).filter((task) => task.orderId !== order.id);
        for (const [index, task] of patch.tasks.entries()) {
          state.handoffTasks.push({
            id: `ht_${randomUUID()}`,
            orderId: order.id,
            title: task.title,
            description: task.description,
            status: 'pending',
            sortOrder: index,
            createdAt: new Date().toISOString()
          });
        }
      }
      appendHandoffEvent(state, order, 'updated', req.actor.subject, { version: order.version });
      updated = order;
    });
    res.json(orderView(store.get(), updated));
  });

  const applyTransition = async (req, res, target, extraCheck) => {
    let expectedVersion;
    try {
      expectedVersion = versionBodySchema.parse(req.body).expectedVersion;
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.message });
      throw error;
    }
    try {
      assertVersion(req.handoffOrder, expectedVersion);
      assertTransition(req.handoffOrder, target);
      if (extraCheck) extraCheck(req.handoffOrder);
    } catch (error) {
      if (error instanceof HandoffVersionConflictError || error instanceof HandoffStateError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    let updated;
    await store.update((state) => {
      const order = (state.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!order) throw new Error('Handoff order was removed');
      assertVersion(order, expectedVersion);
      order.status = target;
      order.version += 1;
      order.updatedAt = new Date().toISOString();
      appendHandoffEvent(state, order, target, req.actor.subject, { expectedVersion });
      updated = order;
    });
    res.json(orderView(store.get(), updated));
  };

  app.post('/v1/handoffs/:handoffId/submit', requireHandoffOrder, requireIdempotentWrite, (req, res) =>
    applyTransition(req, res, 'submitted'));
  app.post('/v1/handoffs/:handoffId/cancel', requireHandoffOrder, requireIdempotentWrite, (req, res) =>
    applyTransition(req, res, 'cancelled'));

  app.post('/v1/handoffs/:handoffId/reviews', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      expectedVersion: z.number().int().positive(),
      decision: z.enum(['approved', 'changes_requested']),
      comment: z.string().min(1).max(2000)
    }).parse(req.body);
    const order = req.handoffOrder;
    try {
      assertReviewer(order, req.actor.subject);
      assertVersion(order, input.expectedVersion);
      if (order.status === 'submitted') assertTransition(order, 'in_review');
      if (order.status !== 'submitted' && order.status !== 'in_review') {
        throw new HandoffStateError(`Handoff order must be submitted or in_review to record a review (current: ${order.status})`);
      }
    } catch (error) {
      if (error instanceof HandoffStateError || error instanceof HandoffVersionConflictError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    let updated;
    await store.update((state) => {
      const current = (state.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!current) throw new Error('Handoff order was removed');
      assertVersion(current, input.expectedVersion);
      if (current.status === 'submitted') {
        current.status = 'in_review';
        appendHandoffEvent(state, current, 'in_review', req.actor.subject, { expectedVersion: input.expectedVersion });
      }
      current.status = input.decision === 'approved' ? 'approved' : 'changes_requested';
      current.version += 1;
      current.updatedAt = new Date().toISOString();
      state.handoffReviews ||= [];
      state.handoffReviews.push({
        id: `hr_${randomUUID()}`,
        orderId: current.id,
        reviewerSubject: req.actor.subject,
        decision: input.decision,
        comment: input.comment,
        createdAt: new Date().toISOString()
      });
      appendHandoffEvent(state, current, input.decision, req.actor.subject, { comment: input.comment, reviewer: req.actor.subject });
      updated = current;
    });
    res.json(orderView(store.get(), updated));
  });

  app.post('/v1/handoffs/:handoffId/accept', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    try {
      assertVersion(req.handoffOrder, versionBodySchema.parse(req.body).expectedVersion);
      assertReceiver(req.handoffOrder, req.actor.subject);
      assertTransition(req.handoffOrder, 'receiver_accepted');
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.message });
      if (error instanceof HandoffStateError || error instanceof HandoffVersionConflictError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    const state = store.get();
    let updated;
    await store.update((draft) => {
      const order = (draft.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!order) throw new Error('Handoff order was removed');
      order.status = 'receiver_accepted';
      order.version += 1;
      order.updatedAt = new Date().toISOString();
      appendHandoffEvent(draft, order, 'receiver_accepted', req.actor.subject, { receiver: req.actor.subject });
      updated = order;
    });
    res.json(orderView(state, updated));
  });

  app.post('/v1/handoffs/:handoffId/complete', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    try {
      assertVersion(req.handoffOrder, versionBodySchema.parse(req.body).expectedVersion);
      assertTransition(req.handoffOrder, 'completed');
    } catch (error) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.message });
      if (error instanceof HandoffStateError || error instanceof HandoffVersionConflictError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    const state = store.get();
    const reviews = (state.handoffReviews || []).filter((review) => review.orderId === req.params.handoffId);
    const tasks = (state.handoffTasks || []).filter((task) => task.orderId === req.params.handoffId);
    if (!canComplete(req.handoffOrder, reviews, tasks)) {
      const missing = [];
      if (!reviews.some((review) => review.decision === 'approved')) missing.push('an approving reviewer decision');
      if (tasks.length > 0 && !tasks.every((task) => task.status === 'done')) missing.push('all handoff tasks done');
      return res.status(409).json({ error: `Handoff completion requires: ${missing.join(', ')}` });
    }
    let updated;
    await store.update((draft) => {
      const order = (draft.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!order) throw new Error('Handoff order was removed');
      order.status = 'completed';
      order.version += 1;
      order.updatedAt = new Date().toISOString();
      appendHandoffEvent(draft, order, 'completed', req.actor.subject, {});
      updated = order;
    });
    res.json(orderView(store.get(), updated));
  });

  app.get('/v1/handoffs/:handoffId/events', requireHandoffOrder, (_req, res) => {
    const events = (store.get().handoffEvents || [])
      .filter((event) => event.orderId === _req.params.handoffId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    res.json({ events });
  });

  app.post('/v1/handoffs/:handoffId/tasks/:taskId/status', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      expectedVersion: z.number().int().positive(),
      status: z.enum(['pending', 'done', 'blocked'])
    }).parse(req.body);
    const order = req.handoffOrder;
    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(409).json({ error: `Handoff tasks cannot be updated in status ${order.status}` });
    }
    try {
      assertVersion(order, input.expectedVersion);
    } catch (error) {
      if (error instanceof HandoffVersionConflictError) return res.status(409).json({ error: error.message });
      throw error;
    }
    let updated;
    await store.update((state) => {
      const current = (state.handoffOrders || []).find((item) => item.id === req.params.handoffId);
      if (!current) throw new Error('Handoff order was removed');
      assertVersion(current, input.expectedVersion);
      const task = (state.handoffTasks || []).find((item) => item.id === req.params.taskId && item.orderId === current.id);
      if (!task) throw new Error('Handoff task not found for this order');
      task.status = input.status;
      current.version += 1;
      current.updatedAt = new Date().toISOString();
      appendHandoffEvent(state, current, 'task_status', req.actor.subject, { taskId: task.id, status: input.status });
      updated = current;
    });
    res.json(orderView(store.get(), updated));
  });

  const previewForOrder = (state, order) => {
    const summary = projectSummary(state, order.projectId);
    const payload = buildHandoffPayload({
      summary,
      findings: (state.findings || []).filter((finding) => finding.projectId === order.projectId && finding.status === 'open'),
      recipient: order.receivingEmailSnapshot
    });
    return {
      action: 'preview',
      orderId: order.id,
      orderNumber: order.orderNumber,
      drive: { name: `${summary.name}-handoff-${order.orderNumber}.md`, bytes: Buffer.byteLength(payload.report) },
      sheets: { auditId: (state.audits || []).find((audit) => audit.projectId === order.projectId)?.id || order.id, row: payload.ledgerRow },
      gmail: { to: order.receivingEmailSnapshot, subject: payload.subject, mode: 'draft-only' }
    };
  };

  app.post('/v1/handoffs/:handoffId/exports/preview', requireHandoffOrder, requireIdempotentWrite, (req, res) => {
    const preview = previewForOrder(store.get(), req.handoffOrder);
    res.json({ preview, sha256: createHash('sha256').update(JSON.stringify(preview)).digest('hex') });
  });

  app.post('/v1/handoffs/:handoffId/exports/execute', requireHandoffOrder, requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      expectedVersion: z.number().int().positive(),
      previewSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      confirmation: z.literal('EXPORT_TO_GOOGLE_WORKSPACE')
    }).parse(req.body);
    const order = req.handoffOrder;
    if (!['receiver_accepted', 'completed'].includes(order.status)) {
      return res.status(409).json({ error: 'Workspace export requires an approved and receiver-accepted handoff order' });
    }
    const preview = previewForOrder(store.get(), order);
    const actualSha256 = createHash('sha256').update(JSON.stringify(preview)).digest('hex');
    if (actualSha256 !== input.previewSha256) {
      return res.status(409).json({ error: 'previewSha256 does not match the current order preview; regenerate the preview' });
    }
    try {
      assertVersion(order, input.expectedVersion);
    } catch (error) {
      if (error instanceof HandoffVersionConflictError) return res.status(409).json({ error: error.message });
      throw error;
    }
    let exportId;
    await store.update((draft) => {
      draft.handoffExports ||= [];
      const record = {
        id: `hex_${randomUUID()}`,
        orderId: order.id,
        kind: 'workspace',
        previewSha256: input.previewSha256,
        status: 'in_progress',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      draft.handoffExports.push(record);
      appendHandoffEvent(draft, order, 'export_started', req.actor.subject, { exportId: record.id, previewSha256: input.previewSha256 });
      exportId = record.id;
    });
    try {
      const client = await createGoogleWorkspaceClientFromEnv();
      const summary = projectSummary(store.get(), order.projectId);
      const payload = buildHandoffPayload({
        summary,
        findings: (store.get().findings || []).filter((finding) => finding.projectId === order.projectId && finding.status === 'open'),
        recipient: order.receivingEmailSnapshot
      });
      const drive = await client.createDriveReport({
        name: `${summary.name}-handoff-${order.orderNumber}.md`,
        markdown: payload.report,
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        idempotencyKey: `${req.headers['idempotency-key']}:${exportId}:drive`
      });
      await client.appendSheetOnce({
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: process.env.GOOGLE_SHEETS_RANGE || 'Audit!A:E',
        values: [[payload.ledgerRow]],
        idempotencyKey: `${req.headers['idempotency-key']}:${exportId}:sheets`
      });
      const draftResult = await client.createGmailDraft({
        to: order.receivingEmailSnapshot,
        subject: payload.subject,
        markdown: payload.report,
        idempotencyKey: `${req.headers['idempotency-key']}:${exportId}:gmail`
      });
      await store.update((draft) => {
        const record = draft.handoffExports.find((item) => item.id === exportId);
        if (!record) throw new Error('Handoff export record was lost');
        Object.assign(record, {
          status: 'succeeded',
          driveFileId: drive.id,
          gmailDraftId: draftResult.id,
          updatedAt: new Date().toISOString()
        });
        const orderRecord = (draft.handoffOrders || []).find((item) => item.id === order.id);
        if (orderRecord) appendHandoffEvent(draft, orderRecord, 'export_succeeded', req.actor.subject, { exportId, sent: false });
      });
      res.json({ status: 'succeeded', exportId, driveFileId: drive.id, gmailDraftId: draftResult.id, sent: false });
    } catch (error) {
      await store.update((draft) => {
        const record = draft.handoffExports.find((item) => item.id === exportId);
        if (record) {
          record.status = 'failed';
          record.updatedAt = new Date().toISOString();
        }
        const orderRecord = (draft.handoffOrders || []).find((item) => item.id === order.id);
        if (orderRecord) appendHandoffEvent(draft, orderRecord, 'export_failed', req.actor.subject, { exportId, error: error instanceof Error ? error.message : 'unknown' });
      });
      const message = error instanceof Error ? error.message : 'Workspace export failed';
      return res.status(502).json({ error: message });
    }
  });
  app.get('/v1/projects/:projectId/audit-events', requireProject, (req, res) => {
    res.json(store.get().auditEvents.filter((event) => event.resource === `project/${req.params.projectId}` || event.resource?.startsWith(`project/${req.params.projectId}/`)));
  });

  app.post('/v1/projects/:projectId/nodes/:nodeId/confirm', requireProject, authorizeRole('auditor'), requireIdempotentWrite, async (req, res) => {
    let found = false;
    await store.update((state) => {
      const node = state.nodes.find((item) => item.id === req.params.nodeId);
      if (node) {
        found = true;
        node.humanConfirmed = true;
        node.status = 'accepted';
      }
    });
    if (!found) return res.status(404).json({ error: 'Node not found' });
    await store.log({ action: 'confirm_node', actor: req.actor.subject, resource: `project/${req.params.projectId}/node/${req.params.nodeId}`, details: 'Human confirmed inferred node.' });
    res.status(204).end();
  });

  app.post('/v1/projects/:projectId/snapshots', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      path: z.string().min(1),
      includeTextDiff: z.boolean().default(false),
      confirmation: z.string().optional()
    }).superRefine((value, context) => {
      if (value.includeTextDiff && value.confirmation !== 'ALLOW_TEXT_DIFF') {
        context.addIssue({
          code: 'custom',
          path: ['confirmation'],
          message: 'ALLOW_TEXT_DIFF confirmation is required when text capture is enabled'
        });
      }
    }).parse(req.body);
    if (input.includeTextDiff && process.env.NODE_ENV === 'production' && process.env.LABLINEAGE_ALLOW_TEXT_DIFF !== 'true') {
      return res.status(403).json({ error: 'Text diff capture is disabled by deployment policy' });
    }
    const snapshot = await scanDirectory(input.path, { includeTextContent: input.includeTextDiff });
    const changes = await persistSnapshot(req.params.projectId, snapshot);
    await store.log({ action: 'scan_directory', actor: req.actor.subject, resource: `project/${req.params.projectId}`, details: `Captured ${snapshot.fileCount} files; ${changes.length} changes.` });
    res.status(201).json({ snapshot: snapshotSummaryForApi(snapshot), changes });
  });
  app.post('/v1/projects/:projectId/archives', requireProject, authorizeRole('editor'), uploadArchiveMiddleware, requireIdempotentWrite, async (req, res) => {
    try {
      // Validate the full central directory before accepting the immutable input.
      await extractArchive(req.upload.zipPath, req.upload.tempDir);
      const content = await readFile(req.upload.zipPath);
      const objectKey = `analysis-inputs/${req.params.projectId}/zip/${req.upload.sha256}.zip`;
      await analysisObjectStore.putImmutable({
        key: objectKey,
        content,
        contentType: 'application/zip',
        metadata: { projectId: req.params.projectId, sourceRevision: req.upload.sha256 },
      });
      const now = new Date().toISOString();
      const source = {
        id: `src_${randomUUID()}`,
        projectId: req.params.projectId,
        name: req.upload.filename.slice(0, 160),
        type: 'offline_bundle',
        networkMode: 'one_time_upload',
        status: 'active',
        exportPolicy: { rawFileContent: false, rawPaths: false, signedBundlesRequired: false },
        createdAt: now,
        updatedAt: now,
      };
      let created;
      await store.update((state) => {
        state.sources ||= [];
        state.sources.push(source);
        created = createAnalysisRun(state, {
          projectId: req.params.projectId,
          sourceId: source.id,
          sourceRevision: req.upload.sha256,
          inputKind: 'zip',
          inputObjectKey: objectKey,
          inputSha256: req.upload.sha256,
          idempotencyKey: req.get('Idempotency-Key'),
          actorSubject: req.actor.subject,
        });
      });
      await store.log({ action: 'queue_zip_analysis', actor: req.actor.subject, resource: `project/${req.params.projectId}/source/${source.id}`, details: `Queued one-time ZIP analysis for ${req.upload.filename} (${req.upload.sizeBytes} bytes).` });
      await analysisDispatcher.dispatch(created.run.id);
      res.status(202).location(`/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`).json({
        sourceId: source.id,
        runId: created.run.id,
        statusUrl: `/v1/projects/${req.params.projectId}/analysis-runs/${created.run.id}`,
        idempotent: created.idempotent,
      });
    } finally {
      await rm(req.upload.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
  app.get('/v1/projects/:projectId/changes', requireProject, (req, res) => {
    const snapshots = store.get().snapshots.filter((item) => item.projectId === req.params.projectId);
    const latest = snapshots.at(-1);
    if (!latest) return res.json([]);
    const materializedLatest = materializeSnapshotIndex(latest);
    const previous = snapshots.at(-2);
    res.json(materializedLatest.changes || diffSnapshots(
      previous ? materializeSnapshotIndex(previous) : null,
      materializedLatest
    ));
  });
  app.get('/v1/projects/:projectId/snapshots', requireProject, (req, res) => {
    const snapshots = store.get().snapshots
      .filter((item) => item.projectId === req.params.projectId)
      .map(snapshotSummaryForApi);
    res.json(snapshots);
  });
  app.get('/v1/projects/:projectId/snapshots/:snapshotId/diff', requireProject, (req, res) => {
    const snapshots = store.get().snapshots.filter((item) => item.projectId === req.params.projectId);
    const index = snapshots.findIndex((item) => item.id === req.params.snapshotId);
    if (index < 0) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(diffSnapshots(
      index > 0 ? materializeSnapshotIndex(snapshots[index - 1]) : null,
      materializeSnapshotIndex(snapshots[index])
    ));
  });

  app.post('/v1/manifests', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const result = await ingestManifest(req.body, req.actor);
    res.status(result.idempotent ? 200 : 202).json(result);
  });

  app.post('/v1/manifests/batch', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({ manifests: z.array(z.unknown()).min(1).max(20) }).parse(req.body);
    const results = [];
    for (let index = 0; index < input.manifests.length; index += 1) {
      try {
        const result = await ingestManifest(input.manifests[index], req.actor);
        results.push({ index, status: 'accepted', ...result });
      } catch (error) {
        const code = error.statusCode || (error instanceof ZodError ? 400 : 500);
        results.push({
          index,
          status: 'rejected',
          code,
          error: code >= 500 ? 'Internal server error' : error.message,
          ...(error instanceof ZodError ? { issues: error.issues } : {})
        });
      }
    }
    const accepted = results.filter((item) => item.status === 'accepted').length;
    res.status(207).json({ accepted, rejected: results.length - accepted, results });
  });

  app.post('/v1/projects/:projectId/audits', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const graph = projectGraph(store.get(), req.params.projectId);
    const audit = createAudit(req.params.projectId, graph.nodes, graph.edges);
    await store.update((state) => {
      state.audits.unshift({ ...audit, findings: undefined });
      const findingKey = (finding) => (
        `${finding.projectId}:${finding.type}:${[...finding.affectedEntities].sort().join(',')}`
      );
      const existingByKey = new Map(state.findings.map((finding) => [findingKey(finding), finding]));
      for (const finding of audit.findings) {
        const existing = existingByKey.get(findingKey(finding));
        if (!existing) {
          state.findings.unshift(finding);
          existingByKey.set(findingKey(finding), finding);
          continue;
        }
        if (existing.status === 'resolved' && existing.resolution) {
          existing.resolutionHistory ||= [];
          existing.resolutionHistory.push(existing.resolution);
          delete existing.resolution;
          existing.reopenedAt = new Date().toISOString();
        }
        Object.assign(existing, finding, { status: 'open' });
      }
    });
    await store.log({ action: 'run_audit', actor: req.actor.subject, resource: `project/${req.params.projectId}`, details: `Reproducibility ${audit.level} (${audit.score}/100), ${audit.findings.length} derived findings.` });
    res.status(201).json(audit);
  });

  app.post('/v1/projects/:projectId/github/sync', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      owner: z.string().min(1).max(100),
      repo: z.string().min(1).max(100),
      branch: z.string().max(250).optional(),
      limit: z.number().int().min(1).max(100).optional()
    }).parse(req.body);
    const client = await createGitHubClientFromEnv();
    const evidence = await client.collectRepository(input.owner, input.repo, input);
    const graph = githubEvidenceToGraph(req.params.projectId, evidence);
    await store.update((state) => {
      mergeGraphEvidence(state, graph);
    });
    await store.log({
      action: 'github_sync',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `Synchronized ${evidence.repository.fullName}: ${evidence.commits.length} commits, ${evidence.pullRequests.length} pull requests and ${evidence.workflowRuns.length} workflow runs.`
    });
    res.status(202).json({
      repository: evidence.repository,
      commits: evidence.commits.length,
      pullRequests: evidence.pullRequests.length,
      workflowRuns: evidence.workflowRuns.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      evidence: graph.evidence.length
    });
  });

  app.post('/v1/projects/:projectId/repositories/sync', requireProject, authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.discriminatedUnion('provider', [
      z.object({
        provider: z.literal('github'),
        owner: z.string().min(1).max(100),
        repo: z.string().min(1).max(100),
        branch: z.string().max(250).optional(),
        limit: z.number().int().min(1).max(100).optional()
      }),
      z.object({
        provider: z.literal('local_git'),
        path: z.string().min(1).max(4096),
        branch: z.string().max(250).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        treeLimit: z.number().int().min(1).max(100_000).optional()
      })
    ]).parse(req.body);
    const evidence = input.provider === 'github'
      ? await (await createGitHubClientFromEnv()).collectRepository(input.owner, input.repo, input)
      : await new LocalGitClient().collectRepository(input.path, input);
    const graph = githubEvidenceToGraph(req.params.projectId, evidence);
    await store.update((state) => {
      mergeGraphEvidence(state, graph);
    });
    await store.log({
      action: 'repository_sync',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `Synchronized ${input.provider} repository ${evidence.repository.fullName}: ${evidence.commits.length} commits and ${evidence.repositorySnapshot?.tree.length || 0} tree entries.`
    });
    res.status(202).json({
      provider: input.provider,
      repository: evidence.repository,
      commits: evidence.commits.length,
      pullRequests: evidence.pullRequests.length,
      workflowRuns: evidence.workflowRuns.length,
      treeEntries: evidence.repositorySnapshot?.tree.length || 0,
      treeTruncated: evidence.repositorySnapshot?.treeTruncated || false,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      evidence: graph.evidence.length
    });
  });

  app.get('/v1/artifacts/:artifactId/lineage', (req, res) => {
    const state = store.get();
    const root = state.nodes.find((node) => node.id === req.params.artifactId);
    if (!root) return res.status(404).json({ error: 'Artifact not found' });
    const projectId = root.projectId || state.projects[0]?.id;
    if (!req.actor.projects.includes('*') && !req.actor.projects.includes(projectId)) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const depth = Math.min(Number(req.query.depth || 4), 8);
    const ids = new Set([root.id]);
    for (let step = 0; step < depth; step += 1) {
      for (const edge of state.edges) {
        if (ids.has(edge.source) || ids.has(edge.target)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
    }
    const nodes = state.nodes.filter((node) => ids.has(node.id));
    const edges = state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const audit = createAudit(root.projectId || state.projects[0].id, nodes, edges);
    const evidenceIds = new Set([
      ...(root.evidenceIds || []),
      ...edges.flatMap((edge) => edge.evidenceIds || [])
    ]);
    const evidence = (state.evidence || []).filter((item) => item.projectId === projectId && evidenceIds.has(item.id));
    res.json({ root, nodes, edges, evidence, reproducibility: { level: audit.level, score: audit.score, verifiedRerun: audit.verifiedRerun, missing: audit.missing } });
  });

  app.get('/v1/projects/:projectId/agent/conversations', requireReadableProject, async (req, res) => {
    const sessionService = new GuardianSessionService(store, req.params.projectId);
    res.json({ conversations: await sessionService.listConversations(req.actor.subject) });
  });

  app.post(
    '/v1/projects/:projectId/agent/conversations',
    requireReadableProject,
    requireIdempotentWrite,
    async (req, res) => {
      const input = z.object({ title: z.string().min(1).max(200).optional() }).parse(req.body);
      const sessionService = new GuardianSessionService(store, req.params.projectId);
      const conversation = await sessionService.createConversation(req.actor.subject, input.title);
      await store.log({
        action: 'agent_conversation_create',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}`,
        details: `Created ADK conversation ${conversation.id}`
      });
      res.status(201).json(conversation);
    }
  );

  app.delete(
    '/v1/projects/:projectId/agent/conversations/:conversationId',
    requireReadableProject,
    requireIdempotentWrite,
    async (req, res) => {
      const conversationId = z.string().min(8).max(100).parse(req.params.conversationId);
      const sessionService = new GuardianSessionService(store, req.params.projectId);
      await sessionService.deleteSession({
        appName: sessionService.appName,
        userId: req.actor.subject,
        sessionId: conversationId
      });
      await store.log({
        action: 'agent_conversation_clear',
        actor: req.actor.subject,
        resource: `project/${req.params.projectId}`,
        details: `Cleared ADK conversation ${conversationId}`
      });
      res.status(204).end();
    }
  );

  app.post('/v1/projects/:projectId/agent', requireReadableProject, requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      message: z.string().min(1).max(8_000),
      conversationId: z.string().min(8).max(100)
    }).parse(req.body);
    const mcpUrl = `http://127.0.0.1:${req.socket.localPort}/mcp/projects/${encodeURIComponent(req.params.projectId)}`;
    const result = await runGuardianAgent(store, {
      projectId: req.params.projectId,
      message: input.message,
      userId: req.actor.subject,
      conversationId: input.conversationId,
      mcpUrl,
      mcpToken: getMcpInternalToken()
    });
    recordAgentUsage(result.model, result.usage);
    await store.log({
      action: 'agent_invoke',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `ADK trace=${result.traceId}; route=${result.route}; conversation=${result.conversationId}; tools=${result.toolCalls.join(', ') || 'none'}; model_calls=${result.lifecycle.modelCalls}; duration_ms=${result.durationMs}`
    });
    res.json(result);
  });

  app.post('/v1/handoffs/:handoffId/report', authorizeRole('editor'), requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      format: z.literal('markdown'),
      include_path_tokens: z.boolean().default(true),
      include_sensitive_paths: z.literal(false),
      include_open_findings: z.boolean().default(true),
      workspace_targets: z.object({
        drive_folder_id: z.string().max(500).optional(),
        sheet_id: z.string().max(500).optional(),
        create_gmail_draft: z.boolean().default(false)
      }).optional()
    }).parse(req.body);
    const handoff = store.get().handoffs.find((item) => item.id === req.params.handoffId);
    if (!handoff) return res.status(404).json({ error: 'Handoff not found' });
    if (!actorCanAccessProject(req.actor, handoff.projectId)) return res.status(403).json({ error: 'Project access denied' });
    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const requestSha256 = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = (store.get().handoffReports || []).find((report) => (
      report.handoffId === handoff.id && report.idempotencyKey === idempotencyKey
    ));
    if (previous) {
      if (previous.requestSha256 !== requestSha256) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with different report options' });
      }
      const previousMarkdown = await loadHandoffReportMarkdown(previous);
      return res.json({ ...publicHandoffReport(previous, previousMarkdown), idempotent: true });
    }
    const state = store.get();
    const summary = projectSummary(state, handoff.projectId);
    const findings = input.include_open_findings
      ? state.findings.filter((finding) => finding.projectId === handoff.projectId && finding.status === 'open')
      : [];
    const recipient = handoff.receivingMember || state.setupConfig.receivingMemberEmail;
    const payload = buildHandoffPayload({ summary, findings, recipient });
    const graph = projectGraph(state, handoff.projectId);
    const pathTokens = input.include_path_tokens
      ? [...new Set(graph.nodes.map((node) => node.pathToken).filter(Boolean))].sort()
      : [];
    const reportId = `report_${randomUUID()}`;
    const version = (state.handoffReports || []).filter((report) => report.handoffId === handoff.id).length + 1;
    const markdown = [
      payload.report.trimEnd(),
      '',
      '## Report provenance',
      '',
      `- Report ID: ${reportId}`,
      `- Version: ${version}`,
      `- Generated by: ${req.actor.subject}`,
      `- Open findings included: ${input.include_open_findings}`,
      `- Sensitive paths included: false`,
      ...(pathTokens.length ? ['', '## Path tokens', '', ...pathTokens.map((token) => `- \`${token}\``)] : []),
      ''
    ].join('\n');
    const sha256 = createHash('sha256').update(markdown).digest('hex');
    const objectKey = `reports/${handoff.projectId}/${handoff.id}/${reportId}.md`;
    const storedObject = await createObjectStore({ dataDir: store.dataDir }).putImmutable({
      key: objectKey,
      content: markdown,
      contentType: 'text/markdown; charset=utf-8',
      metadata: {
        projectId: handoff.projectId,
        handoffId: handoff.id,
        reportId,
        version,
      },
    });
    const report = {
      id: reportId,
      handoffId: handoff.id,
      projectId: handoff.projectId,
      version,
      format: 'markdown',
      sha256,
      objectKey,
      storageUri: storedObject.uri,
      storageGeneration: storedObject.generation || null,
      storageCrc32c: storedObject.crc32c || null,
      storageInternalPath: storedObject.internalPath,
      sizeBytes: storedObject.sizeBytes,
      workspaceTargets: input.workspace_targets || null,
      idempotencyKey,
      requestSha256,
      generatedBy: req.actor.subject,
      createdAt: new Date().toISOString()
    };
    await store.update((draft) => {
      draft.handoffReports ||= [];
      draft.handoffReports.push(report);
    });
    await store.log({
      action: 'generate_handoff_report',
      actor: req.actor.subject,
      resource: `project/${handoff.projectId}/handoff/${handoff.id}/report/${report.id}`,
      details: `Generated immutable handoff report version ${version}; no external Workspace write was performed.`
    });
    res.status(201).json(publicHandoffReport(report, markdown));
  });

  app.get('/v1/handoffs/:handoffId/reports/:reportId', async (req, res) => {
    const report = (store.get().handoffReports || []).find((item) => (
      item.handoffId === req.params.handoffId && item.id === req.params.reportId
    ));
    if (!report) return res.status(404).json({ error: 'Handoff report not found' });
    if (!actorCanAccessProject(req.actor, report.projectId)) return res.status(403).json({ error: 'Project access denied' });
    res.json(publicHandoffReport(report, await loadHandoffReportMarkdown(report)));
  });

  app.post('/v1/projects/:projectId/handoffs/export', requireProject, requireIdempotentWrite, async (req, res) => {
    const graph = projectGraph(store.get(), req.params.projectId);
    const summary = projectSummary(store.get(), req.params.projectId);
    const findings = store.get().findings.filter((finding) => finding.projectId === req.params.projectId && finding.status === 'open');
    const outputDir = path.join(store.dataDir, 'exports', req.params.projectId, new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(outputDir, { recursive: true });
    const report = [
      `# ${summary.name} — Research Handoff`,
      '', `Generated: ${new Date().toISOString()}`, '',
      `- Assets: ${summary.totalAssets}`,
      `- Open findings: ${summary.openFindings}`,
      `- Lineage nodes/edges: ${graph.nodes.length}/${graph.edges.length}`,
      '', '## Open findings', '',
      ...findings.flatMap((finding) => [`### ${finding.severity} — ${finding.title}`, '', finding.description, '', `Action: ${finding.proposedAction}`, '', `Evidence: ${(finding.evidenceIds || []).join(', ') || 'none'}`, ''])
    ].join('\n');
    const csv = ['id,severity,type,title,status', ...findings.map((finding) =>
      [finding.id, finding.severity, finding.type, finding.title, finding.status].map(csvCell).join(',')
    )].join('\n');
    const email = [
      `To: ${store.get().setupConfig.receivingMemberEmail}`,
      `Subject: LabLineage handoff — ${summary.name}`,
      'Content-Type: text/plain; charset=UTF-8', '',
      `A handoff report is ready for review. ${findings.length} open findings require attention.`,
      '', 'This is a local draft and has not been sent.'
    ].join('\r\n');
    await Promise.all([
      writeFile(path.join(outputDir, 'handoff-report.md'), report, 'utf8'),
      writeFile(path.join(outputDir, 'findings.csv'), csv, 'utf8'),
      writeFile(path.join(outputDir, 'gmail-draft.eml'), email, 'utf8')
    ]);
    await store.log({ action: 'export_handoff_preview', actor: req.actor.subject, resource: `project/${req.params.projectId}`, details: 'Created local report, CSV, and unsent email draft.' });
    res.status(201).json({ status: 'preview_created', outputDir, files: ['handoff-report.md', 'findings.csv', 'gmail-draft.eml'], sent: false });
  });

  app.post('/v1/projects/:projectId/handoffs/workspace', requireProject, requireIdempotentWrite, async (req, res) => {
    const input = z.object({
      action: z.enum(['preview', 'execute']),
      confirmation: z.literal('EXPORT_TO_GOOGLE_WORKSPACE').optional(),
      idempotencyKey: z.string().min(8).max(200),
      recipient: z.email().optional()
    }).parse(req.body);
    const state = store.get();
    const summary = projectSummary(state, req.params.projectId);
    const findings = state.findings.filter((finding) => finding.projectId === req.params.projectId && finding.status === 'open');
    const recipient = input.recipient || state.setupConfig.receivingMemberEmail;
    const payload = buildHandoffPayload({ summary, findings, recipient });
    if (input.action === 'preview') {
      return res.json({
        action: 'preview',
        idempotencyKey: input.idempotencyKey,
        drive: { name: `${summary.name}-handoff.md`, bytes: Buffer.byteLength(payload.report) },
        sheets: { auditId: state.audits.find((audit) => audit.projectId === req.params.projectId)?.id || input.idempotencyKey, row: payload.ledgerRow },
        gmail: { to: recipient, subject: payload.subject, mode: 'draft-only' }
      });
    }
    if (input.confirmation !== 'EXPORT_TO_GOOGLE_WORKSPACE') {
      return res.status(409).json({ error: 'Explicit Workspace export confirmation is required' });
    }
    const auditId = state.audits.find((audit) => audit.projectId === req.params.projectId)?.id || input.idempotencyKey;
    let job;
    const staleAfterMs = Math.max(60_000, Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || 15_000) * 4);
    await store.update((draft) => {
      draft.workspaceExports ||= [];
      const previous = draft.workspaceExports.find((item) => item.idempotencyKey === input.idempotencyKey);
      if (previous?.status === 'workspace_exported') {
        job = { ...previous, completed: true };
        return;
      }
      if (previous?.status === 'in_progress' && Date.now() - Date.parse(previous.updatedAt) < staleAfterMs) {
        job = { conflict: true };
        return;
      }
      const next = previous || {
        idempotencyKey: input.idempotencyKey,
        projectId: req.params.projectId,
        createdAt: new Date().toISOString(),
        attempts: 0
      };
      delete next.failure;
      Object.assign(next, {
        status: 'in_progress',
        actor: req.actor.subject,
        updatedAt: new Date().toISOString(),
        attempts: Number(next.attempts || 0) + 1
      });
      if (!previous) draft.workspaceExports.push(next);
      job = { ...next };
    });
    if (job.completed) {
      return res.json({
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        driveFileId: job.driveFileId,
        sheetIdempotent: job.sheetIdempotent,
        gmailDraftId: job.gmailDraftId,
        sent: false,
        idempotent: true
      });
    }
    if (job.conflict) {
      return res.status(409).json({ error: 'An export with this idempotency key is already in progress' });
    }

    const saveProgress = async (patch) => {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      await store.update((draft) => {
        const current = draft.workspaceExports.find((item) => item.idempotencyKey === input.idempotencyKey);
        if (!current) throw new Error('Workspace export claim was lost');
        Object.assign(current, patch, { updatedAt: job.updatedAt });
      });
    };

    try {
      const client = await createGoogleWorkspaceClientFromEnv();
      if (!job.driveFileId) {
        const drive = await client.createDriveReport({
        name: `${summary.name}-handoff-${auditId}.md`,
        markdown: payload.report,
          folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
          idempotencyKey: `${input.idempotencyKey}:drive`
        });
        await saveProgress({ driveFileId: drive.id, driveIdempotent: Boolean(drive.idempotent) });
      }
      if (!job.sheetCompleted) {
        const sheets = await client.appendSheetOnce({
          spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
          range: process.env.GOOGLE_SHEETS_RANGE || 'Audit!A:E',
          auditId,
          row: payload.ledgerRow
        });
        await saveProgress({ sheetCompleted: true, sheetIdempotent: sheets.idempotent });
      }
      if (!job.gmailDraftId) {
        const gmail = await client.createGmailDraft({
          to: recipient,
          subject: payload.subject,
          text: payload.emailText,
          idempotencyKey: `${input.idempotencyKey}:gmail`
        });
        await saveProgress({ gmailDraftId: gmail.id, gmailIdempotent: Boolean(gmail.idempotent) });
      }
      await saveProgress({ status: 'workspace_exported', sent: false, completedAt: new Date().toISOString() });
    } catch (error) {
      await saveProgress({
        status: 'failed',
        failure: { at: new Date().toISOString(), message: String(error.message || 'Workspace export failed').slice(0, 300) }
      }).catch(() => {});
      throw error;
    }
    await store.log({
      action: 'workspace_export',
      actor: req.actor.subject,
      resource: `project/${req.params.projectId}`,
      details: `Created Drive report ${job.driveFileId}, ledger row ${auditId}, and Gmail draft ${job.gmailDraftId}; no email was sent.`
    });
    res.status(201).json({
      status: job.status,
      idempotencyKey: job.idempotencyKey,
      driveFileId: job.driveFileId,
      sheetIdempotent: job.sheetIdempotent,
      gmailDraftId: job.gmailDraftId,
      sent: false
    });
  });

  app.get('/v1/metrics', authorizeRole('admin'), (_req, res) => {
    res.type('text/plain; version=0.0.4').send(renderPrometheusMetrics(store.get()));
  });

  const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get(/^(?!\/(?:api|v1)\/).*/, (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

  app.use((error, req, res, _next) => {
    const status = error.statusCode || (error instanceof ZodError ? 400 : 500);
    if (status >= 500) structuredLog('error', 'request_error', {
      requestId: req.requestId,
      actor: req.actor?.subject,
      method: req.method,
      path: req.path,
      error: error.message
    });
    res.status(status).json({
      error: status >= 500 ? 'Internal server error' : error.message,
      requestId: req.requestId,
      ...(error instanceof ZodError ? { issues: error.issues } : {})
    });
  });
  return app;
}

export const app = buildApp();
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  deploymentProfile(process.env, { requireExplicit: process.env.NODE_ENV === 'production' });
  const server = app.listen(port, host, () => {
    console.log(`LabLineage Guardian API listening on http://${host}:${port}`);
    void recoverIngestionJobs().catch((error) => {
      structuredLog('error', 'ingestion_recovery_failed', { error: error.message });
    });
    void analysisDispatcher.recover().catch((error) => {
      structuredLog('error', 'analysis_recovery_failed', { error: error.message });
    });
  });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    structuredLog('info', 'shutdown_started', { signal });
    const forcedExit = setTimeout(() => process.exit(1), 10_000);
    forcedExit.unref();
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([...ingestionExecutions.values()]);
    await analysisDispatcher.close();
    if (typeof store.close === 'function') await store.close();
    if (globalThis.__lablineageTelemetry?.shutdown) await globalThis.__lablineageTelemetry.shutdown();
    clearTimeout(forcedExit);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
