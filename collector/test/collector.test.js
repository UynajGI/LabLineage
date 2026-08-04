import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readOfflineArchive, verifyOfflineArchive, writeOfflineArchive } from '../src/archive.js';
import { collectSnapshot, diffManifests, signManifest, verifyBundle } from '../src/collector.js';
import { imageMetadata, parseConfig, parseLog, parseNotebook, parsePython } from '../src/parsers.js';
import { attachRunEvidence, captureRun } from '../src/run.js';
import { uploadBundle, uploadQueue } from '../src/upload.js';

const execFile = promisify(execFileCallback);

test('Python parser extracts common reads and writes', () => {
  const evidence = parsePython("df = pd.read_csv('data/input.csv')\ndf.to_csv('out/result.csv')", 'analysis.py');
  assert.deepEqual(evidence.map((item) => item.relation), ['reads_from', 'writes_to']);
});

test('Notebook parser tracks cell origin', () => {
  const notebook = JSON.stringify({
    metadata: { kernelspec: { name: 'python3' }, language_info: { name: 'python', version: '3.12' } },
    cells: [{
      cell_type: 'code',
      source: ["plt.savefig('fig.png')"],
      execution_count: 3,
      outputs: [{ output_type: 'stream', text: ['Saved to table.csv\n'] }]
    }]
  });
  const parsed = parseNotebook(notebook, 'study.ipynb');
  const evidence = parsed.find((item) => item.parser === 'notebook-python-static-v1');
  assert.equal(evidence.code_path, 'study.ipynb#cell-1');
  assert.equal(evidence.execution_count, 3);
  assert.equal(parsed.some((item) => item.parser === 'notebook-output-v1' && item.referenced_path === 'table.csv'), true);
  assert.equal(parsed.find((item) => item.record_type === 'parameter_set').parameters.kernel, 'python3');
});

test('log parser extracts structured and conservative text evidence', () => {
  const evidence = parseLog([
    '{"input":"data/source.csv","exit_code":0}',
    'Saved to results/figure.png',
    'ERROR: render failed'
  ].join('\n'), 'run.log');
  assert.equal(evidence.some((item) => item.relation === 'reads_from' && item.confidence_label === 'exact'), true);
  assert.equal(evidence.some((item) => item.relation === 'writes_to'), true);
  assert.equal(evidence.some((item) => item.relation === 'run_failure_signal'), true);
});

test('Slurm failures and safe configuration parameters are structured without leaking secrets', () => {
  const log = parseLog('JobState=OUT_OF_MEMORY\nslurmstepd: error: Detected 1 oom-kill event', 'slurm-1.out');
  assert.equal(log.some((item) => item.job_state === 'OUT_OF_MEMORY'), true);
  assert.equal(log.some((item) => item.failure_reason === 'out_of_memory'), true);
  const [config] = parseConfig('epochs: 20\napi_key: must-not-leak\nmodel: private-name\n', 'params.yaml');
  assert.equal(config.parameters.epochs, 20);
  assert.equal(config.parameters.api_key, '[REDACTED]');
  assert.equal(config.parameters.model, '[REDACTED_STRING]');
  assert.equal(JSON.stringify(config).includes('must-not-leak'), false);
  assert.equal(JSON.stringify(config).includes('private-name'), false);
});

test('PNG metadata parser returns dimensions without decoding pixels', () => {
  const png = Buffer.alloc(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageMetadata(png, 'figure.png'), { width: 640, height: 480, format: 'png' });
});

test('collector exports path tokens and reuses cached hashes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-'));
  await mkdir(path.join(root, '.lablineage'));
  await writeFile(path.join(root, 'analysis.py'), "open('input.csv')\n");
  await writeFile(path.join(root, 'input.csv'), 'x\n1\n');
  const options = {
    root,
    projectKey: 'test-project',
    pathSalt: 'test-only-secret',
    indexPath: path.join(root, '.lablineage', 'index.sqlite')
  };
  const first = await collectSnapshot(options);
  const second = await collectSnapshot(options);
  assert.equal(first.stats.files, 2);
  assert.equal(second.stats.hash_cache_hits, 2);
  assert.ok(first.records.every((record) => !JSON.stringify(record).includes(root)));
  assert.ok(first.records.some((record) => record.record_type === 'lineage_edge'));
});

