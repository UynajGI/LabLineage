import { randomUUID } from 'node:crypto';
import { currentProjectIntent } from './project-intents.js';

export const ANALYSIS_STEP_NAMES = Object.freeze([
  'ingest',
  'scan',
  'graph',
  'audit',
  'goal_coverage',
  'agent_summary',
  'finalize',
]);

export const ANALYSIS_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'partial',
  'failed',
  'cancelled',
]);

export const MAX_ANALYSIS_RETRIES = 3;

const STATUS_BY_STEP = Object.freeze({
  ingest: 'ingesting',
  scan: 'scanning',
  graph: 'graphing',
  audit: 'auditing',
  goal_coverage: 'summarizing',
  agent_summary: 'summarizing',
  finalize: 'summarizing',
});

export class AnalysisRunConflictError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409;
    this.code = 'ANALYSIS_RUN_CONFLICT';
  }
}

export class AnalysisRunStateError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
    this.code = 'ANALYSIS_RUN_STATE_ERROR';
  }
}

function ensureCollections(state) {
  state.analysisRuns ||= [];
  state.analysisRunSteps ||= [];
  state.analysisReports ||= [];
  state.analysisRunEvents ||= [];
}

function nowIso(value) {
  return new Date(value ?? Date.now()).toISOString();
}

function appendEvent(state, run, eventType, actorSubject, payload = {}, at) {
  const event = {
    id: `analysis_event_${randomUUID()}`,
    runId: run.id,
    projectId: run.projectId,
    eventType,
    actorSubject,
    payload,
    createdAt: nowIso(at),
  };
  state.analysisRunEvents.push(event);
  return event;
}

function findRun(state, runId) {
  const run = (state.analysisRuns || []).find((item) => item.id === runId);
  if (!run) throw new AnalysisRunStateError('Analysis run not found', 404);
  return run;
}

function assertExpectedVersion(run, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== run.version) {
    throw new AnalysisRunConflictError(`Expected analysis run version ${run.version}`);
  }
}

function stepsFor(state, runId) {
  return (state.analysisRunSteps || [])
    .filter((step) => step.runId === runId)
    .sort((left, right) => ANALYSIS_STEP_NAMES.indexOf(left.name) - ANALYSIS_STEP_NAMES.indexOf(right.name));
}

function clearLease(step) {
  delete step.leaseOwner;
  delete step.leaseExpiresAt;
}

function resetStep(step) {
  step.status = 'pending';
  step.errorCode = null;
  step.errorSummary = null;
  step.startedAt = null;
  step.completedAt = null;
  step.inputSha256 = null;
  step.outputSha256 = null;
  step.artifactRefs = [];
  clearLease(step);
}

export function createAnalysisRun(state, {
  projectId,
  sourceId,
  sourceRevision = null,
  inputKind = null,
  inputObjectKey = null,
  inputSha256 = null,
  idempotencyKey,
  actorSubject,
  at,
}) {
  ensureCollections(state);
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new AnalysisRunStateError('A valid analysis idempotency key is required', 400);
  }
  const project = (state.projects || []).find((item) => item.id === projectId);
  if (!project) throw new AnalysisRunStateError('Project not found', 404);
  const intent = currentProjectIntent(state, projectId);
  if (!intent) throw new AnalysisRunStateError('Project objective must be configured before analysis', 422);

  const existing = state.analysisRuns.find((item) => (
    item.projectId === projectId && item.idempotencyKey === idempotencyKey
  ));
  if (existing) {
    if (
      existing.sourceId !== sourceId
      || existing.sourceRevision !== sourceRevision
      || existing.intentVersionId !== intent.id
      || existing.inputSha256 !== inputSha256
    ) {
      throw new AnalysisRunConflictError('Analysis idempotency key was already used for different input');
    }
    return { run: structuredClone(existing), idempotent: true };
  }

  const createdAt = nowIso(at);
  const run = {
    id: `analysis_run_${randomUUID()}`,
    projectId,
    intentVersionId: intent.id,
    intentVersion: intent.version,
    sourceId: sourceId || null,
    sourceRevision,
    inputKind,
    inputObjectKey,
    inputSha256,
    status: 'queued',
    currentStep: 'ingest',
    version: 1,
    idempotencyKey,
    attempts: 0,
    retryCount: 0,
    deterministicReady: false,
    agentSummaryFailed: false,
    actorSubject,
    queuedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  state.analysisRuns.push(run);
  for (const name of ANALYSIS_STEP_NAMES) {
    state.analysisRunSteps.push({
      id: `analysis_step_${randomUUID()}`,
      runId: run.id,
      projectId,
      name,
      status: 'pending',
      attempt: 0,
      artifactRefs: [],
      createdAt,
      updatedAt: createdAt,
    });
  }
  appendEvent(state, run, 'run_queued', actorSubject, {
    sourceId: sourceId || null,
    sourceRevision,
    intentVersion: intent.version,
  }, at);
  return { run: structuredClone(run), idempotent: false };
}

