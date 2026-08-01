import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { executeAnalysisRun } from '../lib/analysis-pipeline.js';
import { claimCollectorPairing, createCollectorPairing } from '../lib/collector-pairing.js';
import { createAnalysisRun } from '../lib/project-analysis.js';
import { appendProjectIntent } from '../lib/project-intents.js';
import { signManifest } from '../../collector/src/collector.js';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

class MemoryStore {
  constructor(state) {
    this.state = state;
  }
  get() { return this.state; }
  async update(callback) { return callback(this.state); }
}

class MemoryObjectStore {
  constructor() { this.objects = new Map(); }
  async putImmutable({ key, content }) {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const existing = this.objects.get(key);
    if (existing && !existing.equals(body)) throw new Error('immutable conflict');
    this.objects.set(key, body);
    return { uri: `memory://${key}`, sha256: sha256(body), sizeBytes: body.length, idempotent: Boolean(existing) };
  }
  async get(key) {
    const content = this.objects.get(key);
    if (!content) throw new Error('object not found');
    return { content, uri: `memory://${key}`, sha256: sha256(content) };
  }
}

async function pipelineFixture() {
  const state = {
    projects: [{ id: 'project_1', name: 'Project', slug: 'project-one', currentIntentVersion: 1 }],
    projectIntents: [], projectSuccessCriteria: [], projectKeyOutputs: [],
    nodes: [{ id: 'project_1', projectId: 'project_1', type: 'Project', label: 'Project', evidenceIds: [] }],
    edges: [], evidence: [], snapshots: [], importedBundles: [], audits: [], findings: [],
    sources: [], collectorPairings: [], collectorCredentials: [],
    analysisRuns: [], analysisRunSteps: [], analysisReports: [], analysisRunEvents: [],
  };
  appendProjectIntent(state, {
    projectId: 'project_1', objective: 'Publish a reproducible report.',
    successCriteria: [{ description: 'Report has reproducibility evidence', required: true }],
    keyOutputs: [{ name: 'Final report', kind: 'report', expectedPathHint: 'results/report.pdf', required: true }],
    actorSubject: 'admin', version: 1, now: '2026-08-02T00:00:00Z',
  });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pairing = createCollectorPairing(state, { projectId: 'project_1', actorSubject: 'admin' });
  const claimed = claimCollectorPairing(state, {
    pairingId: pairing.pairing.id,
    code: pairing.code,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    deviceName: 'workstation',
  });
  const manifest = {
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'bundle_1',
    project_key: 'project-one',
    captured_at: '2026-08-02T00:01:00Z',
    directory_fingerprint: { value: 'b'.repeat(64) },
    records: [{
      record_type: 'asset', asset_id: 'report', path_token: 'results/report.pdf',
      asset_type: 'figure', content_hash: `sha256:${'a'.repeat(64)}`, size_bytes: 42,
    }],
  };
  const bundle = signManifest(manifest, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const content = Buffer.from(JSON.stringify(bundle));
  const objectStore = new MemoryObjectStore();
  const inputObjectKey = 'collector/project_1/bundle_1.json';
  await objectStore.putImmutable({ key: inputObjectKey, content });
  const created = createAnalysisRun(state, {
    projectId: 'project_1', sourceId: claimed.source.id, sourceRevision: manifest.directory_fingerprint.value,
    inputKind: 'collector_manifest', inputObjectKey, inputSha256: sha256(content),
    idempotencyKey: 'collector-bundle-1', actorSubject: 'service:collector',
  });
  return { state, store: new MemoryStore(state), objectStore, run: created.run };
}

test('collector manifest automatically reaches an immutable completed report', async () => {
  const fixture = await pipelineFixture();
  const previousKey = process.env.GOOGLE_GENAI_API_KEY;
  process.env.GOOGLE_GENAI_API_KEY = 'test-only';
  try {
    const completed = await executeAnalysisRun(fixture.store, fixture.run.id, {
      objectStore: fixture.objectStore,
      leaseOwner: 'worker-1',
      invokeAgent: async () => {
        const assessment = fixture.state.analysisRuns[0].pipelineState.assessment;
        return {
          response: JSON.stringify({
            summary: 'The deterministic report is partially covered; scientific correctness is not proven.',
            evidenceIds: assessment.keyOutputResults.flatMap((item) => item.evidenceIds),
            missingEvidence: [],
            limitations: ['Evidence coverage does not prove scientific correctness.'],
          }),
          traceId: 'trace_1', model: 'stub-model', toolCalls: [],
        };
      },
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.deterministicReady, true);
    assert.equal(fixture.state.snapshots.length, 1);
    assert.equal(fixture.state.audits.length, 1);
    assert.equal(fixture.state.analysisReports.length, 1);
    const report = fixture.state.analysisReports[0];
    const stored = await fixture.objectStore.get(report.objectKey);
    const document = JSON.parse(stored.content.toString('utf8'));
    assert.equal(document.agentStatus, 'available');
    assert.equal(document.keyOutputResults[0].status, 'supported');
    assert.equal(document.keyOutputResults[0].evidenceIds.length > 0, true);
    const counts = {
      snapshots: fixture.state.snapshots.length,
      audits: fixture.state.audits.length,
      findings: fixture.state.findings.length,
      nodes: fixture.state.nodes.length,
      edges: fixture.state.edges.length,
      reports: fixture.state.analysisReports.length,
      objects: fixture.objectStore.objects.size,
    };
    const duplicateDelivery = await executeAnalysisRun(fixture.store, fixture.run.id, {
      objectStore: fixture.objectStore,
      leaseOwner: 'worker-duplicate',
      invokeAgent: async () => { throw new Error('terminal duplicate must not invoke the model'); },
    });
    assert.equal(duplicateDelivery.status, 'completed');
    assert.deepEqual({
      snapshots: fixture.state.snapshots.length,
      audits: fixture.state.audits.length,
      findings: fixture.state.findings.length,
      nodes: fixture.state.nodes.length,
      edges: fixture.state.edges.length,
      reports: fixture.state.analysisReports.length,
      objects: fixture.objectStore.objects.size,
    }, counts);
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousKey;
  }
});

test('invalid ADK structured output fails closed to partial without changing deterministic results', async () => {
  const fixture = await pipelineFixture();
  const previousKey = process.env.GOOGLE_GENAI_API_KEY;
  process.env.GOOGLE_GENAI_API_KEY = 'test-only';
  try {
    const completed = await executeAnalysisRun(fixture.store, fixture.run.id, {
      objectStore: fixture.objectStore,
      leaseOwner: 'worker-invalid-adk',
      invokeAgent: async () => ({ response: '{"summary":"tries to omit required fields"}', traceId: 'trace-invalid', model: 'stub-model', toolCalls: [] }),
    });
    assert.equal(completed.status, 'partial');
    assert.equal(completed.deterministicReady, true);
    const document = JSON.parse((await fixture.objectStore.get(fixture.state.analysisReports[0].objectKey)).content.toString('utf8'));
    assert.equal(document.keyOutputResults[0].status, 'supported');
    assert.equal(document.agentStatus, 'unavailable');
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousKey;
  }
});

test('ADK summary cannot cite evidence outside the deterministic assessment', async () => {
  const fixture = await pipelineFixture();
  const previousKey = process.env.GOOGLE_GENAI_API_KEY;
  process.env.GOOGLE_GENAI_API_KEY = 'test-only';
  try {
    const completed = await executeAnalysisRun(fixture.store, fixture.run.id, {
      objectStore: fixture.objectStore,
      leaseOwner: 'worker-invalid-evidence',
      invokeAgent: async () => ({
        response: JSON.stringify({ summary: 'Fabricated citation.', evidenceIds: ['ev_not_in_assessment'], missingEvidence: [], limitations: [] }),
        traceId: 'trace-invalid-evidence', model: 'stub-model', toolCalls: [],
      }),
    });
    assert.equal(completed.status, 'partial');
    assert.equal(completed.deterministicReady, true);
    assert.equal(fixture.state.analysisRunSteps.find((step) => step.name === 'agent_summary').errorCode, 'ADK_INVALID_EVIDENCE');
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousKey;
  }
});

test('ADK absence produces partial while preserving deterministic audit and report', async () => {
  const fixture = await pipelineFixture();
  const previousGoogle = process.env.GOOGLE_GENAI_API_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const completed = await executeAnalysisRun(fixture.store, fixture.run.id, {
      objectStore: fixture.objectStore,
      leaseOwner: 'worker-1',
    });
    assert.equal(completed.status, 'partial');
    assert.equal(completed.deterministicReady, true);
    assert.equal(fixture.state.analysisReports.length, 1);
    const report = fixture.state.analysisReports[0];
    const document = JSON.parse((await fixture.objectStore.get(report.objectKey)).content.toString('utf8'));
    assert.equal(document.agentStatus, 'unavailable');
    assert.equal(document.agentExplanation, null);
  } finally {
    if (previousGoogle === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousGoogle;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
  }
});

test('immutable GitHub evidence is pinned to a commit and automatically assessed', async () => {
  const state = {
    projects: [{ id: 'project_gh', name: 'GitHub Project', slug: 'github-project', currentIntentVersion: 1 }],
    projectIntents: [], projectSuccessCriteria: [], projectKeyOutputs: [],
    nodes: [{ id: 'project_gh', projectId: 'project_gh', type: 'Project', label: 'GitHub Project', evidenceIds: [] }],
    edges: [], evidence: [], snapshots: [], importedBundles: [], audits: [], findings: [],
    sources: [{ id: 'source_gh', projectId: 'project_gh', name: 'acme/lab', type: 'github', status: 'active', createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z' }],
    collectorPairings: [], collectorCredentials: [], analysisRuns: [], analysisRunSteps: [], analysisReports: [], analysisRunEvents: [],
  };
  appendProjectIntent(state, {
    projectId: 'project_gh', objective: 'Ship the documented analysis.',
    successCriteria: [{ description: 'Analysis code is present', required: true }],
    keyOutputs: [{ name: 'Analysis entry point', kind: 'code', expectedPathHint: 'src/analysis.js', required: true }],
    actorSubject: 'admin', version: 1, now: '2026-08-02T00:00:00Z',
  });
  const evidence = {
    capturedAt: '2026-08-02T00:01:00Z',
    repository: { id: 7, fullName: 'acme/lab', defaultBranch: 'main', visibility: 'private', htmlUrl: 'https://github.com/acme/lab' },
    commits: [{ sha: 'a'.repeat(40), message: 'Add analysis', committedAt: '2026-08-02T00:00:00Z', htmlUrl: 'https://github.com/acme/lab/commit/a' }],
    workflowRuns: [], pullRequests: [],
    repositorySnapshot: {
      headSha: 'a'.repeat(40), branch: 'main', branches: [{ name: 'main', sha: 'a'.repeat(40) }], tags: [], treeTruncated: false,
      tree: [{ pathToken: 'src/analysis.js', kind: 'file', sizeBytes: 10, contentHash: 'b'.repeat(40), fingerprint: { algorithm: 'git-blob-sha1', value: 'b'.repeat(40), strength: 'strong' } }],
    },
  };
  const content = Buffer.from(JSON.stringify(evidence));
  const objectStore = new MemoryObjectStore();
  await objectStore.putImmutable({ key: 'github/input.json', content });
  const created = createAnalysisRun(state, {
    projectId: 'project_gh', sourceId: 'source_gh', sourceRevision: 'a'.repeat(40), inputKind: 'github',
    inputObjectKey: 'github/input.json', inputSha256: sha256(content), idempotencyKey: 'github-analysis-1', actorSubject: 'admin',
  });
  const previousGoogle = process.env.GOOGLE_GENAI_API_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const completed = await executeAnalysisRun(new MemoryStore(state), created.run.id, { objectStore, leaseOwner: 'github-worker' });
    assert.equal(completed.status, 'partial');
    assert.equal(state.snapshots[0].sourceRevision, 'a'.repeat(40));
    assert.equal(state.snapshots[0].files[0].pathToken, 'src/analysis.js');
    const document = JSON.parse((await objectStore.get(state.analysisReports[0].objectKey)).content.toString('utf8'));
    assert.equal(document.keyOutputResults[0].status, 'supported');
    assert.equal(document.sourceRevision, 'a'.repeat(40));
  } finally {
    if (previousGoogle === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = previousGoogle;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
  }
});