test('an interrupted scan resumes from the SQLite hash cache without publishing a snapshot', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-resume-'));
  await writeFile(path.join(root, 'a.txt'), 'a');
  await writeFile(path.join(root, 'b.txt'), 'b');
  const controller = new AbortController();
  const options = {
    root,
    projectKey: 'resume-test',
    pathSalt: 'test-salt',
    signal: controller.signal,
    onProgress: ({ processedFiles }) => {
      if (processedFiles === 1) controller.abort();
    }
  };
  await assert.rejects(collectSnapshot(options), /aborted/);
  const resumed = await collectSnapshot({
    root,
    projectKey: 'resume-test',
    pathSalt: 'test-salt'
  });
  assert.equal(resumed.stats.files, 2);
  assert.equal(resumed.stats.hash_cache_hits >= 1, true);
});

test('collector records cooperative CPU/IO policy and enforces scan duration', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-resource-policy-'));
  await Promise.all([
    writeFile(path.join(root, 'one.txt'), 'one'),
    writeFile(path.join(root, 'two.txt'), 'two'),
    writeFile(path.join(root, 'three.txt'), 'three'),
  ]);
  const snapshot = await collectSnapshot({
    root,
    projectKey: 'resource-policy',
    pathSalt: 'resource-policy-salt',
    cpuYieldEveryFiles: 1,
    maxDurationMs: 10_000,
  });
  assert.equal(snapshot.stats.scheduler_yields, 3);
  assert.equal(snapshot.stats.resource_policy.cpu_yield_every_files, 1);
  assert.equal(snapshot.stats.resource_policy.max_duration_ms, 10_000);

  const throttledRoot = await mkdtemp(path.join(tmpdir(), 'lablineage-resource-timeout-'));
  await writeFile(path.join(throttledRoot, 'slow.bin'), Buffer.alloc(4096, 1));
  await assert.rejects(
    () => collectSnapshot({
      root: throttledRoot,
      projectKey: 'resource-timeout',
      pathSalt: 'resource-timeout-salt',
      maxBytesPerSecond: 1,
      maxDurationMs: 20,
    }),
    (error) => error.code === 'SCAN_TIMEOUT',
  );
});

test('Ed25519 bundle detects tampering', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const manifest = { schema_version: 'lablineage.manifest.v1', bundle_id: 'b1', project_key: 'p1', records: [] };
  const bundle = signManifest(manifest, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.equal(verifyBundle(bundle), true);
  bundle.manifest.project_key = 'tampered';
  assert.equal(verifyBundle(bundle), false);
});

test('large-file strategy records a sampled fingerprint and directory digest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-large-'));
  await writeFile(path.join(root, 'large.bin'), Buffer.alloc(256, 0x5a));
  const manifest = await collectSnapshot({
    root,
    projectKey: 'large-test',
    pathSalt: 'test-salt',
    fullHashMaxBytes: 128,
    sampleChunkBytes: 32
  });
  const asset = manifest.records.find((record) => record.record_type === 'asset');
  assert.equal(asset.fingerprint.strength, 'sampled');
  assert.equal(asset.fingerprint.sampling_policy, 'first-middle-last:32B');
  assert.match(asset.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(manifest.directory_fingerprint.value, /^[a-f0-9]{64}$/);
});

test('offline tar.zst export verifies signature and rejects tampering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-archive-'));
  const archive = path.join(root, 'handoff.tar.zst');
  const { privateKey } = generateKeyPairSync('ed25519');
  const bundle = signManifest(
    { schema_version: 'lablineage.manifest.v1', bundle_id: 'archive-b1', project_key: 'p1', records: [] },
    privateKey.export({ type: 'pkcs8', format: 'pem' })
  );
  await writeOfflineArchive(bundle, archive);
  assert.equal((await verifyOfflineArchive(archive)).manifest.bundle_id, 'archive-b1');
  const bytes = await readFile(archive);
  bytes[0] ^= 0xff;
  await writeFile(archive, bytes);
  await assert.rejects(readOfflineArchive(archive));
});

