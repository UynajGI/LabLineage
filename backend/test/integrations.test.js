import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  createGitHubClientFromEnv,
  GitHubClient,
  githubEvidenceToGraph,
  githubWebhookToGraph,
  verifyGitHubWebhook
} from '../lib/integrations/github.js';
import { createGoogleWorkspaceClientFromEnv, GoogleWorkspaceClient } from '../lib/integrations/workspace.js';

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('GitHub connector maps commits and workflow runs without exposing token', async () => {
  const calls = [];
  const client = new GitHubClient({
    token: 'secret-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.authorization });
      if (String(url).endsWith('/repos/acme/lab')) {
        return response({ id: 1, full_name: 'acme/lab', default_branch: 'main', visibility: 'private', html_url: 'https://github.test/acme/lab' });
      }
      if (String(url).includes('/branches/main')) return response({ name: 'main', commit: { sha: 'abc' } });
      if (String(url).includes('/commits')) {
        return response([{ sha: 'abc', commit: { message: 'analyze', author: { date: '2026-01-01T00:00:00Z' }, committer: { date: '2026-01-01T00:00:00Z' } }, author: { login: 'researcher' }, html_url: 'https://github.test/c/abc' }]);
      }
      if (String(url).includes('/actions/runs')) {
        return response({ workflow_runs: [{ id: 9, name: 'analysis', event: 'push', status: 'completed', conclusion: 'success', head_sha: 'abc', run_attempt: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z', html_url: 'https://github.test/r/9' }] });
      }
      if (String(url).includes('/pulls')) return response([{ number: 3, title: 'Analysis update', state: 'closed', draft: false, merged_at: '2026-01-01T00:00:00Z', head: { sha: 'abc' }, base: { ref: 'main' }, updated_at: '2026-01-01T00:00:00Z', html_url: 'https://github.test/p/3' }]);
      if (String(url).includes('/git/trees/abc')) return response({ truncated: false, tree: [{ path: 'src/main.js', type: 'blob', sha: 'blob1', size: 12 }] });
      if (String(url).includes('/branches?')) return response([{ name: 'main', commit: { sha: 'abc' } }]);
      if (String(url).includes('/tags?')) return response([{ name: 'v1', commit: { sha: 'abc' } }]);
      throw new Error(`Unexpected GitHub request: ${url}`);
    }
  });
  const evidence = await client.collectRepository('acme', 'lab');
  const graph = githubEvidenceToGraph('p1', evidence);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.evidence.length, 4);
  assert.equal(evidence.repositorySnapshot.headSha, 'abc');
  assert.equal(evidence.repositorySnapshot.tree[0].pathToken, 'src/main.js');
  assert.equal(evidence.pullRequests.length, 1);
  assert.equal(graph.edges[0].source, 'git_abc');
  assert.equal(graph.edges.some((edge) => edge.relation === 'proposed_in'), true);
  assert.ok(calls.every((call) => call.authorization === 'Bearer secret-token'));
  assert.equal(JSON.stringify(evidence).includes('secret-token'), false);
});

test('GitHub webhook signature uses SHA-256 HMAC', () => {
  const signature = `sha256=${createHmac('sha256', 'secret').update('{}').digest('hex')}`;
  assert.equal(verifyGitHubWebhook(Buffer.from('{}'), signature, 'secret'), true);
  assert.equal(verifyGitHubWebhook(Buffer.from('tampered'), signature, 'secret'), false);
});

test('GitHub archive download is read-only, bounded, and pinned to the requested revision', async () => {
  const calls = [];
  const client = new GitHubClient({
    token: 'archive-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method || 'GET', authorization: options.headers.authorization });
      return new Response(Buffer.from('zip-fixture'));
    },
  });
  const archive = await client.downloadRepositoryArchive('acme', 'lab', 'abc123');
  assert.equal(archive.content.toString(), 'zip-fixture');
  assert.match(calls[0].url, /\/repos\/acme\/lab\/zipball\/abc123$/u);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].authorization, 'Bearer archive-token');
  await assert.rejects(
    client.downloadRepositoryArchive('acme', 'lab', 'abc123', { maxBytes: 2 }),
    (error) => error.statusCode === 413,
  );
});

test('GitHub list pagination is bounded and never changes request method', async () => {
  const calls = [];
  const client = new GitHubClient({
    token: 'pagination-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      const page = Number(new URL(url).searchParams.get('page'));
      return response(page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
        : [{ id: 101 }]);
    },
  });
  const items = await client.requestList('/items', {}, { limit: 101 });
  assert.equal(items.length, 101);
  assert.equal(items.at(-1).id, 101);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.method === 'GET'), true);
});

