import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createObjectStore } from '../lib/object-store.js';

test('local object store provides immutable content-addressed behavior', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-objects-'));
  const previousMode = process.env.LABLINEAGE_OBJECT_STORE;
  const previousDeploymentMode = process.env.LABLINEAGE_DEPLOYMENT_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    process.env.LABLINEAGE_DEPLOYMENT_MODE = 'local';
    process.env.LABLINEAGE_OBJECT_STORE = 'local';
    const objectStore = createObjectStore({ dataDir: directory });
    const created = await objectStore.putImmutable({
      key: 'reports/project/report.md',
      content: '# report\n',
      contentType: 'text/markdown',
    });
    assert.equal(created.idempotent, false);
    assert.match(created.uri, /^lablineage-local:\/\//u);

    const replay = await objectStore.putImmutable({
      key: 'reports/project/report.md',
      content: '# report\n',
      contentType: 'text/markdown',
    });
    assert.equal(replay.idempotent, true);
    assert.equal((await objectStore.get('reports/project/report.md')).content.toString('utf8'), '# report\n');

    await assert.rejects(
      () => objectStore.putImmutable({ key: 'reports/project/report.md', content: 'different' }),
      /different content/u,
    );
    await assert.rejects(
      () => objectStore.putImmutable({ key: '../escape', content: 'unsafe' }),
      /Unsafe object key/u,
    );

    process.env.NODE_ENV = 'production';
    assert.doesNotThrow(() => createObjectStore({ dataDir: directory }));
    process.env.LABLINEAGE_OBJECT_STORE = 'gcs';
    assert.throws(
      () => createObjectStore({ dataDir: directory }),
      /must be local/u,
    );
  } finally {
    if (previousMode === undefined) delete process.env.LABLINEAGE_OBJECT_STORE;
    else process.env.LABLINEAGE_OBJECT_STORE = previousMode;
    if (previousDeploymentMode === undefined) delete process.env.LABLINEAGE_DEPLOYMENT_MODE;
    else process.env.LABLINEAGE_DEPLOYMENT_MODE = previousDeploymentMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await rm(directory, { recursive: true, force: true });
  }
});
