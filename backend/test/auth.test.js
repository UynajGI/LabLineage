import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { authenticateRequest, authorizeProject, hasRole } from '../lib/auth.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('development auth creates an explicit local actor', async () => {
  const previous = process.env.LABLINEAGE_AUTH_MODE;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  try {
    const req = { get: (name) => name === 'x-lablineage-role' ? 'auditor' : undefined };
    const res = responseRecorder();
    let nextCalled = false;
    await authenticateRequest()(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.actor.kind, 'development');
    assert.equal(hasRole(req.actor, 'auditor'), true);
    assert.equal(hasRole(req.actor, 'editor'), false);
  } finally {
    if (previous === undefined) delete process.env.LABLINEAGE_AUTH_MODE;
    else process.env.LABLINEAGE_AUTH_MODE = previous;
  }
});

test('service token is hashed and restricted to declared projects', async () => {
  const priorMode = process.env.LABLINEAGE_AUTH_MODE;
  const priorTokens = process.env.LABLINEAGE_SERVICE_TOKENS_JSON;
  process.env.LABLINEAGE_AUTH_MODE = 'oidc';
  process.env.LABLINEAGE_SERVICE_TOKENS_JSON = JSON.stringify([{
    id: 'collector',
    sha256: createHash('sha256').update('collector-secret').digest('hex'),
    projects: ['project-a'],
    roles: ['editor']
  }]);
  try {
    const req = {
      params: { projectId: 'project-a' },
      get: (name) => name === 'authorization' ? 'Bearer collector-secret' : undefined
    };
    const res = responseRecorder();
    await authenticateRequest()(req, res, () => {});
    assert.equal(req.actor.subject, 'service:collector');
    let allowed = false;
    authorizeProject('editor')(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
    req.params.projectId = 'project-b';
    authorizeProject('viewer')(req, res, () => {});
    assert.equal(res.statusCode, 403);
  } finally {
    if (priorMode === undefined) delete process.env.LABLINEAGE_AUTH_MODE;
    else process.env.LABLINEAGE_AUTH_MODE = priorMode;
    if (priorTokens === undefined) delete process.env.LABLINEAGE_SERVICE_TOKENS_JSON;
    else process.env.LABLINEAGE_SERVICE_TOKENS_JSON = priorTokens;
  }
});
