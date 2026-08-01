export async function syncProjectAnalysisProjection(client, tenantId, state, {
  projectIds,
  sourceIds,
  stableUuid
}) {
  const intentIds = new Map();
  for (const intent of state.projectIntents || []) {
    const projectId = projectIds.get(intent.projectId);
    if (!projectId) continue;
    const id = stableUuid(`project-intent:${intent.id}`);
    intentIds.set(intent.id, id);
    await client.query(
      `INSERT INTO project_intent_versions(
         id,tenant_id,project_id,external_id,version,objective,constraints,is_legacy,created_by_subject,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       ON CONFLICT(id) DO NOTHING`,
      [id, tenantId, projectId, intent.id, intent.version, intent.objective,
        JSON.stringify(intent.constraints || []), Boolean(intent.legacy),
        intent.createdBySubject || 'system', intent.createdAt]
    );
  }

  for (const criterion of state.projectSuccessCriteria || []) {
    const intentId = intentIds.get(criterion.intentId);
    if (!intentId) continue;
    await client.query(
      `INSERT INTO project_success_criteria(
         id,tenant_id,intent_version_id,external_id,description,required,sort_order,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO NOTHING`,
      [stableUuid(`project-criterion:${criterion.id}`), tenantId, intentId, criterion.id,
        criterion.description, criterion.required !== false, criterion.sortOrder || 0, criterion.createdAt]
    );
  }

  for (const output of state.projectKeyOutputs || []) {
    const intentId = intentIds.get(output.intentId);
    if (!intentId) continue;
    await client.query(
      `INSERT INTO project_key_outputs(
         id,tenant_id,intent_version_id,external_id,name,output_kind,expected_path_hint,required,sort_order,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO NOTHING`,
      [stableUuid(`project-output:${output.id}`), tenantId, intentId, output.id, output.name,
        output.kind, output.expectedPathHint || null, output.required !== false,
        output.sortOrder || 0, output.createdAt]
    );
  }

  const runIds = new Map();
  for (const run of state.analysisRuns || []) {
    const projectId = projectIds.get(run.projectId);
    const intentId = intentIds.get(run.intentVersionId || run.intentId);
    if (!projectId || !intentId) continue;
    const id = stableUuid(`analysis-run:${run.id}`);
    runIds.set(run.id, id);
    await client.query(
      `INSERT INTO project_analysis_runs(
         id,tenant_id,project_id,intent_version_id,source_id,external_id,status,current_step,version,
         idempotency_key,source_revision,input_kind,input_object_key,input_sha256,attempts,
         deterministic_ready,error_code,error_summary,actor_subject,queued_at,started_at,
         completed_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,current_step=EXCLUDED.current_step,version=EXCLUDED.version,
         source_revision=EXCLUDED.source_revision,input_kind=EXCLUDED.input_kind,
         input_object_key=EXCLUDED.input_object_key,input_sha256=EXCLUDED.input_sha256,
         attempts=EXCLUDED.attempts,
         deterministic_ready=EXCLUDED.deterministic_ready,error_code=EXCLUDED.error_code,
         error_summary=EXCLUDED.error_summary,started_at=EXCLUDED.started_at,
         completed_at=EXCLUDED.completed_at,updated_at=EXCLUDED.updated_at`,
      [id, tenantId, projectId, intentId, sourceIds.get(run.sourceId) || null, run.id,
        run.status, run.currentStep || null, run.version || 1, run.idempotencyKey,
        run.sourceRevision || null, run.inputKind || null, run.inputObjectKey || null,
        run.inputSha256 || null, run.attempts || 0, Boolean(run.deterministicReady),
        run.errorCode || null, run.errorSummary || null, run.actorSubject, run.queuedAt,
        run.startedAt || null, run.completedAt || null, run.updatedAt]
    );
  }

  for (const step of state.analysisRunSteps || []) {
    const runId = runIds.get(step.runId);
    if (!runId) continue;
    await client.query(
      `INSERT INTO project_analysis_run_steps(
         id,tenant_id,run_id,external_id,step_name,status,attempt,lease_owner,lease_expires_at,
         input_sha256,output_sha256,artifact_refs,error_code,error_summary,started_at,completed_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,attempt=EXCLUDED.attempt,lease_owner=EXCLUDED.lease_owner,
         lease_expires_at=EXCLUDED.lease_expires_at,input_sha256=EXCLUDED.input_sha256,
         output_sha256=EXCLUDED.output_sha256,artifact_refs=EXCLUDED.artifact_refs,
         error_code=EXCLUDED.error_code,error_summary=EXCLUDED.error_summary,
         started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,updated_at=EXCLUDED.updated_at`,
      [stableUuid(`analysis-step:${step.id}`), tenantId, runId, step.id, step.name,
        step.status, step.attempt || 0, step.leaseOwner || null, step.leaseExpiresAt || null,
        step.inputSha256 || null, step.outputSha256 || null, JSON.stringify(step.artifactRefs || []),
        step.errorCode || null, step.errorSummary || null, step.startedAt || null,
        step.completedAt || null, step.updatedAt]
    );
  }

  for (const report of state.analysisReports || []) {
    const runId = runIds.get(report.runId);
    const intentId = intentIds.get(report.intentVersionId || report.intentId);
    if (!runId || !intentId) continue;
    await client.query(
      `INSERT INTO project_analysis_reports(
         id,tenant_id,run_id,intent_version_id,external_id,audit_external_id,overall_status,
         coverage_score,object_key,sha256,media_type,model,trace_id,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT(id) DO NOTHING`,
      [stableUuid(`analysis-report:${report.id}`), tenantId, runId, intentId, report.id,
        report.auditId || null, report.overallStatus, report.coverageScore, report.objectKey,
        report.sha256, report.mediaType || 'application/json', report.model || null,
        report.traceId || null, report.createdAt]
    );
  }

  for (const event of state.analysisRunEvents || []) {
    const runId = runIds.get(event.runId);
    if (!runId) continue;
    await client.query(
      `INSERT INTO project_analysis_run_events(
         id,tenant_id,run_id,external_id,event_type,actor_subject,payload,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT(id) DO NOTHING`,
      [stableUuid(`analysis-event:${event.id}`), tenantId, runId, event.id, event.eventType,
        event.actorSubject, JSON.stringify(event.payload || {}), event.createdAt]
    );
  }

  const pairingIds = new Map();
  for (const pairing of state.collectorPairings || []) {
    const projectId = projectIds.get(pairing.projectId);
    if (!projectId) continue;
    const id = stableUuid(`collector-pairing:${pairing.id}`);
    pairingIds.set(pairing.id, id);
    await client.query(
      `INSERT INTO collector_pairings(
         id,tenant_id,project_id,external_id,code_sha256,status,collector_external_id,
         source_external_id,created_by_subject,expires_at,claimed_at,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,collector_external_id=EXCLUDED.collector_external_id,
         source_external_id=EXCLUDED.source_external_id,claimed_at=EXCLUDED.claimed_at,
         updated_at=EXCLUDED.updated_at`,
      [id, tenantId, projectId, pairing.id, pairing.codeSha256, pairing.status,
        pairing.collectorId || null, pairing.sourceId || null, pairing.createdBySubject,
        pairing.expiresAt, pairing.claimedAt || null, pairing.createdAt, pairing.updatedAt]
    );
  }

  for (const credential of state.collectorCredentials || []) {
    const projectId = projectIds.get(credential.projectId);
    const sourceId = sourceIds.get(credential.sourceId);
    const pairingId = pairingIds.get(credential.pairingId);
    if (!projectId || !sourceId || !pairingId) continue;
    await client.query(
      `INSERT INTO collector_credentials(
         id,tenant_id,project_id,source_id,pairing_id,external_id,collector_external_id,
         public_key_fingerprint,public_key_pem,status,expires_at,revoked_at,
         revoked_by_subject,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,revoked_at=EXCLUDED.revoked_at,
         revoked_by_subject=EXCLUDED.revoked_by_subject,updated_at=EXCLUDED.updated_at`,
      [stableUuid(`collector-credential:${credential.id}`), tenantId, projectId, sourceId,
        pairingId, credential.id, credential.collectorId, credential.publicKeyFingerprint,
        credential.publicKeyPem, credential.status,
        credential.expiresAt, credential.revokedAt || null, credential.revokedBySubject || null,
        credential.createdAt, credential.updatedAt]
    );
  }
}
