import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../lib/store.js';

test('changing JsonStore dataDir also redirects atomic persistence', async () => {
  const initialDirectory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-store-initial-'));
  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-store-isolated-'));
  try {
    const isolatedStore = await new JsonStore(initialDirectory).init();
    isolatedStore.dataDir = isolatedDirectory;
    await isolatedStore.update((state) => {
      state.setupConfig.labName = 'isolated-test-lab';
    });

    const persisted = JSON.parse(await readFile(path.join(isolatedDirectory, 'state.json'), 'utf8'));
    assert.equal(persisted.setupConfig.labName, 'isolated-test-lab');
    assert.equal(isolatedStore.file, path.join(isolatedDirectory, 'state.json'));
  } finally {
    await rm(initialDirectory, { recursive: true, force: true });
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});
