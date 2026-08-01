import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { app, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';
import { signManifest } from '../../collector/src/collector.js';

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withIsolatedStore(run) {
  const previousMode = process.env.LABLINEAGE_AUTH_MODE;
  const previousGoogle = process.env.GOOGLE_GENAI_API_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  const originalDataDir = store.dataDir;
  const originalState = structuredClone(store.get());
  const dataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-collector-api-'));
  store.dataDir = dataDir;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await store.update((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, makeDemoState());
  });
  try {
    await run();
  } finally {
    store.dataDir = originalDataDir;
    if (previousMode === undefined) delete process.env.LABLINEAGE_AUTH_MODE;
    else process.env.LABLINEAGE_AUTH_MODE = previousMode;
    if (previousGoogle === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousGoogle;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
    await store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, originalState);
    });
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function waitForTerminal(base, projectId, runId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${base}/v1/projects/${projectId}/analysis-runs/${runId}`, {
      headers: { 'x-lablineage-role': 'viewer' },
    });
    assert.equal(response.status, 200);
    const run = await response.json();
    if (['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('analysis run did not reach a terminal state');
}

test('editor pairs a local collector and its signed manifest starts automatic analysis', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const projectId = 'project_phase_transition';
      const pairingResponse = await fetch(`${base}/v1/projects/${projectId}/collector-pairings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-lablineage-role': 'editor',
          'x-lablineage-user': 'editor', 'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ expiresInSeconds: 600 }),
      });
      assert.equal(pairingResponse.status, 201);
      const pairing = await pairingResponse.json();
      assert.match(pairing.code, /^[A-Z0-9_-]{4}-/u);

      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const claimKey = randomUUID();
      const claimRequest = () => fetch(`${base}/v1/collector/pairings/${pairing.id}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': claimKey },
        body: JSON.stringify({
          code: pairing.code,
          publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
          deviceName: 'Local lab workstation',
        }),
      });
      const claimResponse = await claimRequest();
      assert.equal(claimResponse.status, 201);
      const claimed = await claimResponse.json();
      const claimReplay = await claimRequest();
      assert.equal(claimReplay.status, 201);
      assert.equal((await claimReplay.json()).collector.collectorId, claimed.collector.collectorId);
      assert.equal(store.get().collectorCredentials.length, 1);

      const bundle = signManifest({
        schema_version: 'lablineage.manifest.v1',
        bundle_id: 'collector-api-bundle-1',
        project_key: 'phase-transition',
        captured_at: '2026-08-02T00:00:00Z',
        directory_fingerprint: { value: 'c'.repeat(64) },
        records: [{
          record_type: 'asset', asset_id: 'figure', path_token: 'fig3.png',
          asset_type: 'figure', content_hash: `sha256:${'d'.repeat(64)}`, size_bytes: 100,
        }],
      }, privateKey.export({ type: 'pkcs8', format: 'pem' }));
      const runResponse = await fetch(`${base}${claimed.submitUrl}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify(bundle),
      });
      assert.equal(runResponse.status, 202);
      const accepted = await runResponse.json();
      assert.equal(accepted.sourceId, claimed.source.id);
      const run = await waitForTerminal(base, projectId, accepted.runId);
      assert.equal(run.status, 'partial', JSON.stringify(run, null, 2));
      assert.equal(run.deterministicReady, true);
      assert.deepEqual(run.steps.map((step) => step.name), [
        'ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize',
      ]);

      const reportResponse = await fetch(`${base}/v1/projects/${projectId}/analysis-runs/${accepted.runId}/report`, {
        headers: { 'x-lablineage-role': 'viewer' },
      });
      assert.equal(reportResponse.status, 200);
      const report = await reportResponse.json();
      assert.equal(report.document.agentStatus, 'unavailable');
      assert.equal(JSON.stringify(report).includes('objectKey'), false);
      assert.equal(JSON.stringify(report).includes(store.dataDir), false);

      const revoke = await fetch(`${base}/v1/projects/${projectId}/collectors/${claimed.collector.collectorId}/revoke`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-lablineage-role': 'admin',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ confirmation: 'REVOKE_COLLECTOR' }),
      });
      assert.equal(revoke.status, 200);
      const rejected = await fetch(`${base}${claimed.submitUrl}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify(signManifest({
          ...bundle.manifest,
          bundle_id: 'collector-api-bundle-2',
        }, privateKey.export({ type: 'pkcs8', format: 'pem' }))),
      });
      assert.equal(rejected.status, 401);
    });
  });
});