export function claimAnalysisStep(state, {
  runId,
  leaseOwner,
  expectedVersion,
  leaseMs = 5 * 60 * 1000,
  at,
}) {
  ensureCollections(state);
  const run = findRun(state, runId);
  assertExpectedVersion(run, expectedVersion);
  if (ANALYSIS_TERMINAL_STATUSES.includes(run.status)) return null;
  const timestamp = Date.parse(nowIso(at));
  const steps = stepsFor(state, runId);
  const step = steps.find((candidate) => candidate.status === 'running')
    || steps.find((candidate) => candidate.status === 'pending');
  if (!step) return null;
  if (step.status === 'running' && Date.parse(step.leaseExpiresAt || 0) > timestamp) {
    if (step.leaseOwner === leaseOwner) return { run: structuredClone(run), step: structuredClone(step), idempotent: true };
    throw new AnalysisRunConflictError('Analysis step is leased by another worker');
  }

  const claimedAt = nowIso(at);
  step.status = 'running';
  step.attempt += 1;
  step.leaseOwner = leaseOwner;
  step.leaseExpiresAt = new Date(timestamp + leaseMs).toISOString();
  step.startedAt ||= claimedAt;
  step.updatedAt = claimedAt;
  run.status = STATUS_BY_STEP[step.name];
  run.currentStep = step.name;
  run.startedAt ||= claimedAt;
  run.updatedAt = claimedAt;
  run.version += 1;
  if (step.name === 'ingest') run.attempts += 1;
  appendEvent(state, run, 'step_started', leaseOwner, { step: step.name, attempt: step.attempt }, at);
  return { run: structuredClone(run), step: structuredClone(step), idempotent: false };
}

export function completeAnalysisStep(state, {
  runId,
  stepName,
  leaseOwner,
  expectedVersion,
  inputSha256 = null,
  outputSha256 = null,
  artifactRefs = [],
  at,
}) {
  ensureCollections(state);
  const run = findRun(state, runId);
  assertExpectedVersion(run, expectedVersion);
  const steps = stepsFor(state, runId);
  const step = steps.find((item) => item.name === stepName);
  if (!step || step.status !== 'running' || step.leaseOwner !== leaseOwner) {
    throw new AnalysisRunStateError('Analysis step is not owned by this worker');
  }
  const completedAt = nowIso(at);
  Object.assign(step, {
    status: 'succeeded',
    inputSha256,
    outputSha256,
    artifactRefs: structuredClone(artifactRefs),
    completedAt,
    updatedAt: completedAt,
    errorCode: null,
    errorSummary: null,
  });
  clearLease(step);
  if (stepName === 'goal_coverage') run.deterministicReady = true;
  const next = steps.find((item) => item.status === 'pending');
  run.version += 1;
  run.updatedAt = completedAt;
  if (!next) {
    run.status = run.agentSummaryFailed ? 'partial' : 'completed';
    run.currentStep = null;
    run.completedAt = completedAt;
  } else {
    run.currentStep = next.name;
    run.status = STATUS_BY_STEP[next.name];
  }
  appendEvent(state, run, 'step_succeeded', leaseOwner, {
    step: stepName,
    nextStep: next?.name || null,
  }, at);
  return structuredClone(run);
}

