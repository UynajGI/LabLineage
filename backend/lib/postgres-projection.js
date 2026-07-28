import { createHash } from 'node:crypto';

export function stableUuid(value) {
  const hex = createHash('sha256').update(String(value)).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validSha(value) {
  const match = /^sha256:([a-f0-9]{64})$/.exec(value || '');
  return match?.[1] || null;
}

export async function syncNormalizedProjection(client, tenantId, state) {
  const projectIds = new Map();
  for (const project of state.projects || []) {
    const id = stableUuid(`project:${project.id}`);
    projectIds.set(project.id, id);
    await client.query(
      `INSERT INTO projects(id,tenant_id,slug,name,root_path_token,repository_url,default_branch,settings,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,settings=EXCLUDED.settings,updated_at=EXCLUDED.updated_at`,
      [
        id,
        tenantId,
        project.slug || project.id,
        project.name,
        project.rootPathToken || null,
        project.repositoryUrl || null,
        project.defaultBranch || null,
        JSON.stringify({ externalId: project.id, ...project.settings }),
        project.createdAt || new Date().toISOString(),
        project.updatedAt || new Date().toISOString()
      ]
    );
  }

  const sourceIds = new Map();
  for (const source of state.sources || []) {
    const projectId = projectIds.get(source.projectId);
    if (!projectId) continue;
    const id = stableUuid(`source:${source.id}`);
    sourceIds.set(source.id, id);
    await client.query(
      `INSERT INTO data_sources(
         id,tenant_id,project_id,external_id,name,source_type,network_mode,export_policy,status,created_at,updated_at
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,source_type=EXCLUDED.source_type,network_mode=EXCLUDED.network_mode,
         export_policy=EXCLUDED.export_policy,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
      [
        id,
        tenantId,
        projectId,
        source.id,
        source.name,
        source.type,
        source.networkMode,
        JSON.stringify(source.exportPolicy || {}),
        source.status || 'active',
        source.createdAt,
        source.updatedAt
      ]
    );
  }

  for (const job of state.ingestionJobs || []) {
    const projectId = projectIds.get(job.projectId);
    if (!projectId) continue;
    const id = stableUuid(`ingestion-job:${job.id}`);
    await client.query(
      `INSERT INTO ingestion_jobs(
         id,tenant_id,project_id,source_id,external_id,bundle_id,status,payload_sha256,
         result,error,actor_subject,created_at,updated_at,attempts,retry_count,
         payload_bytes,error_history,started_at,completed_at,next_attempt_at,lease_expires_at,
         payload_object_key,payload_storage_uri,payload_storage_generation
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,result=EXCLUDED.result,error=EXCLUDED.error,
         updated_at=EXCLUDED.updated_at,attempts=EXCLUDED.attempts,retry_count=EXCLUDED.retry_count,
         payload_bytes=EXCLUDED.payload_bytes,error_history=EXCLUDED.error_history,started_at=EXCLUDED.started_at,
         completed_at=EXCLUDED.completed_at,next_attempt_at=EXCLUDED.next_attempt_at,
         lease_expires_at=EXCLUDED.lease_expires_at,payload_object_key=EXCLUDED.payload_object_key,
         payload_storage_uri=EXCLUDED.payload_storage_uri,
         payload_storage_generation=EXCLUDED.payload_storage_generation`,
      [
        id,
        tenantId,
        projectId,
        sourceIds.get(job.sourceId) || null,
        job.id,
        job.bundleId || null,
        job.status,
        job.payloadSha256,
        job.result ? JSON.stringify(job.result) : null,
        job.error ? JSON.stringify(job.error) : null,
        job.actorSubject,
        job.createdAt,
        job.updatedAt,
        job.attempts || 0,
        job.retryCount || 0,
        job.payloadBytes || null,
        JSON.stringify(job.errorHistory || []),
        job.startedAt || null,
        job.completedAt || null,
        job.nextAttemptAt || null,
        job.leaseExpiresAt || null,
        job.payloadObjectKey || null,
        job.payloadStorageUri || null,
        job.payloadStorageGeneration || null
      ]
    );
  }

  const evidenceIds = new Map();
  for (const item of state.evidence || []) {
    const projectId = projectIds.get(item.projectId);
    if (!projectId) continue;
    const id = stableUuid(`evidence:${item.id}`);
    evidenceIds.set(item.id, id);
    const payload = { externalId: item.id, bundleId: item.bundleId, signerFingerprint: item.signerFingerprint, ...item.payload };
    await client.query(
      `INSERT INTO evidence(id,tenant_id,project_id,evidence_type,source,payload,sha256,captured_at,signature)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)
       ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,sha256=EXCLUDED.sha256,captured_at=EXCLUDED.captured_at,signature=EXCLUDED.signature`,
      [
        id,
        tenantId,
        projectId,
        item.evidenceType || 'unknown',
        item.source || 'unknown',
        JSON.stringify(payload),
        sha256Json(payload),
        item.capturedAt || new Date().toISOString(),
        item.signerFingerprint ? JSON.stringify({ algorithm: 'Ed25519', signerFingerprint: item.signerFingerprint }) : null
      ]
    );
  }

  const versionIds = new Map();
  const artifactIds = new Map();
  for (const node of state.nodes || []) {
    if (node.type === 'Project') continue;
    const projectId = projectIds.get(node.projectId);
    if (!projectId) continue;
    const artifactId = stableUuid(`artifact:${node.projectId}:${node.id}`);
    artifactIds.set(node.id, artifactId);
    const contentSha = validSha(node.details?.hash) || sha256Json(node);
    const versionId = stableUuid(`version:${artifactId}:${contentSha}`);
    versionIds.set(node.id, versionId);
    await client.query(
      `INSERT INTO artifacts(id,tenant_id,project_id,stable_key,kind,logical_path,path_token,media_type,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,logical_path=EXCLUDED.logical_path,path_token=EXCLUDED.path_token,metadata=EXCLUDED.metadata`,
      [
        artifactId,
        tenantId,
        projectId,
        node.id,
        node.type,
        node.label || node.id,
        node.pathToken || null,
        node.details?.mediaType || null,
        JSON.stringify({ externalId: node.id, status: node.status, reproducibility: node.reproducibility, humanConfirmed: node.humanConfirmed })
      ]
    );
    await client.query(
      `INSERT INTO artifact_versions(id,tenant_id,artifact_id,sha256,size_bytes,modified_at,git_commit,metadata,observed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,observed_at=EXCLUDED.observed_at`,
      [
        versionId,
        tenantId,
        artifactId,
        contentSha,
        Number(node.details?.sizeBytes || 0),
        node.details?.modifiedAt || null,
        node.details?.sha || node.details?.commit || null,
        JSON.stringify({ externalId: node.id, ...node.details, evidenceIds: node.evidenceIds || [] }),
        node.details?.observedAt || new Date().toISOString()
      ]
    );
  }

  const edgeIds = new Map();
  for (const edge of state.edges || []) {
    const source = versionIds.get(edge.source);
    const target = versionIds.get(edge.target);
    if (!source || !target) continue;
    const evidenceId = evidenceIds.get(edge.evidenceIds?.[0]) || null;
    const id = stableUuid(edge.id
      ? `edge-external:${edge.id}`
      : `edge:${edge.source}:${edge.target}:${edge.relation}:${edge.evidenceIds?.[0] || ''}`);
    if (edge.id) edgeIds.set(edge.id, id);
    const confidence = { exact: 1, human_verified: 1, strong: 0.85, inferred: 0.6, hypothesis: 0.3, unknown: 0 }[edge.confidence] ?? 0;
    const project = (state.nodes || []).find((node) => node.id === edge.source)?.projectId;
    const projectId = projectIds.get(project);
    if (!projectId) continue;
    await client.query(
      `INSERT INTO lineage_edges(id,tenant_id,project_id,source_version_id,target_version_id,relation,evidence_id,confidence)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET evidence_id=EXCLUDED.evidence_id,confidence=EXCLUDED.confidence`,
      [id, tenantId, projectId, source, target, edge.relation, evidenceId, confidence]
    );
  }

  for (const edge of state.edges || []) {
    const edgeId = edgeIds.get(edge.id);
    if (!edgeId) continue;
    const sourceNode = (state.nodes || []).find((node) => node.id === edge.source);
    const projectId = projectIds.get(sourceNode?.projectId);
    if (!projectId) continue;
    for (const review of edge.reviews || []) {
      const id = stableUuid(`edge-review:${review.id}`);
      await client.query(
        `INSERT INTO lineage_edge_reviews(
           id,tenant_id,project_id,lineage_edge_id,external_id,decision,comment,reviewer_subject,created_at
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(id) DO UPDATE SET decision=EXCLUDED.decision,comment=EXCLUDED.comment`,
        [id, tenantId, projectId, edgeId, review.id, review.decision, review.comment, review.reviewer, review.createdAt]
      );
    }
  }

  for (const proposal of state.statusProposals || []) {
    const projectId = projectIds.get(proposal.projectId);
    const artifactId = artifactIds.get(proposal.assetId);
    if (!projectId || !artifactId) continue;
    const id = stableUuid(`status-proposal:${proposal.id}`);
    await client.query(
      `INSERT INTO asset_status_proposals(
         id,tenant_id,project_id,artifact_id,replacement_artifact_id,external_id,
         proposed_status,reason,status,proposed_by,created_at
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason`,
      [
        id,
        tenantId,
        projectId,
        artifactId,
        artifactIds.get(proposal.replacementAssetId) || null,
        proposal.id,
        proposal.proposedStatus,
        proposal.reason,
        proposal.status,
        proposal.proposedBy,
        proposal.createdAt
      ]
    );
  }

  for (const report of state.handoffReports || []) {
    const projectId = projectIds.get(report.projectId);
    if (!projectId) continue;
    const id = stableUuid(`handoff-report:${report.id}`);
    await client.query(
      `INSERT INTO handoff_reports(
         id,tenant_id,project_id,external_id,handoff_external_id,version,format,sha256,
         storage_uri,generated_by,metadata,created_at
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT(id) DO UPDATE SET sha256=EXCLUDED.sha256,storage_uri=EXCLUDED.storage_uri,metadata=EXCLUDED.metadata`,
      [
        id,
        tenantId,
        projectId,
        report.id,
        report.handoffId,
        report.version,
        report.format,
        report.sha256,
        report.storageUri || report.storagePath,
        report.generatedBy,
        JSON.stringify({
          workspaceTargets: report.workspaceTargets,
          idempotencyKey: report.idempotencyKey,
          objectKey: report.objectKey,
          storageGeneration: report.storageGeneration,
          storageCrc32c: report.storageCrc32c,
          sizeBytes: report.sizeBytes
        }),
        report.createdAt
      ]
    );
  }

  for (const snapshot of state.snapshots || []) {
    const projectId = projectIds.get(snapshot.projectId);
    if (!projectId) continue;
    const id = stableUuid(`snapshot:${snapshot.id}`);
    const manifestSha = sha256Json(snapshot.files || snapshot);
    await client.query(
      `INSERT INTO snapshots(id,tenant_id,project_id,manifest_sha256,collector_version,captured_at,stats)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT(project_id,manifest_sha256) DO UPDATE SET stats=EXCLUDED.stats`,
      [id, tenantId, projectId, manifestSha, snapshot.collectorVersion || 'server-scanner@0.3.0', snapshot.collectedAt, JSON.stringify({ fileCount: snapshot.fileCount, warnings: snapshot.warnings })]
    );
  }

  const auditIds = new Map();
  for (const audit of state.audits || []) {
    const projectId = projectIds.get(audit.projectId);
    if (!projectId) continue;
    const id = stableUuid(`audit:${audit.id}`);
    auditIds.set(audit.id, id);
    await client.query(
      `INSERT INTO audits(id,tenant_id,project_id,status,reproducibility_level,policy_version,summary,started_at,finished_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reproducibility_level=EXCLUDED.reproducibility_level,summary=EXCLUDED.summary,finished_at=EXCLUDED.finished_at`,
      [id, tenantId, projectId, 'completed', audit.level, audit.policyVersion, JSON.stringify({ score: audit.score, missing: audit.missing, verifiedRerun: audit.verifiedRerun }), audit.createdAt, audit.createdAt]
    );
  }

  for (const finding of state.findings || []) {
    const projectId = projectIds.get(finding.projectId);
    const audit = (state.audits || []).find((candidate) => candidate.projectId === finding.projectId);
    const auditId = auditIds.get(audit?.id);
    if (!projectId || !auditId) continue;
    const id = stableUuid(`finding:${finding.id}`);
    const artifactId = (finding.affectedEntities || []).map((item) => artifactIds.get(item)).find(Boolean) || null;
    const severity = { P0: 'critical', P1: 'high', P2: 'medium', P3: 'low' }[finding.severity] || 'info';
    const status = finding.status === 'open' ? 'open' : finding.status === 'resolved' ? 'resolved' : 'confirmed';
    await client.query(
      `INSERT INTO findings(id,tenant_id,project_id,audit_id,artifact_id,rule_id,severity,status,title,detail,evidence_ids)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[])
       ON CONFLICT(id) DO UPDATE SET severity=EXCLUDED.severity,status=EXCLUDED.status,title=EXCLUDED.title,detail=EXCLUDED.detail`,
      [id, tenantId, projectId, auditId, artifactId, finding.type, severity, status, finding.title, finding.description, (finding.evidenceIds || []).map((item) => evidenceIds.get(item)).filter(Boolean)]
    );
  }

  await client.query(
    'DELETE FROM idempotency_records WHERE tenant_id=$1 AND expires_at <= now()',
    [tenantId]
  );
  for (const record of state.idempotencyRecords || []) {
    await client.query(
      `INSERT INTO idempotency_records(
         id,tenant_id,external_id,actor_subject,method,request_path,idempotency_key,
         request_sha256,status,response_status,response_kind,response_body,
         created_at,completed_at,expires_at
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
       ON CONFLICT(tenant_id,external_id) DO UPDATE SET
         status=EXCLUDED.status,
         response_status=EXCLUDED.response_status,
         response_kind=EXCLUDED.response_kind,
         response_body=EXCLUDED.response_body,
         completed_at=EXCLUDED.completed_at,
         expires_at=EXCLUDED.expires_at`,
      [
        stableUuid(`idempotency:${record.id}`),
        tenantId,
        record.id,
        record.actor,
        record.method,
        record.requestPath,
        record.idempotencyKey,
        record.requestSha256,
        record.status,
        record.responseStatus || null,
        record.responseKind || null,
        JSON.stringify(record.responseBody ?? null),
        record.createdAt,
        record.completedAt || null,
        record.expiresAt,
      ]
    );
  }

  for (const event of state.auditEvents || []) {
    const externalProject = /^project\/([^/]+)/.exec(event.resource || '')?.[1];
    const projectId = projectIds.get(externalProject) || null;
    await client.query(
      `INSERT INTO audit_events(tenant_id,project_id,actor_subject,action,target_type,target_id,request_id,detail,occurred_at,external_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       ON CONFLICT(tenant_id,external_id) WHERE external_id IS NOT NULL DO UPDATE SET detail=EXCLUDED.detail`,
      [
        tenantId,
        projectId,
        event.userSubject || 'system',
        event.action,
        event.resource?.split('/')[0] || 'unknown',
        event.resource || null,
        stableUuid(`trace:${event.traceId || event.id}`),
        JSON.stringify({ status: event.status, details: event.details }),
        event.timestamp,
        event.id
      ]
    );
  }
}
