import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { app, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';
import { resolveSafeEntry, UPLOAD_LIMITS, validateArchiveEntries } from '../lib/upload.js';

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
  const testDataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-upload-'));
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

function zipWith(entries) {
  const zip = new AdmZip();
  for (const [name, content] of entries) zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  return zip.toBuffer();
}

// 手工构造 stored 方法 zip，保留原始条目名（含 ../、绝对路径），模拟真实攻击 zip
// （adm-zip 写入端会把 ../ 与绝对路径规范化掉，无法用它构造恶意条目）
function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function craftZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0, 12);
    head.writeUInt16LE(0x21, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt16LE(0, 30);
    head.writeUInt16LE(0, 32);
    head.writeUInt16LE(0, 34);
    head.writeUInt16LE(0, 36);
    head.writeUInt32LE(0, 38);
    head.writeUInt32LE(offset, 42);
    central.push({ head, name: nameBuf });
    offset += 30 + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralChunks = [];
  for (const { head, name } of central) {
    centralChunks.push(head, name);
    offset += head.length + name.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(offset - centralStart, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, ...centralChunks, eocd]);
}

async function postArchive(base, { zipBuffer, filename = 'project.zip', idempotencyKey = randomUUID() } = {}) {
  const form = new FormData();
  form.append('file', new Blob([zipBuffer]), filename);
  return fetch(`${base}/v1/projects/${PROJECT_ID}/archives`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form
  });
}

async function waitForRun(base, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${base}/v1/projects/${PROJECT_ID}/analysis-runs/${runId}`);
    const run = await response.json();
    if (['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Analysis run ${runId} did not reach a terminal state`);
}

test('upload archive queues durable automatic analysis and persists a project snapshot', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const zipBuffer = zipWith([
        ['analysis/fig3.py', 'print("render fig3")'],
        ['data/raw.csv', 'a,b\n1,2\n3,4\n'],
        ['output/fig3.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3])]
      ]);
      const response = await postArchive(base, { zipBuffer });
      assert.equal(response.status, 202);
      const body = await response.json();
      assert.ok(body.sourceId);
      assert.ok(body.runId);
      assert.equal(body.statusUrl, `/v1/projects/${PROJECT_ID}/analysis-runs/${body.runId}`);
      const run = await waitForRun(base, body.runId);
      assert.equal(run.status, 'partial');
      assert.ok(run.report);
      // 快照已入库且可列出
      const list = await fetch(`${base}/v1/projects/${PROJECT_ID}/snapshots`).then((r) => r.json());
      assert.equal(list.length, 1);
      assert.equal(list[0].fileCount, 3);
      assert.ok(list[0].directoryRootHash.startsWith('sha256:'));
      // 审计日志记录 scan_upload
      const audits = await fetch(`${base}/v1/projects/${PROJECT_ID}/audit-events`).then((r) => r.json());
      assert.ok(audits.some((event) => event.action === 'queue_zip_analysis'));
    });
  });
});

test('upload archive requires an Idempotency-Key', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const form = new FormData();
      form.append('file', new Blob([zipWith([['a.txt', 'x']])]), 'project.zip');
      const response = await fetch(`${base}/v1/projects/${PROJECT_ID}/archives`, { method: 'POST', body: form });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.error, /Idempotency-Key/u);
    });
  });
});