test('documented init, scan, diff, export and verify CLI workflow works', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-cli-'));
  const cli = path.resolve('src/cli.js');
  const invoke = (...args) => execFile(process.execPath, [cli, ...args], { cwd: path.resolve('.') });
  await writeFile(path.join(root, 'analysis.py'), "print('first')\n");
  await invoke('init', '--project', 'cli-test', '--root', root);
  const first = await invoke('scan', '--project', 'cli-test', '--root', root);
  const firstId = first.stdout.match(/Snapshot (snap_[^:]+):/)?.[1];
  assert.ok(firstId);
  await writeFile(path.join(root, 'analysis.py'), "print('second')\n");
  const second = await invoke('scan', '--project', 'cli-test', '--root', root);
  const secondId = second.stdout.match(/Snapshot (snap_[^:]+):/)?.[1];
  assert.ok(secondId);
  const difference = await invoke(
    'diff', '--project', 'cli-test', '--root', root, '--from', firstId, '--to', secondId
  );
  assert.equal(JSON.parse(difference.stdout).modified.length, 1);
  const archive = path.join(root, 'handoff.tar.zst');
  await invoke('export', '--project', 'cli-test', '--root', root, '--snapshot', 'latest', '--output', archive);
  const verified = await invoke('verify', archive);
  assert.match(verified.stdout, /signature valid/);
});

test('collector excludes common secret files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-secret-'));
  await writeFile(path.join(root, '.env'), 'TOKEN=must-not-leak');
  await writeFile(path.join(root, 'analysis.py'), 'print(1)');
  const manifest = await collectSnapshot({ root, projectKey: 'secret-test', pathSalt: 'test-salt' });
  assert.equal(JSON.stringify(manifest).includes('must-not-leak'), false);
  assert.equal(manifest.records.some((record) => record.name === '.env'), false);
});

test('manifest diff detects content-preserving moves', () => {
  const before = { records: [{ record_type: 'asset', asset_id: 'old', content_hash: 'sha256:a' }] };
  const after = { records: [{ record_type: 'asset', asset_id: 'new', content_hash: 'sha256:a' }] };
  const diff = diffManifests(before, after);
  assert.equal(diff.moved.length, 1);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.deleted.length, 0);
});

test('controlled run redacts secrets and verifies matching output hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-run-'));
  const output = path.join(root, 'result.txt');
  const script = `require('fs').writeFileSync(${JSON.stringify(output)}, 'verified')`;
  const run = await captureRun({
    root,
    command: process.execPath,
    args: ['-e', script, '--', '--token=must-not-leak'],
    timeoutMs: 10_000
  });
  assert.equal(run.exit_code, 0);
  assert.equal(run.command_redacted.includes('must-not-leak'), false);
  const hash = `sha256:${createHash('sha256').update('verified').digest('hex')}`;
  const before = { records: [] };
  const after = { records: [{ record_type: 'asset', asset_id: 'result', content_hash: hash }] };
  const expected = { records: [{ record_type: 'asset', asset_id: 'result', content_hash: hash }] };
  const manifest = attachRunEvidence(before, after, run, expected);
  assert.equal(manifest.run_capture.verified, true);
  assert.equal(manifest.records.find((record) => record.asset_id === 'result').rerun_hash_match, true);
  assert.equal(manifest.records.find((record) => record.run_id === run.run_id).verification_status, 'verified');
});

test('reference study produces a complete evidence-backed run spine', async () => {
  const fixtureRoot = fileURLToPath(new URL('../../examples/reference-study/', import.meta.url));
  const golden = JSON.parse(await readFile(new URL('./fixtures/reference-study.golden.json', import.meta.url), 'utf8'));
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-reference-'));
  await mkdir(path.join(root, 'data'), { recursive: true });
  await mkdir(path.join(root, 'results'), { recursive: true });
  for (const relative of ['analysis.mjs', 'params.json', 'data/input.csv']) {
    await writeFile(path.join(root, relative), await readFile(path.join(fixtureRoot, relative)));
  }
  const args = ['analysis.mjs', 'data/input.csv', 'params.json', 'results/chart.svg'];
  await execFile(process.execPath, args, { cwd: root });
  const options = { root, projectKey: 'reference-study', pathSalt: 'reference-test-salt' };
  const expected = await collectSnapshot(options);
  const before = await collectSnapshot(options);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const run = await captureRun({ root, command: process.execPath, args });
  const after = await collectSnapshot(options);
  const manifest = attachRunEvidence(before, after, run, expected, {
    root,
    projectKey: 'reference-study',
    command: process.execPath,
    args
  });
  const runEdges = manifest.records.filter((record) => (
    record.record_type === 'lineage_edge' &&
    (record.from_entity_id === run.run_id || record.to_entity_id === run.run_id)
  ));
  assert.deepEqual(
    [...new Set(runEdges.map((edge) => edge.relation_type))].sort(),
    golden.relations
  );
  assert.equal(runEdges.every((edge) => edge.evidence_ids?.length > 0), true);
  for (const [relation, assetType] of Object.entries(golden.sourceAssetTypes)) {
    const edge = runEdges.find((candidate) => candidate.relation_type === relation);
    const source = manifest.records.find((record) => record.asset_id === edge.from_entity_id);
    assert.equal(source.asset_type, assetType);
  }
  const generated = runEdges.find((edge) => edge.relation_type === 'generated');
  const output = manifest.records.find((record) => record.asset_id === generated.to_entity_id);
  assert.equal(output.asset_type, golden.outputAssetType);
  assert.equal(manifest.run_capture.verified, golden.verified);
  assert.equal(JSON.stringify(manifest).includes(root), false);
});