test('GitHub webhook payload maps incrementally without an API round trip', () => {
  const graph = githubWebhookToGraph('project-1', 'workflow_run', {
    repository: { id: 1, full_name: 'acme/lab', default_branch: 'main', visibility: 'private' },
    workflow_run: {
      id: 77,
      name: 'analysis',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      head_sha: 'deadbeef',
      run_attempt: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z',
      html_url: 'https://github.test/runs/77'
    }
  });
  assert.equal(graph.evidence[0].evidenceType, 'github_workflow_run');
  assert.equal(graph.nodes.some((node) => node.id === 'git_deadbeef'), true);
  assert.equal(graph.edges[0].source, 'git_deadbeef');
});

test('GitHub App credentials exchange a short-lived installation token', async () => {
  const previous = {
    token: process.env.GITHUB_TOKEN,
    appId: process.env.GITHUB_APP_ID,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY
  };
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  delete process.env.GITHUB_TOKEN;
  process.env.GITHUB_APP_ID = '123';
  process.env.GITHUB_APP_INSTALLATION_ID = '456';
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const calls = [];
  try {
    const client = await createGitHubClientFromEnv({
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), authorization: options.headers.authorization });
        if (String(url).includes('/access_tokens')) return response({ token: 'installation-token' });
        return response({ login: 'app-bot' });
      }
    });
    assert.equal((await client.request('/user')).login, 'app-bot');
    assert.match(calls[0].authorization, /^Bearer eyJ/);
    assert.equal(calls[1].authorization, 'Bearer installation-token');
  } finally {
    for (const [key, value] of Object.entries({
      GITHUB_TOKEN: previous.token,
      GITHUB_APP_ID: previous.appId,
      GITHUB_APP_INSTALLATION_ID: previous.installationId,
      GITHUB_APP_PRIVATE_KEY: previous.privateKey
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Sheets append is idempotent by audit id', async () => {
  let writes = 0;
  const client = new GoogleWorkspaceClient({
    accessToken: 'workspace-token',
    fetchImpl: async (_url, options = {}) => {
      if (options.method === 'POST') writes += 1;
      return response({ values: [['audit-1', 'existing']] });
    }
  });
  const result = await client.appendSheetOnce({ spreadsheetId: 'sheet', range: 'Audit!A:E', auditId: 'audit-1', row: [] });
  assert.equal(result.idempotent, true);
  assert.equal(writes, 0);
});

test('Drive report reuses a file with the same hashed idempotency key', async () => {
  const calls = [];
  const client = new GoogleWorkspaceClient({
    accessToken: 'workspace-token',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      return response({ files: [{ id: 'drive-existing', name: 'handoff.md' }] });
    }
  });
  const result = await client.createDriveReport({
    name: 'handoff.md',
    markdown: '# report',
    idempotencyKey: 'private-request-key'
  });
  assert.equal(result.id, 'drive-existing');
  assert.equal(result.idempotent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes('private-request-key'), false);
});

test('Gmail draft reuses a deterministic Message-ID and never sends mail', async () => {
  const calls = [];
  const client = new GoogleWorkspaceClient({
    accessToken: 'workspace-token',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET', body: String(options.body || '') });
      if (!options.method) return response({ drafts: [] });
      return response({ id: 'draft-created' });
    }
  });
  const result = await client.createGmailDraft({
    to: 'receiver@example.edu',
    subject: 'Handoff',
    text: 'Review',
    idempotencyKey: 'private-request-key'
  });
  assert.equal(result.id, 'draft-created');
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
  assert.equal(calls.some((call) => call.url.includes('private-request-key') || call.body.includes('private-request-key')), false);
  const rawMessage = Buffer.from(JSON.parse(calls[1].body).message.raw, 'base64url').toString('utf8');
  assert.match(rawMessage, /^Message-ID: /m);
  assert.equal(calls[1].url.endsWith('/drafts'), true);
});

test('Workspace client refreshes OAuth without exposing refresh credentials', async () => {
  const names = ['GOOGLE_WORKSPACE_ACCESS_TOKEN', 'GOOGLE_WORKSPACE_CLIENT_ID', 'GOOGLE_WORKSPACE_CLIENT_SECRET', 'GOOGLE_WORKSPACE_REFRESH_TOKEN'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  delete process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN;
  process.env.GOOGLE_WORKSPACE_CLIENT_ID = 'client';
  process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN = 'refresh-secret';
  const calls = [];
  try {
    const client = await createGoogleWorkspaceClientFromEnv({
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), body: String(options.body || ''), authorization: options.headers?.authorization });
        if (String(url).includes('oauth2.googleapis.com')) return response({ access_token: 'short-lived-token' });
        return response({ drafts: [] });
      }
    });
    await client.request('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    assert.equal(calls[1].authorization, 'Bearer short-lived-token');
    assert.equal(calls[1].body.includes('refresh-secret'), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