export function failAnalysisStep(state, {
  runId,
  stepName,
  leaseOwner,
  expectedVersion,
  errorCode,
  errorSummary,
  at,
}) {
  ensureCollections(state);
  const run = findRun(state, runId);
  assertExpectedVersion(run, expectedVersion);
  const steps = stepsFor(state, runId);
  const step = steps.find((item) => item.name === stepName);
  if (!step || step.status !== 'running' || step.leaseOwner !== leaseOwner) {
    throw new AnalysisRunStateError('Analysis step is not owned by this worker');
  }
  const failedAt = nowIso(at);
  Object.assign(step, {
    status: 'failed',
    errorCode,
    errorSummary: String(errorSummary || 'Analysis step failed').slice(0, 2000),
    completedAt: failedAt,
    updatedAt: failedAt,
  });
  clearLease(step);
  run.version += 1;
  run.errorCode = errorCode;
  run.errorSummary = step.errorSummary;
  run.updatedAt = failedAt;

  if (stepName === 'agent_summary' && run.deterministicReady) {
    run.agentSummaryFailed = true;
    const finalize = steps.find((item) => item.name === 'finalize');
    run.status = 'summarizing';
    run.currentStep = finalize.name;
  } else {
    run.status = 'failed';
    run.currentStep = stepName;
    run.completedAt = failedAt;
  }
  appendEvent(state, run, 'step_failed', leaseOwner, {
    step: stepName,
    errorCode,
    recoverableSummaryFailure: stepName === 'agent_summary' && run.deterministicReady,
  }, at);
  return structuredClone(run);
}

export function cancelAnalysisRun(state, { runId, expectedVersion, actorSubject, at }) {
  ensureCollections(state);
  const run = findRun(state, runId);
  assertExpectedVersion(run, expectedVersion);
  if (ANALYSIS_TERMINAL_STATUSES.includes(run.status)) {
    throw new AnalysisRunStateError(`Cannot cancel analysis run in ${run.status} state`);
  }
  const cancelledAt = nowIso(at);
  for (const step of stepsFor(state, runId)) {
    if (['pending', 'running'].includes(step.status)) {
      step.status = 'cancelled';
      step.completedAt = cancelledAt;
      step.updatedAt = cancelledAt;
      clearLease(step);
    }
  }
  run.status = 'cancelled';
  run.currentStep = null;
  run.completedAt = cancelledAt;
  run.updatedAt = cancelledAt;
  run.version += 1;
  appendEvent(state, run, 'run_cancelled', actorSubject, {}, at);
  return structuredClone(run);
}

export function retryAnalysisRun(state, { runId, expectedVersion, actorSubject, at }) {
  ensureCollections(state);
  const run = findRun(state, runId);
  assertExpectedVersion(run, expectedVersion);
  if (!['failed', 'partial'].includes(run.status)) {
    throw new AnalysisRunStateError(`Cannot retry analysis run in ${run.status} state`);
  }
  if ((run.retryCount || 0) >= MAX_ANALYSIS_RETRIES) {
    throw new AnalysisRunStateError(`Analysis run exhausted its ${MAX_ANALYSIS_RETRIES} retries`);
  }
  const steps = stepsFor(state, runId);
  const failedIndex = steps.findIndex((step) => step.status === 'failed');
  if (failedIndex < 0) throw new AnalysisRunStateError('Analysis run has no failed step to retry');
  for (const step of steps.slice(failedIndex)) resetStep(step);
  const retriedAt = nowIso(at);
  run.status = 'queued';
  run.currentStep = steps[failedIndex].name;
  run.retryCount = (run.retryCount || 0) + 1;
  run.agentSummaryFailed = false;
  if (failedIndex <= ANALYSIS_STEP_NAMES.indexOf('goal_coverage')) run.deterministicReady = false;
  run.errorCode = null;
  run.errorSummary = null;
  run.completedAt = null;
  run.updatedAt = retriedAt;
  run.version += 1;
  appendEvent(state, run, 'run_retried', actorSubject, { fromStep: steps[failedIndex].name }, at);
  return structuredClone(run);
}

export function publicAnalysisRun(state, runId) {
  ensureCollections(state);
  const run = findRun(state, runId);
  const {
    idempotencyKey: _idempotencyKey,
    actorSubject: _actorSubject,
    agentSummaryFailed: _agentSummaryFailed,
    inputObjectKey: _inputObjectKey,
    pipelineState: _pipelineState,
    ...publicRun
  } = structuredClone(run);
  const steps = stepsFor(state, runId).map((step) => {
    const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...publicStep } = structuredClone(step);
    return publicStep;
  });
  const events = (state.analysisRunEvents || [])
    .filter((event) => event.runId === runId)
    .map((event) => structuredClone(event));
  const report = (state.analysisReports || []).find((item) => item.runId === runId);
  return { ...publicRun, steps, events, report: report ? { id: report.id, overallStatus: report.overallStatus, coverageScore: report.coverageScore, createdAt: report.createdAt } : null };
}
