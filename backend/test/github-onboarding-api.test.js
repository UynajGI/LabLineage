import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { buildApp, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';

const PROJECT_ID = 'project_phase_transition';

async function withIsolatedStore(run) {
  const previousMode = process.env.LABLINEAGE_AUTH_MODE;
  const originalDataDir = store.dataDir;
  const originalState = structuredClone(store.get());
  const dataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-github-onboarding-'));
  store.dataDir = dataDir;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  await store.update((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, makeDemoState());
  });
  try { await run(); } finally {
    store.dataDir = originalDataDir;
    process.env.LABLINEAGE_AUTH_MODE = previousMode;
    await store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, originalState);
    });
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function githubEvidence(owner, repo) {
  const sha = 'a'.repeat(40);
  return {
    repository: { id: 42, fullName: `${owner}/${repo}`, defaultBranch: 'main', visibility: 'private', htmlUrl: `https://github.com/${owner}/${repo}` },
    commits: [{ sha, message: 'analysis', committedAt: '2026-08-02T00:00:00Z', htmlUrl: `https://github.com/${owner}/${repo}/commit/${sha}` }],
    workflowRuns: [], pullRequests: [],
    repositorySnapshot: {
      headSha: sha, branch: 'main', branches: [{ name: 'main', sha }], tags: [], treeTruncated: false,
      tree: [{ pathToken: 'README.md', kind: 'file', sizeBytes: 12, contentHash: 'b'.repeat(40), fingerprint: { algorithm: 'git-blob-sha1', value: 'b'.repeat(40), strength: 'strong' } }],
    },
  };
}

function githubArchive() {
  const archive = new AdmZip();
  archive.addFile('fixture/README.md', Buffer.from('# Read-only fixture\n'));
  archive.addFile('fixture/reports/final.pdf', Buffer.from('synthetic-pdf-fixture'));
  return archive.toBuffer();
}

async function waitForRun(base, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await fetch(`${base}/v1/projects/${PROJECT_ID}/analysis-runs/${runId}`).then((response) => response.json());
    if (['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('GitHub analysis did not finish');
}

test('GitHub App source connects read-only and starts an immutable automatic run', async () => {
  let collectCalls = 0;
  let archiveCalls = 0;
  const app = buildApp({
    githubClientFactory: async () => ({
      collectRepository: async (owner, repo) => {
        collectCalls += 1;
        return githubEvidence(owner, repo);
      },
      downloadRepositoryArchive: async () => {
        archiveCalls += 1;
        const content = githubArchive();
        return { content, sizeBytes: content.length, resolvedUrlHost: 'codeload.github.com' };
      },
    }),
  });
  await withServer(app, async (base) => {
    await withIsolatedStore(async () => {
      const response = await fetch(`${base}/v1/projects/${PROJECT_ID}/sources/github`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lablineage-role': 'editor', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ repository: 'https://github.com/acme/lab.git', branch: 'main' }),
      });
      assert.equal(response.status, 202);
      const accepted = await response.json();
      const run = await waitForRun(base, accepted.runId);
      assert.equal(run.status, 'partial');
      assert.equal(run.sourceRevision, 'a'.repeat(40));
      const reportResponse = await fetch(`${base}${accepted.statusUrl}/report`);
      assert.equal(reportResponse.status, 200);
      const report = await reportResponse.json();
      assert.equal(report.document.sourceRevision, 'a'.repeat(40));
      assert.equal('objectKey' in report, false);
      const source = store.get().sources.find((item) => item.id === accepted.sourceId);
      assert.equal(source.accessPolicy.writes, false);
      const snapshot = store.get().snapshots.find((item) => item.id === run.steps.find((step) => step.name === 'ingest').artifactRefs[0].id);
      assert.equal(snapshot.fileCount, 2);
      assert.equal(snapshot.historyCoverage, 'pinned_repository_archive');
      assert.equal(collectCalls, 1);
      assert.equal(archiveCalls, 1);
    });
  });
});

test('GitHub source reports provider authorization, missing repository and rate limit errors distinctly', async () => {
  const app = buildApp({
    githubClientFactory: async () => ({
      collectRepository: async (owner) => {
        if (owner === 'timeout') throw Object.assign(new Error('GitHub request timed out'), { name: 'TimeoutError' });
        const statusCode = { revoked: 401, forbidden: 403, missing: 404, limited: 429 }[owner];
        throw Object.assign(new Error(`GitHub API ${statusCode}`), { statusCode });
      },
    }),
  });
  await withServer(app, async (base) => {
    await withIsolatedStore(async () => {
      const sourcesBefore = store.get().sources.length;
      const runsBefore = (store.get().analysisRuns || []).length;
      const viewer = await fetch(`${base}/v1/projects/${PROJECT_ID}/sources/github`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lablineage-role': 'viewer', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ repository: 'viewer/lab' }),
      });
      assert.equal(viewer.status, 403);
      for (const repository of ['https://gitlab.com/acme/lab', 'https://user@github.com/acme/lab', 'acme/lab/extra']) {
        const invalid = await fetch(`${base}/v1/projects/${PROJECT_ID}/sources/github`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-lablineage-role': 'editor', 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ repository }),
        });
        assert.equal(invalid.status, 400);
      }
      for (const [owner, expected] of [['revoked', 401], ['forbidden', 403], ['missing', 404], ['limited', 429], ['timeout', 504]]) {
        const response = await fetch(`${base}/v1/projects/${PROJECT_ID}/sources/github`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ repository: `${owner}/lab` }),
        });
        assert.equal(response.status, expected);
      }
      assert.equal(store.get().sources.length, sourcesBefore);
      assert.equal((store.get().analysisRuns || []).length, runsBefore);
    });
  });
});
