import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_STEP_NAMES,
  MAX_ANALYSIS_RETRIES,
  cancelAnalysisRun,
  claimAnalysisStep,
  completeAnalysisStep,
  createAnalysisRun,
  failAnalysisStep,
  publicAnalysisRun,
  retryAnalysisRun,
} from '../lib/project-analysis.js';

function fixtureState() {
  return {
    projects: [{ id: 'project_1', name: 'Project', currentIntentVersion: 1 }],
    projectIntents: [{ id: 'intent_1', projectId: 'project_1', version: 1, objective: 'Produce a result.' }],
    projectSuccessCriteria: [{ id: 'criterion_1', intentVersionId: 'intent_1', description: 'Result exists', required: true, sortOrder: 0 }],
    projectKeyOutputs: [],
    analysisRuns: [],
    analysisRunSteps: [],
    analysisReports: [],
    analysisRunEvents: [],
  };
}

function createRun(state, overrides = {}) {
  return createAnalysisRun(state, {
    projectId: 'project_1',
    sourceId: 'source_1',
    sourceRevision: 'sha256:abc',
    idempotencyKey: 'analysis-key-1',
    actorSubject: 'user:admin',
    at: '2026-08-02T00:00:00.000Z',
    ...overrides,
  }).run;
}

function succeedNext(state, run, stepName, at) {
  const claimed = claimAnalysisStep(state, {
    runId: run.id,
    expectedVersion: run.version,
    leaseOwner: 'worker-1',
    at,
  });
  assert.equal(claimed.step.name, stepName);
  return completeAnalysisStep(state, {
    runId: run.id,
    stepName,
    expectedVersion: claimed.run.version,
    leaseOwner: 'worker-1',
    outputSha256: 'a'.repeat(64),
    at,
  });
}