test('bundle upload retries transient responses with a stable idempotency key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-upload-'));
  const filename = path.join(root, 'bundle.json');
  await writeFile(filename, JSON.stringify({
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'bundle-retry',
    project_key: 'project',
    records: []
  }));
  const requests = [];
  const result = await uploadBundle({
    filename,
    apiUrl: 'http://127.0.0.1:8788',
    sourceId: 'source with spaces',
    retries: 1,
    wait: async () => {},
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      return requests.length === 1
        ? new Response(JSON.stringify({ error: 'busy' }), { status: 503 })
        : new Response(JSON.stringify({ imported: true }), { status: 201 });
    }
  });
  assert.equal(result.bundleId, 'bundle-retry');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'http://127.0.0.1:8788/v1/sources/source%20with%20spaces/bundles');
  assert.equal(requests[0].headers['idempotency-key'], 'bundle-retry');
  assert.equal(requests[1].headers['idempotency-key'], 'bundle-retry');
});

test('paired collector upload targets the project analysis endpoint without a bearer secret', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-paired-upload-'));
  const filename = path.join(root, 'bundle.json');
  await writeFile(filename, JSON.stringify({
    schema_version: 'lablineage.manifest.v1',
    bundle_id: 'paired-bundle',
    project_key: 'project',
    records: []
  }));
  let request;
  const result = await uploadBundle({
    filename,
    apiUrl: 'https://guardian.example/base',
    projectId: 'project with spaces',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ runId: 'analysis_1', statusUrl: '/status' }), { status: 202 });
    }
  });
  assert.equal(result.result.runId, 'analysis_1');
  assert.equal(request.url, 'https://guardian.example/v1/projects/project%20with%20spaces/collector-runs');
  assert.equal('authorization' in request.init.headers, false);
  assert.equal(request.init.headers['idempotency-key'], 'paired-bundle');
});

test('upload queue resumes after failure without resending completed bundles', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lablineage-queue-'));
  const stateFile = path.join(root, 'upload-state.json');
  for (const id of ['bundle-1', 'bundle-2']) {
    await writeFile(path.join(root, `${id}.json`), JSON.stringify({
      schema_version: 'lablineage.manifest.v1',
      bundle_id: id,
      project_key: 'project',
      records: []
    }));
  }
  const firstCalls = [];
  await assert.rejects(uploadQueue({
    queueDirectory: root,
    stateFile,
    apiUrl: 'http://127.0.0.1:8788',
    retries: 0,
    fetchImpl: async (_url, init) => {
      const id = init.headers['idempotency-key'];
      firstCalls.push(id);
      if (id === 'bundle-2') throw new Error('offline');
      return new Response(JSON.stringify({ imported: true }), { status: 201 });
    }
  }), /offline/);
  assert.deepEqual(firstCalls, ['bundle-1', 'bundle-2']);

  const resumedCalls = [];
  const resumed = await uploadQueue({
    queueDirectory: root,
    stateFile,
    apiUrl: 'http://127.0.0.1:8788',
    retries: 0,
    fetchImpl: async (_url, init) => {
      resumedCalls.push(init.headers['idempotency-key']);
      return new Response(JSON.stringify({ imported: true }), { status: 201 });
    }
  });
  assert.deepEqual(resumedCalls, ['bundle-2']);
  assert.equal(resumed.uploaded, 1);
  assert.equal(resumed.skipped, 1);
});
