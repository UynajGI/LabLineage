import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { app, store } from '../server.js';

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('security headers, RBAC and project isolation are enforced over HTTP', async () => {
  const previousMode = process.env.LABLINEAGE_AUTH_MODE;
  const previousTokens = process.env.LABLINEAGE_SERVICE_TOKENS_JSON;
  const originalState = structuredClone(store.get());
  const originalDataDir = store.dataDir;
  const testDataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-api-security-'));
  store.dataDir = testDataDir;
  try {
    process.env.LABLINEAGE_AUTH_MODE = 'development';
    await withServer(async (baseUrl) => {
      const projects = await fetch(`${baseUrl}/v1/projects`, { headers: { 'x-lablineage-role': 'viewer' } });
      assert.equal(projects.status, 200);
      assert.equal(projects.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(projects.headers.get('x-request-id'));
      const visibleProjects = await projects.json();

      const clientConfig = await fetch(`${baseUrl}/api/client-config`);
      assert.equal(clientConfig.status, 200);
      assert.deepEqual(await clientConfig.json(), { mode: 'development', enabled: false });
      const version = await fetch(`${baseUrl}/api/version`);
      assert.equal((await version.json()).manifestSchema, 'lablineage.manifest.v1');
      const openApi = await fetch(`${baseUrl}/api/openapi.json`);
      assert.equal(openApi.status, 200);
      assert.ok((await openApi.json()).paths['/v1/sources/{sourceId}/bundles']);

      const deniedSecuritySummary = await fetch(`${baseUrl}/v1/security/summary`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(deniedSecuritySummary.status, 403);
      const securitySummary = await fetch(`${baseUrl}/v1/security/summary`, {
        headers: { 'x-lablineage-role': 'admin' }
      });
      assert.equal(securitySummary.status, 200);
      assert.equal((await securitySummary.json()).actor.roles[0], 'admin');

      const snapshots = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/snapshots`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(snapshots.status, 200);
      assert.equal(Array.isArray(await snapshots.json()), true);

      const mcpDenied = await fetch(`${baseUrl}/mcp/projects/${visibleProjects[0].id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      });
      assert.equal(mcpDenied.status, 401);

      const conversationKey = `conversation-${Date.now()}`;
      const createdConversation = await fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/agent/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-lablineage-role': 'editor',
            'x-lablineage-user': 'agent-user-a',
            'idempotency-key': conversationKey
          },
          body: JSON.stringify({ title: 'Persistent evidence review' })
        }
      );
      assert.equal(createdConversation.status, 201);
      const conversation = await createdConversation.json();
      assert.match(conversation.id, /^conv_/);

      const ownedConversations = await fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/agent/conversations`,
        { headers: { 'x-lablineage-role': 'viewer', 'x-lablineage-user': 'agent-user-a' } }
      );
      assert.equal((await ownedConversations.json()).conversations.length, 1);
      const isolatedConversations = await fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/agent/conversations`,
        { headers: { 'x-lablineage-role': 'viewer', 'x-lablineage-user': 'agent-user-b' } }
      );
      assert.equal((await isolatedConversations.json()).conversations.length, 0);

      const clearedConversation = await fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/agent/conversations/${conversation.id}`,
        {
          method: 'DELETE',
          headers: {
            'x-lablineage-role': 'editor',
            'x-lablineage-user': 'agent-user-a',
            'idempotency-key': `clear-${conversation.id}`
          }
        }
      );
      assert.equal(clearedConversation.status, 204);

      const deniedSetup = await fetch(`${baseUrl}/v1/setup`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-lablineage-role': 'viewer' },
        body: '{}'
      });
      assert.equal(deniedSetup.status, 403);

      const deniedMetrics = await fetch(`${baseUrl}/v1/metrics`, { headers: { 'x-lablineage-role': 'viewer' } });
      assert.equal(deniedMetrics.status, 403);
      const metrics = await fetch(`${baseUrl}/v1/metrics`, { headers: { 'x-lablineage-role': 'admin' } });
      assert.equal(metrics.status, 200);
      const metricsText = await metrics.text();
      assert.match(metricsText, /lablineage_http_requests_total/);
      assert.match(metricsText, /lablineage_ingestion_jobs\{status="queued"\}/);
      assert.match(metricsText, /lablineage_analysis_runs\{status="queued"\}/);
      assert.match(metricsText, /lablineage_analysis_steps\{name="ingest",status="pending"\}/);

      const bundleId = `batch-${Date.now()}`;
      const validManifest = {
        schema_version: 'lablineage.manifest.v1',
        bundle_id: bundleId,
        project_key: 'phase-transition',
        records: []
      };
      const batch = await fetch(`${baseUrl}/v1/manifests/batch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': `batch-${Date.now()}`,
        },
        body: JSON.stringify({
          manifests: [
            validManifest,
            { schema_version: 'lablineage.manifest.v1', bundle_id: 'invalid', records: [] }
          ]
        })
      });
      assert.equal(batch.status, 207);
      const batchResult = await batch.json();
      assert.equal(batchResult.accepted, 1);
      assert.equal(batchResult.rejected, 1);
      const replay = await fetch(`${baseUrl}/v1/manifests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': `manifest-${Date.now()}`,
        },
        body: JSON.stringify(validManifest)
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).idempotent, true);

      const sourceKey = `source-${Date.now()}`;
      const sourceResponse = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/sources`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': sourceKey
        },
        body: JSON.stringify({
          name: 'Offline microscope server',
          type: 'offline_bundle',
          networkMode: 'air_gapped'
        })
      });
      assert.equal(sourceResponse.status, 201);
      const source = await sourceResponse.json();
      const sourceReplay = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/sources`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': sourceKey
        },
        body: JSON.stringify({
          name: 'Offline microscope server',
          type: 'offline_bundle',
          networkMode: 'air_gapped'
        })
      });
      assert.equal(sourceReplay.status, 201);
      assert.equal(sourceReplay.headers.get('idempotency-replayed'), 'true');
      assert.equal((await sourceReplay.json()).id, source.id);

      const sourceManifest = {
        schema_version: 'lablineage.manifest.v1',
        bundle_id: `source-bundle-${Date.now()}`,
        project_key: 'phase-transition',
        records: []
      };
      const queued = await fetch(`${baseUrl}/v1/sources/${source.id}/bundles`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': sourceManifest.bundle_id
        },
        body: JSON.stringify(sourceManifest)
      });
      assert.equal(queued.status, 202);
      const ingestionJob = await queued.json();
      assert.equal(ingestionJob.status, 'queued');
      assert.equal('payload' in ingestionJob, false);
      assert.equal('payloadObjectKey' in ingestionJob, false);
      assert.equal('payloadStorageUri' in ingestionJob, false);
      let completedJob;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const jobResponse = await fetch(`${baseUrl}/v1/ingestion-jobs/${ingestionJob.id}`, {
          headers: { 'x-lablineage-role': 'viewer' }
        });
        assert.equal(jobResponse.status, 200);
        completedJob = await jobResponse.json();
        if (completedJob.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(completedJob.status, 'completed');
      assert.equal(completedJob.bundleId, sourceManifest.bundle_id);
      assert.equal(completedJob.attempts, 1);
      assert.equal('payload' in completedJob, false);
      assert.equal('payloadObjectKey' in completedJob, false);
      assert.equal('payloadStorageUri' in completedJob, false);

      const invalidBundle = {
        schema_version: 'unsupported.manifest',
        bundle_id: `invalid-job-${Date.now()}`,
        project_key: 'phase-transition',
        records: [],
      };
      const invalidQueued = await fetch(`${baseUrl}/v1/sources/${source.id}/bundles`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': invalidBundle.bundle_id,
        },
        body: JSON.stringify(invalidBundle),
      });
      assert.equal(invalidQueued.status, 202);
      const invalidJob = await invalidQueued.json();
      let failedJob;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await fetch(`${baseUrl}/v1/ingestion-jobs/${invalidJob.id}`, {
          headers: { 'x-lablineage-role': 'viewer' },
        });
        failedJob = await response.json();
        if (failedJob.status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(failedJob.status, 'failed');
      assert.equal(failedJob.error.code, 400);
      assert.equal('payload' in failedJob, false);
      assert.equal('payloadObjectKey' in failedJob, false);
      assert.equal('payloadStorageUri' in failedJob, false);

      const retryResponse = await fetch(`${baseUrl}/v1/ingestion-jobs/${invalidJob.id}/retry`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': `retry-${invalidJob.id}`,
        },
        body: JSON.stringify({
          confirmation: 'RETRY_INGESTION_JOB',
          manifest: { ...invalidBundle, schema_version: 'lablineage.manifest.v1' },
        }),
      });
      assert.equal(retryResponse.status, 202);
      let retriedJob;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await fetch(`${baseUrl}/v1/ingestion-jobs/${invalidJob.id}`, {
          headers: { 'x-lablineage-role': 'viewer' },
        });
        retriedJob = await response.json();
        if (retriedJob.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(retriedJob.status, 'completed');
      assert.equal(retriedJob.retryCount, 1);
      assert.equal(retriedJob.errorHistory.length, 1);

      const sourceSnapshots = await fetch(`${baseUrl}/v1/sources/${source.id}/snapshots`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(sourceSnapshots.status, 200);
      const sourceSnapshotList = await sourceSnapshots.json();
      assert.deepEqual(
        sourceSnapshotList.slice(-2).map((snapshot) => snapshot.bundleId),
        [sourceManifest.bundle_id, invalidBundle.bundle_id],
      );
      const sourceChanges = await fetch(`${baseUrl}/v1/sources/${source.id}/changes`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(sourceChanges.status, 200);
      assert.deepEqual(await sourceChanges.json(), []);

      const disconnected = await fetch(`${baseUrl}/v1/sources/${source.id}/disconnect`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'admin',
          'idempotency-key': `disconnect-${Date.now()}`,
        },
        body: JSON.stringify({ confirmation: 'DISCONNECT_SOURCE' })
      });
      assert.equal(disconnected.status, 200);
      assert.equal((await disconnected.json()).status, 'disconnected');
      const deniedAfterDisconnect = await fetch(`${baseUrl}/v1/sources/${source.id}/bundles`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': `after-disconnect-${Date.now()}`
        },
        body: JSON.stringify({ ...sourceManifest, bundle_id: `after-disconnect-${Date.now()}` })
      });
      assert.equal(deniedAfterDisconnect.status, 409);

      const lineageResponse = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/lineage`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      const lineage = await lineageResponse.json();
      const reviewTarget = lineage.edges[0];
      assert.match(reviewTarget.id, /^edge_/);

      const confirmTarget = lineage.nodes[0];
      const missingIdempotency = await fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/nodes/${confirmTarget.id}/confirm`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-lablineage-role': 'editor' },
          body: '{}',
        },
      );
      assert.equal(missingIdempotency.status, 400);

      const confirmKey = `confirm-${Date.now()}`;
      const confirmRequest = (body = '{}') => fetch(
        `${baseUrl}/v1/projects/${visibleProjects[0].id}/nodes/${confirmTarget.id}/confirm`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-lablineage-role': 'editor',
            'idempotency-key': confirmKey,
          },
          body,
        },
      );
      const confirmed = await confirmRequest();
      assert.equal(confirmed.status, 204);
      const confirmReplay = await confirmRequest();
      assert.equal(confirmReplay.status, 204);
      assert.equal(confirmReplay.headers.get('idempotency-replayed'), 'true');
      const confirmConflict = await confirmRequest('{"different":true}');
      assert.equal(confirmConflict.status, 409);

      const edgeReview = await fetch(`${baseUrl}/v1/lineage-edges/${reviewTarget.id}/review`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'auditor',
          'idempotency-key': `review-${Date.now()}`
        },
        body: JSON.stringify({ decision: 'confirm', comment: 'Verified against the signed run record.' })
      });
      assert.equal(edgeReview.status, 201);
      assert.equal((await edgeReview.json()).reviewer, 'local-developer');

      const statusKey = `status-${Date.now()}`;
      const statusProposal = await fetch(`${baseUrl}/v1/assets/figure_3/status-proposals`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': statusKey
        },
        body: JSON.stringify({
          proposed_status: 'superseded',
          reason: 'A reviewed replacement is available.',
          replacement_asset_id: 'figure_old'
        })
      });
      assert.equal(statusProposal.status, 201);
      assert.equal((await statusProposal.json()).status, 'pending');
      const lineageAfterProposal = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/lineage`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.notEqual(
        (await lineageAfterProposal.json()).nodes.find((node) => node.id === 'figure_3').status,
        'superseded'
      );

      const handoffResponse = await fetch(`${baseUrl}/v1/projects/${visibleProjects[0].id}/handoff`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      const handoff = await handoffResponse.json();
      const reportResponse = await fetch(`${baseUrl}/v1/handoffs/${handoff.id}/report`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': `report-${Date.now()}`
        },
        body: JSON.stringify({
          format: 'markdown',
          include_path_tokens: true,
          include_sensitive_paths: false,
          include_open_findings: true
        })
      });
      assert.equal(reportResponse.status, 201);
      const report = await reportResponse.json();
      assert.match(report.sha256, /^[a-f0-9]{64}$/);
      assert.equal(report.markdown.includes('Sensitive paths included: false'), true);
      assert.equal('storagePath' in report, false);
      assert.equal('storageInternalPath' in report, false);
      assert.match(report.storageUri, /^lablineage-local:\/\//u);
      const storedReport = store.get().handoffReports.find((item) => item.id === report.id);
      assert.equal('markdown' in storedReport, false);
      assert.match(storedReport.objectKey, /^reports\//u);
      const savedReport = await fetch(`${baseUrl}/v1/handoffs/${handoff.id}/reports/${report.id}`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(savedReport.status, 200);
      assert.equal((await savedReport.json()).sha256, report.sha256);

      process.env.LABLINEAGE_AUTH_MODE = 'oidc';
      process.env.LABLINEAGE_SERVICE_TOKENS_JSON = JSON.stringify([{
        id: 'restricted',
        sha256: createHash('sha256').update('restricted-secret').digest('hex'),
        projects: ['another-project'],
        roles: ['viewer']
      }]);
      const crossProject = await fetch(`${baseUrl}/v1/artifacts/figure_3/lineage`, {
        headers: { authorization: 'Bearer restricted-secret' }
      });
      assert.equal(crossProject.status, 403);
    });
  } finally {
    await store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(originalState));
    });
    store.dataDir = originalDataDir;
    await rm(testDataDir, { recursive: true, force: true });
    if (previousMode === undefined) delete process.env.LABLINEAGE_AUTH_MODE;
    else process.env.LABLINEAGE_AUTH_MODE = previousMode;
    if (previousTokens === undefined) delete process.env.LABLINEAGE_SERVICE_TOKENS_JSON;
    else process.env.LABLINEAGE_SERVICE_TOKENS_JSON = previousTokens;
  }
});