test('upload archive rejects non-multipart and non-zip payloads', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const json = await fetch(`${base}/v1/projects/${PROJECT_ID}/archives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ path: '/tmp' })
      });
      assert.equal(json.status, 415);
      const fakeZip = zipWith([['note.txt', 'i am not really a zip (but adm-zip wraps me)']]);
      const good = await postArchive(base, { zipBuffer: Buffer.from('PK\x03\x04not-a-real-zip-body') });
      assert.equal(good.status, 415);
      assert.ok(fakeZip.length > 0);
    });
  });
});

test('resolveSafeEntry rejects traversal, absolute and backslash-obfuscated names', () => {
  // 确定性单测：不依赖 adm-zip 的条目名规范化行为
  // （adm-zip 读取端会把 ..\ 洗白，只有真实攻击 zip 能触达这些名字——见 crafted 集成用例）
  const destDir = path.join(tmpdir(), 'resolve-safe-entry-root');
  const evil = [
    '../evil.txt',
    '..\\evil.txt',
    'a/../../b',
    'a\\..\\..\\b',
    '/absolute/path.txt',
    'C:\\windows\\file.txt',
    'a/../b',
    'a\\..\\b',
    '.\\.\\x',
    'a//..//b',
    '..',
    ''
  ];
  for (const name of evil) {
    assert.equal(resolveSafeEntry(destDir, name), null, `should reject: ${JSON.stringify(name)}`);
  }
  assert.equal(resolveSafeEntry(destDir, 'safe/ok.txt'), path.join(destDir, 'safe', 'ok.txt'));
});

test('archive metadata rejects symbolic links, compression bombs and excessive expanded totals before extraction', () => {
  const entry = ({ name, size, compressedSize, attr = 0 }) => ({
    entryName: name,
    isDirectory: false,
    attr,
    header: { size, compressedSize }
  });
  assert.throws(
    () => validateArchiveEntries([entry({
      name: 'escape-link',
      size: 8,
      compressedSize: 8,
      attr: 0xa000 << 16
    })]),
    (error) => error.statusCode === 422 && /symbolic link/u.test(error.message)
  );
  assert.throws(
    () => validateArchiveEntries([entry({
      name: 'compression-bomb.bin',
      size: 2 * 1024 * 1024,
      compressedSize: 1
    })]),
    (error) => error.statusCode === 422 && /compression ratio/u.test(error.message)
  );
  const oversizedTotal = Array.from({ length: 5 }, (_, index) => entry({
    name: `part-${index}.bin`,
    size: UPLOAD_LIMITS.maxSingleFileBytes,
    compressedSize: UPLOAD_LIMITS.maxSingleFileBytes
  }));
  assert.throws(
    () => validateArchiveEntries(oversizedTotal),
    (error) => error.statusCode === 413 && /Extracted archive/u.test(error.message)
  );
});

test('upload archive rejects ../ traversal entries in a crafted archive', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const zipBuffer = craftZip([
        { name: 'safe/ok.txt', data: Buffer.from('fine') },
        { name: '../evil.txt', data: Buffer.from('should not escape') },
        { name: '/absolute/abs.txt', data: Buffer.from('rejected') }
      ]);
      const response = await postArchive(base, { zipBuffer });
      assert.equal(response.status, 202);
      const body = await response.json();
      await waitForRun(base, body.runId);
      const snapshots = await fetch(`${base}/v1/projects/${PROJECT_ID}/snapshots`).then((r) => r.json());
      assert.equal(snapshots.at(-1).fileCount, 1);
      assert.equal(snapshots.at(-1).warnings.length, 2);
      assert.ok(snapshots.at(-1).warnings.some((warning) => warning.includes('../evil.txt')));
      assert.ok(snapshots.at(-1).warnings.some((warning) => warning.includes('/absolute/abs.txt')));
    });
  });
});

test('upload archive rejects an empty archive', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const zip = new AdmZip();
      const response = await postArchive(base, { zipBuffer: zip.toBuffer() });
      assert.equal(response.status, 400);
    });
  });
});

test('upload archive rejects single entries above the size limit', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      // 51 MiB 全零文件：zip 压缩后极小，解压时触发单文件上限
      const zipBuffer = zipWith([['big.bin', Buffer.alloc(51 * 1024 * 1024)]]);
      const response = await postArchive(base, { zipBuffer });
      assert.equal(response.status, 413);
    });
  });
});

test('upload archive is idempotent per Idempotency-Key', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const key = randomUUID();
      const zipBuffer = zipWith([['once.txt', 'only once']]);
      const first = await postArchive(base, { zipBuffer, idempotencyKey: key });
      assert.equal(first.status, 202);
      const firstBody = await first.json();
      const replay = await postArchive(base, { zipBuffer, idempotencyKey: key });
      assert.equal(replay.status, 202);
      assert.equal(replay.headers.get('idempotency-replayed'), 'true');
      const replayBody = await replay.json();
      assert.equal(replayBody.runId, firstBody.runId);
      const runs = await fetch(`${base}/v1/projects/${PROJECT_ID}/analysis-runs`).then((r) => r.json());
      assert.equal(runs.runs.filter((run) => run.id === firstBody.runId).length, 1);
    });
  });
});

test('upload archive rejects unknown projects', async () => {
  await withServer(async (base) => {
    await withIsolatedStore(async () => {
      const form = new FormData();
      form.append('file', new Blob([zipWith([['a.txt', 'x']])]), 'project.zip');
      const response = await fetch(`${base}/v1/projects/does-not-exist/archives`, {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: form
      });
      assert.equal(response.status, 404);
    });
  });
});
