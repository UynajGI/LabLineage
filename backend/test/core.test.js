import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAudit, scoreReproducibility } from '../lib/audit.js';
import { importManifest, verifyManifestBundle } from '../lib/manifest.js';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  applySnapshotRetention,
  diffSnapshots,
  materializeSnapshotIndex,
  scanDirectory
} from '../lib/scanner.js';

test('snapshot scanner hashes files, excludes secrets, and detects modifications', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lablineage-test-'));
  await mkdir(path.join(root, 'results'));
  await writeFile(path.join(root, 'results', 'figure.txt'), 'v1');
  await writeFile(path.join(root, '.env.local'), 'SECRET=do-not-scan');

  const first = await scanDirectory(root, { allowedRoot: root });
  assert.equal(first.fileCount, 1);
  assert.equal(first.files[0].pathToken, 'results/figure.txt');
  assert.match(first.files[0].contentHash, /^sha256:[a-f0-9]{64}$/);

  await writeFile(path.join(root, 'results', 'figure.txt'), 'v2');
  await writeFile(path.join(root, 'results', 'new.txt'), 'new');
  const second = await scanDirectory(root, { allowedRoot: root });
  const changes = diffSnapshots(first, second);
  assert.deepEqual(changes.map((change) => change.type).sort(), ['added', 'modified']);
});

test('production scanner requires an allowlisted root and exports path tokens', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lablineage-production-scan-'));
  await writeFile(path.join(root, 'result.txt'), 'safe');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(() => scanDirectory(root), /LABLINEAGE_SCAN_ROOT/);
    const snapshot = await scanDirectory(root, { allowedRoot: root, pathSalt: 'test-salt' });
    assert.match(snapshot.files[0].pathToken, /^pth_[a-f0-9]{32}$/);
    assert.equal(JSON.stringify(snapshot).includes('result.txt'), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('snapshot diff recognizes a content-preserving move', () => {
  const before = { id: 'before', files: [{ pathToken: 'old.csv', contentHash: 'sha256:x', sizeBytes: 3 }] };
  const after = { id: 'after', files: [{ pathToken: 'new.csv', contentHash: 'sha256:x', sizeBytes: 3 }] };
  const changes = diffSnapshots(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'moved');
  assert.equal(changes[0].path, 'old.csv → new.csv');
  assert.equal(changes[0].inference.kind, 'move_candidate');
  assert.equal(changes[0].inference.status, 'inferred');
  assert.equal(diffSnapshots(before, after)[0].id, changes[0].id);
});

test('snapshot diff emits bounded redacted text diff and binary metadata summaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lablineage-diff-'));
  await writeFile(path.join(root, 'analysis.py'), 'token = sk-abcdefghijklmnopqrstuvwxyz\nvalue = 1\n');
  await writeFile(path.join(root, 'model.bin'), Buffer.from([0, 1, 2]));
  const before = await scanDirectory(root, { allowedRoot: root, includeTextContent: true });

  await writeFile(path.join(root, 'analysis.py'), 'token = sk-abcdefghijklmnopqrstuvwxyz\nvalue = 2\n');
  await writeFile(path.join(root, 'model.bin'), Buffer.from([0, 1, 2, 3]));
  const after = await scanDirectory(root, { allowedRoot: root, includeTextContent: true });
  const changes = diffSnapshots(before, after);
  const text = changes.find((change) => change.path === 'analysis.py');
  const binary = changes.find((change) => change.path === 'model.bin');

  assert.equal(text.textDiff.format, 'unified');
  assert.match(text.diffSnippet, /-value = 1/u);
  assert.match(text.diffSnippet, /\+value = 2/u);
  assert.equal(text.diffSnippet.includes('sk-abcdefghijklmnopqrstuvwxyz'), false);
  assert.match(text.diffSnippet, /<redacted(?:-token)?>/u);
  assert.deepEqual(binary.metadataChanges.sizeBytes, { before: 3, after: 4 });
  assert.equal(binary.textDiff.reason, 'binary_or_unsupported');
});

test('copy candidates are not mislabeled as moves', () => {
  const before = {
    id: 'before-copy',
    files: [{ pathToken: 'original.csv', contentHash: 'sha256:same', sizeBytes: 3 }]
  };
  const after = {
    id: 'after-copy',
    files: [
      { pathToken: 'copy.csv', contentHash: 'sha256:same', sizeBytes: 3 },
      { pathToken: 'original.csv', contentHash: 'sha256:same', sizeBytes: 3 }
    ]
  };
  const changes = diffSnapshots(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'added');
  assert.equal(changes[0].inference.kind, 'copy_candidate');
});

test('snapshot retention compresses cold indexes without losing the audit chain', () => {
  const snapshots = Array.from({ length: 4 }, (_, index) => ({
    id: `snapshot-${index}`,
    projectId: 'project-1',
    collectedAt: new Date(2026, 0, index + 1).toISOString(),
    directoryRootHash: `sha256:${String(index).padStart(64, '0')}`,
    files: [{ pathToken: `file-${index}`, contentHash: `sha256:${index}`, sizeBytes: index }],
    changes: []
  }));
  const state = { snapshots };
  applySnapshotRetention(state, 'project-1', 2);

  assert.equal(Boolean(snapshots[0].compressedIndex), true);
  assert.equal('files' in snapshots[0], false);
  assert.equal(Boolean(snapshots[0].directoryRootHash), true);
  assert.equal(materializeSnapshotIndex(snapshots[0]).files[0].pathToken, 'file-0');
  assert.equal(Boolean(snapshots[2].files), true);
});