test('analysis runs are idempotent and bind the current intent version', () => {
  const state = fixtureState();
  const first = createAnalysisRun(state, {
    projectId: 'project_1', sourceId: 'source_1', sourceRevision: 'r1',
    idempotencyKey: 'same-input', actorSubject: 'admin',
  });
  const replay = createAnalysisRun(state, {
    projectId: 'project_1', sourceId: 'source_1', sourceRevision: 'r1',
    idempotencyKey: 'same-input', actorSubject: 'admin',
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.run.id, first.run.id);
  assert.equal(first.run.intentVersionId, 'intent_1');
  assert.equal(state.analysisRunSteps.length, ANALYSIS_STEP_NAMES.length);
  assert.throws(
    () => createAnalysisRun(state, {
      projectId: 'project_1', sourceId: 'source_1', sourceRevision: 'r2',
      idempotencyKey: 'same-input', actorSubject: 'admin',
    }),
    /different input/u,
  );
});

test('analysis state machine reaches completed in the fixed step order', () => {
  const state = fixtureState();
  let run = createRun(state);
  for (const [index, stepName] of ANALYSIS_STEP_NAMES.entries()) {
    run = succeedNext(state, run, stepName, `2026-08-02T00:0${index}:00.000Z`);
  }
  assert.equal(run.status, 'completed');
  assert.equal(run.currentStep, null);
  assert.equal(run.deterministicReady, true);
  assert.equal(state.analysisRunSteps.every((step) => step.status === 'succeeded'), true);
  assert.deepEqual(
    state.analysisRunEvents.filter((event) => event.eventType === 'step_succeeded').map((event) => event.payload.step),
    ANALYSIS_STEP_NAMES,
  );
});

test('lease ownership is exclusive and an expired lease can be reclaimed', () => {
  const state = fixtureState();
  const run = createRun(state);
  const first = claimAnalysisStep(state, {
    runId: run.id, expectedVersion: run.version, leaseOwner: 'worker-1', leaseMs: 1_000,
    at: '2026-08-02T00:00:00.000Z',
  });
  assert.throws(
    () => claimAnalysisStep(state, {
      runId: run.id, expectedVersion: first.run.version, leaseOwner: 'worker-2',
      at: '2026-08-02T00:00:00.500Z',
    }),
    /another worker/u,
  );
  const reclaimed = claimAnalysisStep(state, {
    runId: run.id, expectedVersion: first.run.version, leaseOwner: 'worker-2',
    at: '2026-08-02T00:00:02.000Z',
  });
  assert.equal(reclaimed.step.attempt, 2);
  assert.equal(publicAnalysisRun(state, run.id).steps[0].leaseOwner, undefined);
});

test('agent failure preserves deterministic results and finalizes as partial', () => {
  const state = fixtureState();
  let run = createRun(state);
  for (const stepName of ANALYSIS_STEP_NAMES.slice(0, 5)) {
    run = succeedNext(state, run, stepName, '2026-08-02T00:01:00.000Z');
  }
  const claimed = claimAnalysisStep(state, {
    runId: run.id, expectedVersion: run.version, leaseOwner: 'worker-1',
    at: '2026-08-02T00:02:00.000Z',
  });
  run = failAnalysisStep(state, {
    runId: run.id, stepName: 'agent_summary', expectedVersion: claimed.run.version,
    leaseOwner: 'worker-1', errorCode: 'ADK_UNAVAILABLE', errorSummary: 'not configured',
    at: '2026-08-02T00:02:01.000Z',
  });
  assert.equal(run.status, 'summarizing');
  assert.equal(run.deterministicReady, true);
  run = succeedNext(state, run, 'finalize', '2026-08-02T00:03:00.000Z');
  assert.equal(run.status, 'partial');

  run = retryAnalysisRun(state, {
    runId: run.id, expectedVersion: run.version, actorSubject: 'admin',
    at: '2026-08-02T00:04:00.000Z',
  });
  assert.equal(run.currentStep, 'agent_summary');
  assert.equal(run.deterministicReady, true);
});

test('deterministic failure can be retried and queued work can be cancelled with version checks', () => {
  const state = fixtureState();
  let run = createRun(state);
  const claimed = claimAnalysisStep(state, {
    runId: run.id, expectedVersion: run.version, leaseOwner: 'worker-1',
  });
  run = failAnalysisStep(state, {
    runId: run.id, stepName: 'ingest', expectedVersion: claimed.run.version,
    leaseOwner: 'worker-1', errorCode: 'INVALID_SOURCE', errorSummary: 'invalid',
  });
  assert.equal(run.status, 'failed');
  run = retryAnalysisRun(state, {
    runId: run.id, expectedVersion: run.version, actorSubject: 'admin',
  });
  assert.equal(run.status, 'queued');
  assert.equal(run.retryCount, 1);
  assert.throws(
    () => cancelAnalysisRun(state, { runId: run.id, expectedVersion: run.version - 1, actorSubject: 'admin' }),
    /Expected analysis run version/u,
  );
  run = cancelAnalysisRun(state, { runId: run.id, expectedVersion: run.version, actorSubject: 'admin' });
  assert.equal(run.status, 'cancelled');
  assert.equal(state.analysisRunSteps.every((step) => step.status === 'cancelled'), true);
});

test('analysis retry exhaustion is deterministic and bounded', () => {
  const state = fixtureState();
  let run = createRun(state);
  for (let retry = 0; retry < MAX_ANALYSIS_RETRIES; retry += 1) {
    const claimed = claimAnalysisStep(state, {
      runId: run.id,
      expectedVersion: run.version,
      leaseOwner: `worker-${retry}`,
    });
    run = failAnalysisStep(state, {
      runId: run.id,
      stepName: 'ingest',
      expectedVersion: claimed.run.version,
      leaseOwner: `worker-${retry}`,
      errorCode: 'TRANSIENT_SOURCE',
      errorSummary: 'retryable fixture failure',
    });
    run = retryAnalysisRun(state, {
      runId: run.id,
      expectedVersion: run.version,
      actorSubject: 'admin',
    });
  }
  const finalClaim = claimAnalysisStep(state, {
    runId: run.id,
    expectedVersion: run.version,
    leaseOwner: 'worker-final',
  });
  run = failAnalysisStep(state, {
    runId: run.id,
    stepName: 'ingest',
    expectedVersion: finalClaim.run.version,
    leaseOwner: 'worker-final',
    errorCode: 'TRANSIENT_SOURCE',
    errorSummary: 'retry budget exhausted',
  });
  assert.throws(
    () => retryAnalysisRun(state, {
      runId: run.id,
      expectedVersion: run.version,
      actorSubject: 'admin',
    }),
    /exhausted its 3 retries/u,
  );
  assert.equal(run.retryCount, MAX_ANALYSIS_RETRIES);
});
