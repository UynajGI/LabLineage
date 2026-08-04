import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { recoverIngestionJobs, store } from '../server.js';

test('expired ingestion leases are re-queued for another worker', async () => {
  const jobId = `job_recovery_${randomUUID()}`;
  await store.update((state) => {
    state.ingestionJobs.push({
      id: jobId,
      projectId: state.projects[0].id,
      sourceId: 'source_recovery_test',
      status: 'processing',
      attempts: 1,
      leaseOwner: 'dead-worker',
      leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  try {
    await recoverIngestionJobs();
    const recovered = store.get().ingestionJobs.find((job) => job.id === jobId);
    assert.equal(recovered.status, 'queued');
    assert.equal('leaseOwner' in recovered, false);
    assert.equal('leaseExpiresAt' in recovered, false);
  } finally {
    await store.update((state) => {
      state.ingestionJobs = state.ingestionJobs.filter((job) => job.id !== jobId);
    });
  }
});