test('reproducibility scoring is deterministic', () => {
  const types = ['CodeVersion', 'Dataset', 'ParameterSet', 'Environment', 'Run', 'Figure'];
  const nodes = types.map((type, index) => ({ id: `n${index}`, type }));
  const edges = [{ source: 'n0', target: 'n4', confidence: 'exact' }];
  assert.deepEqual(scoreReproducibility(nodes, edges), {
    score: 100,
    level: 'R3',
    verifiedRerun: false,
    breakdown: [
      { key: 'code_version', weight: 20, passed: true },
      { key: 'input_dataset', weight: 15, passed: true },
      { key: 'parameter_set', weight: 15, passed: true },
      { key: 'environment_lock', weight: 15, passed: true },
      { key: 'captured_run', weight: 15, passed: true },
      { key: 'generated_output', weight: 10, passed: true },
      { key: 'lineage_evidence', weight: 10, passed: true }
    ],
    missing: ['verified_rerun']
  });
  assert.equal(createAudit('p1', nodes, edges).level, 'R3');
});

test('R4 requires a controlled rerun with exact output hash evidence', () => {
  const nodes = [
    { id: 'code', type: 'CodeVersion' },
    { id: 'data', type: 'Dataset' },
    { id: 'params', type: 'ParameterSet' },
    { id: 'env', type: 'Environment' },
    {
      id: 'rerun',
      type: 'Run',
      details: { executionMode: 'controlled-rerun', verificationStatus: 'verified', exitCode: '0' },
      evidenceIds: ['ev_execution']
    },
    { id: 'figure', type: 'Figure', details: { rerunHashMatch: 'true' } }
  ];
  const edges = [
    { source: 'code', target: 'rerun', relation: 'executed_as', confidence: 'exact', evidenceIds: ['ev_code'] },
    { source: 'rerun', target: 'figure', relation: 'generated', confidence: 'exact', evidenceIds: ['ev_output_hash'] }
  ];
  const result = scoreReproducibility(nodes, edges);
  assert.equal(result.level, 'R4');
  assert.equal(result.verifiedRerun, true);
  assert.equal(result.missing.includes('verified_rerun'), false);
});

test('manifest import validates schema and maps records to graph data', () => {
  const result = importManifest({
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'bundle_test',
    project_key: 'phase-transition',
    records: [
      { record_type: 'asset', asset_id: 'fig1', asset_type: 'figure', path_token: 'fig1.png', content_hash: `sha256:${'a'.repeat(64)}` },
      { record_type: 'run', run_id: 'run1', exit_code: 0 },
      { record_type: 'lineage_edge', from_entity_id: 'run1', to_entity_id: 'fig1', relation_type: 'generated', confidence_label: 'exact' }
    ]
  }, 'project_1');
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.evidence.length, 3);
  assert.equal(result.nodes[0].type, 'Figure');
});

test('manifest import rejects raw paths and secret-shaped fields', () => {
  assert.throws(() => importManifest({
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'unsafe',
    project_key: 'p1',
    records: [{ record_type: 'asset', asset_id: 'a1', absolute_path: 'C:\\secret\\result.csv' }]
  }, 'p1'), /Sensitive field is forbidden/);
});

test('signed manifest verification rejects tampering', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const manifest = {
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'signed-1',
    project_key: 'demo',
    records: []
  };
  const canonical = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  };
  const bundle = {
    manifest,
    signature: {
      algorithm: 'Ed25519',
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
      value_base64: sign(null, Buffer.from(canonical(manifest)), privateKey).toString('base64')
    }
  };
  assert.equal(verifyManifestBundle(bundle).manifest.bundle_id, 'signed-1');
  bundle.manifest.project_key = 'tampered';
  assert.throws(() => verifyManifestBundle(bundle), /signature is invalid/);
});

test('verified collector rerun can produce R4 after manifest import', () => {
  const records = [
    { record_type: 'code_version', asset_id: 'code', name: 'commit' },
    { record_type: 'asset', asset_id: 'data', asset_type: 'dataset', name: 'input' },
    { record_type: 'parameter_set', asset_id: 'params', name: 'params' },
    { record_type: 'environment', asset_id: 'env', name: 'environment' },
    {
      record_type: 'run',
      run_id: 'rerun',
      name: 'controlled rerun',
      exit_code: 0,
      execution_mode: 'controlled-rerun',
      verification_status: 'verified',
      evidence_ids: ['ev_execution']
    },
    {
      record_type: 'asset',
      asset_id: 'figure',
      asset_type: 'figure',
      name: 'figure',
      rerun_hash_match: true
    },
    {
      record_type: 'lineage_edge',
      from_entity_id: 'rerun',
      to_entity_id: 'figure',
      relation_type: 'generated',
      confidence_label: 'exact',
      evidence_ids: ['ev_output_hash']
    }
  ];
  const imported = importManifest({
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'verified-rerun',
    project_key: 'p1',
    records
  }, 'p1');
  assert.equal(createAudit('p1', imported.nodes, imported.edges).level, 'R4');
});
