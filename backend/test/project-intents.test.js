import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  IntentVersionConflictError,
  appendNextProjectIntent,
  appendProjectIntent,
  createProjectSchema,
  projectDetail
} from '../lib/project-intents.js';
import { app, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';

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

async function withIsolatedStore(run) {
  const previousMode = process.env.LABLINEAGE_AUTH_MODE;
  const originalDataDir = store.dataDir;
  const originalState = structuredClone(store.get());
  const testDataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-project-intents-'));
  store.dataDir = testDataDir;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  await store.update((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, makeDemoState());
  });
  try {
    await run();
  } finally {
    store.dataDir = originalDataDir;
    process.env.LABLINEAGE_AUTH_MODE = previousMode;
    await store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, originalState);
    });
    await rm(testDataDir, { recursive: true, force: true });
  }
}

test('project intent schema normalizes concise string inputs', () => {
  const parsed = createProjectSchema.parse({
    name: '  Repro Project  ',
    slug: 'repro-project',
    objective: '  Reproduce the primary result.  ',
    successCriteria: ['Output hash matches the reference.'],
    keyOutputs: ['result.json']
  });
  assert.equal(parsed.name, 'Repro Project');
  assert.equal(parsed.objective, 'Reproduce the primary result.');
  assert.deepEqual(parsed.successCriteria, [{ description: 'Output hash matches the reference.', required: true }]);
  assert.deepEqual(parsed.keyOutputs, [{ name: 'result.json', kind: 'artifact', required: true }]);
});

test('project intent versions are immutable and reject stale updates', () => {
  const state = { projects: [{ id: 'project_1', updatedAt: '2026-01-01T00:00:00.000Z' }] };
  appendProjectIntent(state, {
    projectId: 'project_1',
    objective: 'Version one',
    successCriteria: [{ description: 'Criterion one', required: true }],
    actorSubject: 'creator',
    version: 1,
    now: '2026-01-01T00:00:00.000Z'
  });
  const versionTwo = appendNextProjectIntent(state, 'project_1', {
    expectedVersion: 1,
    objective: 'Version two',
    successCriteria: [{ description: 'Criterion two', required: true }],
    keyOutputs: [],
    constraints: []
  }, 'editor');
  assert.equal(versionTwo.version, 2);
  assert.equal(projectDetail(state, 'project_1').intent.objective, 'Version two');
  assert.equal(state.projectIntents[0].objective, 'Version one');
  assert.throws(() => appendNextProjectIntent(state, 'project_1', {
    expectedVersion: 1,
    objective: 'Stale write',
    successCriteria: [{ description: 'Must fail', required: true }],
    keyOutputs: [],
    constraints: []
  }, 'editor'), IntentVersionConflictError);
});

test('project API creates a project with intent and replays idempotently', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const idempotencyKey = randomUUID();
      const request = () => fetch(`${base}/v1/projects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'admin',
          'x-lablineage-user': 'project-admin',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({
          name: 'Evidence Ready Project',
          slug: 'evidence-ready-project',
          objective: 'Produce a traceable result.',
          successCriteria: [{ description: 'Every output cites its inputs.', required: true }],
          keyOutputs: [{ name: 'final-report.json', kind: 'report', required: true }],
          constraints: ['Do not expose absolute paths.']
        })
      });
      const createdResponse = await request();
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      assert.match(created.id, /^project_/);
      assert.equal(created.intent.version, 1);
      assert.equal(created.intent.successCriteria.length, 1);

      const replayResponse = await request();
      assert.equal(replayResponse.status, 201);
      assert.equal((await replayResponse.json()).id, created.id);
      assert.equal(store.get().projects.filter((project) => project.slug === 'evidence-ready-project').length, 1);

      const detailResponse = await fetch(`${base}/v1/projects/${created.id}`, {
        headers: { 'x-lablineage-role': 'viewer' }
      });
      assert.equal(detailResponse.status, 200);
      assert.equal((await detailResponse.json()).intent.objective, 'Produce a traceable result.');
    });
  });
});

test('project intent API creates version two and rejects a stale version', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const projectId = 'project_phase_transition';
      const body = {
        expectedVersion: 1,
        objective: 'Versioned objective',
        successCriteria: ['Versioned criterion'],
        keyOutputs: [],
        constraints: []
      };
      const response = await fetch(`${base}/v1/projects/${projectId}/intent-versions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).version, 2);

      const stale = await fetch(`${base}/v1/projects/${projectId}/intent-versions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'editor',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify(body)
      });
      assert.equal(stale.status, 409);

      const viewer = await fetch(`${base}/v1/projects/${projectId}/intent-versions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'viewer',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify({ ...body, expectedVersion: 2 })
      });
      assert.equal(viewer.status, 403);
    });
  });
});

test('project API rejects duplicate slugs and bounded objective collections', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const create = (body) => fetch(`${base}/v1/projects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'admin',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify(body)
      });
      const valid = {
        name: 'Bounded project',
        slug: 'bounded-project',
        objective: 'Verify bounded project input.',
        successCriteria: ['A criterion is present.']
      };
      assert.equal((await create(valid)).status, 201);
      assert.equal((await create({ ...valid, name: 'Duplicate slug' })).status, 409);
      assert.equal((await create({
        ...valid,
        slug: 'too-many-criteria',
        successCriteria: Array.from({ length: 21 }, (_, index) => `Criterion ${index}`)
      })).status, 400);
      assert.equal((await create({
        ...valid,
        slug: 'too-long-objective',
        objective: 'x'.repeat(4001)
      })).status, 400);
    });
  });
});

test('project API requires an objective and administrator role', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const viewer = await fetch(`${base}/v1/projects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'viewer',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify({ name: 'Denied', objective: 'Denied', successCriteria: ['Denied'] })
      });
      assert.equal(viewer.status, 403);

      const invalid = await fetch(`${base}/v1/projects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lablineage-role': 'admin',
          'idempotency-key': randomUUID()
        },
        body: JSON.stringify({ name: 'Missing objective', successCriteria: ['Criterion'] })
      });
      assert.equal(invalid.status, 400);
    });
  });
});
