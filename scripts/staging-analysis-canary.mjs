import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signManifest } from '../collector/src/collector.js';

const baseUrl = String(process.env.LABLINEAGE_CANARY_URL || '').replace(/\/$/u, '');
const bearerToken = String(process.env.LABLINEAGE_CANARY_BEARER_TOKEN || '');
const developmentAuth = process.env.LABLINEAGE_CANARY_DEVELOPMENT_AUTH === 'true';
const githubRepository = String(process.env.LABLINEAGE_CANARY_GITHUB_REPOSITORY || '');
const requireGitHub = process.env.LABLINEAGE_CANARY_REQUIRE_GITHUB === 'true';
const outputPath = process.argv[2] || 'artifacts/analysis-canary.json';

if (!baseUrl || (!bearerToken && !developmentAuth)) {
  throw new Error('Canary URL and an approved authentication mode are required');
}
if (requireGitHub && !githubRepository) {
  throw new Error('GitHub canary is required but LABLINEAGE_CANARY_GITHUB_REPOSITORY is missing');
}

const authHeaders = developmentAuth
  ? { 'x-lablineage-role': 'admin', 'x-lablineage-user': 'container-canary' }
  : { authorization: `Bearer ${bearerToken}` };

async function request(pathname, { method = 'GET', body, authenticated = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(authenticated ? authHeaders : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'idempotency-key': randomUUID() })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const code = payload?.error?.code || payload?.code || `HTTP_${response.status}`;
    throw new Error(`${method} ${pathname} failed: ${code}`);
  }
  return payload;
}

async function waitForRun(projectId, runId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const run = await request(`/v1/projects/${projectId}/analysis-runs/${runId}`);
    if (['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) {
      if (!['completed', 'partial'].includes(run.status) || !run.deterministicReady) {
        throw new Error(`analysis ${runId} ended in ${run.status}`);
      }
      const report = await request(`/v1/projects/${projectId}/analysis-runs/${runId}/report`);
      if (!report.sha256 || !report.document?.criterionResults?.length) {
        throw new Error(`analysis ${runId} did not produce a verifiable objective report`);
      }
      return { run, report };
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1000 + attempt * 250)));
  }
  throw new Error(`analysis ${runId} did not reach a terminal state`);
}

const generatedAt = new Date().toISOString();
const suffix = randomUUID().slice(0, 8);
const project = await request('/v1/projects', {
  method: 'POST',
  body: {
    name: `Deployment canary ${suffix}`,
    slug: `deployment-canary-${suffix}`,
    objective: 'Verify source onboarding reaches a deterministic objective report.',
    successCriteria: [{ description: 'At least one immutable evidence item is recorded.', required: true }],
    keyOutputs: [{ name: 'Canary report', kind: 'artifact', required: true }],
    constraints: ['Synthetic fixture only; no research data.']
  }
});

const pairing = await request(`/v1/projects/${project.id}/collector-pairings`, {
  method: 'POST', body: { expiresInSeconds: 300 }
});
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const claimed = await request(`/v1/collector/pairings/${pairing.id}/claim`, {
  method: 'POST', authenticated: false,
  body: {
    code: pairing.code,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    deviceName: 'GitHub Actions deployment canary'
  }
});
const bundle = signManifest({
  schema_version: 'lablineage.manifest.v1',
  bundle_id: `deployment-canary-${suffix}`,
  project_key: project.slug,
  captured_at: generatedAt,
  directory_fingerprint: { value: createHash('sha256').update(`directory:${suffix}`).digest('hex') },
  records: [{
    record_type: 'asset', asset_id: 'canary-report', path_token: 'reports/canary.json',
    asset_type: 'output', content_hash: `sha256:${createHash('sha256').update(`report:${suffix}`).digest('hex')}`,
    size_bytes: 128
  }]
}, privateKey.export({ type: 'pkcs8', format: 'pem' }));
const collectorAccepted = await request(claimed.submitUrl, {
  method: 'POST', authenticated: false, body: bundle
});
const collectorResult = await waitForRun(project.id, collectorAccepted.runId);

let githubResult = null;
if (githubRepository) {
  const accepted = await request(`/v1/projects/${project.id}/sources/github`, {
    method: 'POST', body: { repository: githubRepository }
  });
  githubResult = await waitForRun(project.id, accepted.runId);
}

const evidence = {
  schemaVersion: 'lablineage.analysis-canary.v1',
  generatedAt,
  status: 'passed',
  projectIdSha256: createHash('sha256').update(project.id).digest('hex'),
  collector: {
    status: collectorResult.run.status,
    sourceRevision: collectorResult.run.sourceRevision,
    reportSha256: collectorResult.report.sha256,
    coverageScore: collectorResult.report.coverageScore
  },
  github: githubResult ? {
    status: githubResult.run.status,
    sourceRevision: githubResult.run.sourceRevision,
    reportSha256: githubResult.report.sha256,
    coverageScore: githubResult.report.coverageScore
  } : { status: 'not_run' }
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(`Analysis canary passed; evidence written to ${outputPath}`);
