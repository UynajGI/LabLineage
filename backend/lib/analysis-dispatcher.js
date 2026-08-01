import { createHash, randomUUID } from 'node:crypto';
import { CloudTasksClient } from '@google-cloud/tasks';
import { deploymentProfile } from './deployment-mode.js';
import { executeAnalysisRun } from './analysis-pipeline.js';
import { structuredLog } from './observability.js';
import { ANALYSIS_TERMINAL_STATUSES } from './project-analysis.js';

function taskId(runId, deliveryKey) {
  return `analysis-${createHash('sha256').update(`${runId}\0${deliveryKey}`).digest('hex').slice(0, 40)}`;
}

class LocalAnalysisDispatcher {
  constructor({ store, objectStore, execute = executeAnalysisRun }) {
    this.store = store;
    this.objectStore = objectStore;
    this.execute = execute;
    this.instanceId = `analysis-worker_${randomUUID()}`;
    this.executions = new Map();
    this.timers = new Map();
  }

  async dispatch(runId) {
    if (this.executions.has(runId) || this.timers.has(runId)) return { queued: true, idempotent: true };
    const timer = setTimeout(() => {
      this.timers.delete(runId);
      const execution = this.execute(this.store, runId, {
        objectStore: this.objectStore,
        leaseOwner: this.instanceId,
      }).catch((error) => {
        structuredLog('error', 'analysis_execution_failed', { runId, error: error.message });
        return null;
      }).finally(() => {
        this.executions.delete(runId);
        this.scheduleLeaseRecovery(runId);
      });
      this.executions.set(runId, execution);
    }, 0);
    timer.unref?.();
    this.timers.set(runId, timer);
    return { queued: true, idempotent: false };
  }

  scheduleLeaseRecovery(runId) {
    const run = (this.store.get().analysisRuns || []).find((item) => item.id === runId);
    if (!run || ANALYSIS_TERMINAL_STATUSES.includes(run.status)) return;
    const running = (this.store.get().analysisRunSteps || []).find((step) => step.runId === runId && step.status === 'running');
    const delay = running?.leaseExpiresAt
      ? Math.max(100, Date.parse(running.leaseExpiresAt) - Date.now() + 100)
      : 100;
    const timer = setTimeout(() => {
      this.timers.delete(runId);
      void this.dispatch(runId);
    }, delay);
    timer.unref?.();
    this.timers.set(runId, timer);
  }

  async recover() {
    const pending = (this.store.get().analysisRuns || []).filter((run) => !ANALYSIS_TERMINAL_STATUSES.includes(run.status));
    await Promise.all(pending.map((run) => this.dispatch(run.id)));
    return { recovered: pending.length };
  }

  async close() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.executions.values()]);
  }
}

class GoogleCloudAnalysisDispatcher {
  constructor({ store, client = new CloudTasksClient() }) {
    this.store = store;
    this.client = client;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT;
    this.location = process.env.LABLINEAGE_TASKS_LOCATION;
    this.queue = process.env.LABLINEAGE_TASKS_QUEUE;
    this.workerUrl = process.env.LABLINEAGE_ANALYSIS_WORKER_URL;
    this.audience = process.env.LABLINEAGE_TASKS_AUDIENCE;
    this.serviceAccountEmail = process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT;
  }

  async dispatch(runId) {
    const run = (this.store.get().analysisRuns || []).find((item) => item.id === runId);
    if (!run) throw new Error('Analysis run not found');
    const parent = this.client.queuePath(this.projectId, this.location, this.queue);
    const deliveryKey = `${run.version}:${run.retryCount || 0}`;
    const name = this.client.taskPath(this.projectId, this.location, this.queue, taskId(runId, deliveryKey));
    const body = Buffer.from(JSON.stringify({ runId })).toString('base64');
    try {
      await this.client.createTask({
        parent,
        task: {
          name,
          httpRequest: {
            httpMethod: 'POST',
            url: this.workerUrl,
            headers: { 'Content-Type': 'application/json' },
            body,
            oidcToken: {
              serviceAccountEmail: this.serviceAccountEmail,
              audience: this.audience,
            },
          },
        },
      });
      return { queued: true, idempotent: false, taskId: name.split('/').at(-1) };
    } catch (error) {
      if (Number(error.code) === 6) return { queued: true, idempotent: true, taskId: name.split('/').at(-1) };
      throw error;
    }
  }

  async recover() {
    const pending = (this.store.get().analysisRuns || []).filter((run) => !ANALYSIS_TERMINAL_STATUSES.includes(run.status));
    await Promise.all(pending.map((run) => this.dispatch(run.id)));
    return { recovered: pending.length };
  }

  async close() {
    await this.client.close();
  }
}

export function createAnalysisDispatcher({ store, objectStore, execute, cloudTasksClient } = {}) {
  const profile = deploymentProfile();
  if (profile.taskDispatcher === 'inline') {
    return new LocalAnalysisDispatcher({ store, objectStore, execute });
  }
  return new GoogleCloudAnalysisDispatcher({ store, client: cloudTasksClient });
}

export { GoogleCloudAnalysisDispatcher, LocalAnalysisDispatcher };
