import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { app, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';

const PROJECT_ID = 'project_phase_transition';

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
  const testDataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-lineage-'));
  store.dataDir = testDataDir;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  const fresh = makeDemoState();
  await store.update((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
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

async function withScannedProject(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lineage-scan-'));
  try {
    await mkdir(path.join(dir, 'analysis'), { recursive: true });
    await mkdir(path.join(dir, 'output'), { recursive: true });
    await writeFile(path.join(dir, 'analysis', 'run.py'), 'import pandas\nprint("render fig")\n');
    await writeFile(path.join(dir, 'analysis', 'config.yaml'), 'alpha: 1.2\nbeta: 0.5\n');
    await writeFile(path.join(dir, 'data', 'raw.csv'), 'a,b\n1,2\n').catch(() => {});
    await writeFile(path.join(dir, 'output', 'fig3.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function scanProject(base, dir) {
  const response = await fetch(`${base}/v1/projects/${PROJECT_ID}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ path: dir })
  });
  assert.equal(response.status, 201);
}

const CANDIDATE = {
  rationale: '脚本读取配置并生成图片',
  nodes: [
    { pathToken: 'analysis/run.py', kind: 'CodeVersion', label: 'run.py' },
    { pathToken: 'analysis/config.yaml', kind: 'ParameterSet', label: 'config.yaml' },
    { pathToken: 'output/fig3.png', kind: 'Figure', label: 'fig3.png' }
  ],
  edges: [
    { source: 'analysis/config.yaml', target: 'analysis/run.py', relation: 'used_parameter_set' },
    { source: 'analysis/run.py', target: 'output/fig3.png', relation: 'generated' }
  ]
};

async function submitProposal(base, body = CANDIDATE, idempotencyKey = randomUUID()) {
  return fetch(`${base}/v1/projects/${PROJECT_ID}/lineage-proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body)
  });
}

test('lineage proposal applies inferred nodes and edges from a snapshot', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      await withScannedProject(async (dir) => {
        await scanProject(base, dir);
        const response = await submitProposal(base);
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.equal(body.addedNodes, 3);
        assert.equal(body.addedEdges, 2);
        assert.equal(body.addedEvidence, 3);
        assert.equal(body.confidence, 'inferred');
        assert.equal(body.requiresHumanReview, true);
        assert.match(body.proposalId, /^lp_/u);
        // 图谱中出现推断节点/边
        const graph = await fetch(`${base}/v1/projects/${PROJECT_ID}/lineage`).then((r) => r.json());
        const runNode = graph.nodes.find((node) => node.details?.pathToken === 'analysis/run.py');
        assert.ok(runNode, 'run.py node should exist');
        assert.equal(runNode.status, 'inferred');
        assert.equal(runNode.confidence, 'inferred');
        const generatedEdge = graph.edges.find((edge) => edge.relation === 'generated' && edge.source === runNode.id);
        assert.ok(generatedEdge, 'generated edge from run.py should exist');
        assert.equal(generatedEdge.confidence, 'inferred');
        // 证据记录已生成
        const evidence = await fetch(`${base}/v1/projects/${PROJECT_ID}/evidence`).then((r) => r.json());
        assert.ok(evidence.some((item) => item.source === 'inferred_lineage'));
        // GET 列表可见
        const proposals = await fetch(`${base}/v1/projects/${PROJECT_ID}/lineage-proposals`).then((r) => r.json());
        assert.equal(proposals.length, 1);
        assert.equal(proposals[0].nodeCount, 3);
      });
    });
  });
});

test('lineage proposal requires a snapshot first', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const response = await submitProposal(base);
      assert.equal(response.status, 409);
    });
  });
});

test('lineage proposal rejects unknown path tokens', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      await withScannedProject(async (dir) => {
        await scanProject(base, dir);
        const response = await submitProposal(base, {
          ...CANDIDATE,
          nodes: [{ pathToken: 'does/not/exist.py', kind: 'CodeVersion' }]
        });
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.match(body.error, /Path token not found/u);
      });
    });
  });
});

test('lineage proposal rejects unsupported relations and kinds', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      await withScannedProject(async (dir) => {
        await scanProject(base, dir);
        const badRelation = await submitProposal(base, {
          ...CANDIDATE,
          edges: [{ source: 'analysis/run.py', target: 'output/fig3.png', relation: 'deletes' }]
        });
        assert.equal(badRelation.status, 400);
        const badKind = await submitProposal(base, {
          ...CANDIDATE,
          nodes: [{ pathToken: 'analysis/run.py', kind: 'Mystery' }]
        });
        assert.equal(badKind.status, 400);
      });
    });
  });
});

test('lineage proposal is idempotent and deduplicates repeated submissions', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      await withScannedProject(async (dir) => {
        await scanProject(base, dir);
        const key = randomUUID();
        const first = await submitProposal(base, CANDIDATE, key);
        assert.equal(first.status, 201);
        const firstBody = await first.json();
        const replay = await submitProposal(base, CANDIDATE, key);
        assert.equal(replay.status, 201);
        assert.equal(replay.headers.get('idempotency-replayed'), 'true');
        const replayBody = await replay.json();
        assert.equal(replayBody.proposalId, firstBody.proposalId);
        // 不同 key 的重复提交：节点复用、边去重
        const again = await submitProposal(base, CANDIDATE);
        assert.equal(again.status, 201);
        const againBody = await again.json();
        assert.equal(againBody.addedNodes, 0);
        assert.equal(againBody.addedEdges, 0);
        const graph = await fetch(`${base}/v1/projects/${PROJECT_ID}/lineage`).then((r) => r.json());
        assert.equal(graph.edges.filter((edge) => edge.relation === 'generated' && edge.source.startsWith('node_')).length, 1);
      });
    });
  });
});
