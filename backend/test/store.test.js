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

test('JsonStore serializes concurrent mutations without losing updates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-store-concurrency-'));
  try {
    const store = await new JsonStore(directory).init();
    store.get().concurrencyCounter = 0;
    await Promise.all(Array.from({ length: 25 }, (_, index) => store.update(async (state) => {
      const before = state.concurrencyCounter;
      await new Promise((resolve) => setTimeout(resolve, index % 3));
      state.concurrencyCounter = before + 1;
    })));
    assert.equal(store.get().concurrencyCounter, 25);
    const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(persisted.concurrencyCounter, 25);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('updateWithAudit commits domain state and its audit event together', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-store-audit-'));
  try {
    const store = await new JsonStore(directory).init();
    const before = store.get().auditEvents.length;
    await store.updateWithAudit(
      (state) => { state.setupConfig.labName = 'Atomic Lab'; },
      { action: 'atomic_test', actor: 'test-user', resource: 'system/config', details: 'Atomic mutation.' }
    );
    const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(persisted.setupConfig.labName, 'Atomic Lab');
    assert.equal(persisted.auditEvents.length, before + 1);
    assert.equal(persisted.auditEvents[0].action, 'atomic_test');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed mutations roll back and do not poison later writes', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'lablineage-store-rollback-'));
  try {
    const store = await new JsonStore(dataDir).init();
    const originalName = store.get().projects[0].name;
    await assert.rejects(
      store.update((state) => {
        state.projects[0].name = 'must not leak';
        throw new Error('validation failed');
      }),
      /validation failed/
    );
    assert.equal(store.get().projects[0].name, originalName);

    await store.update((state) => {
      state.projects[0].name = 'subsequent write';
    });
    assert.equal(store.get().projects[0].name, 'subsequent write');

    const reloaded = await new JsonStore(dataDir).init();
    assert.equal(reloaded.get().projects[0].name, 'subsequent write');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
