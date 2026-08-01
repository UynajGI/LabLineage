import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleCloudAnalysisDispatcher, LocalAnalysisDispatcher } from '../lib/analysis-dispatcher.js';
import { authenticateCloudTask } from '../lib/cloud-task-auth.js';

function memoryStore(state) {
  return { get: () => state, update: async (callback) => callback(state) };
}

test('local dispatcher deduplicates in-process delivery and runs asynchronously', async () => {
  const state = { analysisRuns: [{ id: 'run_1', status: 'queued' }], analysisRunSteps: [] };
  let calls = 0;
  const dispatcher = new LocalAnalysisDispatcher({
    store: memoryStore(state),
    objectStore: {},
    execute: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.analysisRuns[0].status = 'completed';
      return state.analysisRuns[0];
    },
  });
  const first = await dispatcher.dispatch('run_1');
  const replay = await dispatcher.dispatch('run_1');
  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 1);
  await dispatcher.close();
});

test('local dispatcher recovers every non-terminal run after process restart', async () => {
  const state = {
    analysisRuns: [
      { id: 'run_queued', status: 'queued' },
      { id: 'run_expired_lease', status: 'scanning' },
      { id: 'run_done', status: 'completed' },
    ],
    analysisRunSteps: [],
  };
  const calls = [];
  const dispatcher = new LocalAnalysisDispatcher({
    store: memoryStore(state),
    objectStore: {},
    execute: async (_store, runId) => {
      calls.push(runId);
      state.analysisRuns.find((run) => run.id === runId).status = 'completed';
    },
  });
  const recovered = await dispatcher.recover();
  assert.equal(recovered.recovered, 2);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls.sort(), ['run_expired_lease', 'run_queued']);
  await dispatcher.close();
});

test('Google Cloud dispatcher creates a deterministic OIDC HTTP task', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    GOOGLE_CLOUD_PROJECT: 'example-project',
    LABLINEAGE_TASKS_LOCATION: 'asia-east1',
    LABLINEAGE_TASKS_QUEUE: 'analysis',
    LABLINEAGE_ANALYSIS_WORKER_URL: 'https://guardian.example/internal/analysis-worker',
    LABLINEAGE_TASKS_AUDIENCE: 'https://guardian.example',
    LABLINEAGE_TASKS_SERVICE_ACCOUNT: 'tasks@example.iam.gserviceaccount.com',
  });
  const requests = [];
  const client = {
    queuePath: (...parts) => `queues/${parts.join('/')}`,
    taskPath: (...parts) => `tasks/${parts.join('/')}`,
    createTask: async (request) => { requests.push(request); },
    close: async () => {},
  };
  try {
    const dispatcher = new GoogleCloudAnalysisDispatcher({
      store: memoryStore({ analysisRuns: [{ id: 'run_1', version: 3, retryCount: 1, status: 'queued' }] }),
      client,
    });
    await dispatcher.dispatch('run_1');
    assert.equal(requests.length, 1);
    const http = requests[0].task.httpRequest;
    assert.equal(http.url, process.env.LABLINEAGE_ANALYSIS_WORKER_URL);
    assert.equal(http.oidcToken.serviceAccountEmail, process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT);
    assert.equal(http.oidcToken.audience, process.env.LABLINEAGE_TASKS_AUDIENCE);
    assert.deepEqual(JSON.parse(Buffer.from(http.body, 'base64').toString('utf8')), { runId: 'run_1' });
    assert.match(requests[0].task.name, /analysis-[a-f0-9]{40}$/u);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('Cloud Tasks middleware verifies audience and service account identity', async () => {
  const previousAudience = process.env.LABLINEAGE_TASKS_AUDIENCE;
  const previousAccount = process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT;
  process.env.LABLINEAGE_TASKS_AUDIENCE = 'https://guardian.example';
  process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT = 'tasks@example.iam.gserviceaccount.com';
  try {
    let verified;
    const middleware = authenticateCloudTask({
      verifier: {
        verifyIdToken: async (options) => {
          verified = options;
          return { getPayload: () => ({ sub: 'subject', email_verified: true, email: process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT }) };
        },
      },
    });
    const req = { get: (name) => name === 'authorization' ? 'Bearer signed-token' : undefined };
    const res = { status: () => res, json: () => { throw new Error('unexpected rejection'); } };
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(verified, {
      idToken: 'signed-token', audience: 'https://guardian.example',
    });
    assert.equal(req.cloudTask.email, process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT);
  } finally {
    if (previousAudience === undefined) delete process.env.LABLINEAGE_TASKS_AUDIENCE;
    else process.env.LABLINEAGE_TASKS_AUDIENCE = previousAudience;
    if (previousAccount === undefined) delete process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT;
    else process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT = previousAccount;
  }
});
