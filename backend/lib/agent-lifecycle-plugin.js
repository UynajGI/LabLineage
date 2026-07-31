import { BasePlugin } from '@google/adk';

const SENSITIVE_KEY = /(?:authorization|api[-_]?key|token|secret|password|credential|private[-_]?key|cookie|proxy)/i;
const SENSITIVE_VALUE = /(?:AQ\.[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|Authorization:\s*Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z]:\\Users\\[^\\\s]+)/i;

function sanitizeValue(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 100).map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey)])
    );
  }
  return value;
}

export function sanitizeToolArguments(value) {
  return sanitizeValue(value);
}

export function classifyAgentError(error, stage = 'runtime') {
  const message = String(error?.message || error || 'unknown error');
  if (/budget|maxLlmCalls|token limit/i.test(message)) return 'budget_exceeded';
  if (/abort|timed out|timeout/i.test(message)) return 'timeout';
  if (/401|403|auth|credential|api key/i.test(message)) return 'authentication';
  if (/429|quota|rate limit/i.test(message)) return 'rate_limited';
  if (/schema|validation|invalid|zod/i.test(message)) return 'validation';
  if (/fetch|network|ECONN|ENOTFOUND|upstream|5\d\d/i.test(message)) return 'upstream';
  return stage === 'tool' ? 'tool_failure' : stage === 'model' ? 'model_failure' : 'runtime_failure';
}

function estimatedTokens(value) {
  return Math.ceil(JSON.stringify(value || {}).length / 4);
}

export class GuardianLifecyclePlugin extends BasePlugin {
  constructor({
    traceId,
    maxModelCalls = 8,
    maxEstimatedInputTokens = 150_000,
    now = () => Date.now()
  } = {}) {
    super('guardian_lifecycle');
    this.traceId = traceId;
    this.maxModelCalls = maxModelCalls;
    this.maxEstimatedInputTokens = maxEstimatedInputTokens;
    this.now = now;
    this.startedAt = now();
    this.modelCalls = 0;
    this.estimatedInputTokens = 0;
    this.actualUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.events = [];
  }

  record(type, details = {}) {
    this.events.push({
      type,
      traceId: this.traceId,
      elapsedMs: this.now() - this.startedAt,
      ...sanitizeValue(details)
    });
  }

  budgetError(reason) {
    const error = Object.assign(new Error(`Agent model budget exceeded: ${reason}`), {
      statusCode: 429,
      agentErrorCategory: 'budget_exceeded',
      traceId: this.traceId
    });
    this.record('budget_rejected', { reason });
    return error;
  }

  async beforeRunCallback() {
    this.record('run_started', {
      budget: { maxModelCalls: this.maxModelCalls, maxEstimatedInputTokens: this.maxEstimatedInputTokens }
    });
  }

  async beforeModelCallback({ callbackContext, llmRequest }) {
    if (this.modelCalls >= this.maxModelCalls) throw this.budgetError('model call limit');
    const inputEstimate = estimatedTokens(llmRequest?.contents || llmRequest);
    if (this.estimatedInputTokens + inputEstimate > this.maxEstimatedInputTokens) {
      throw this.budgetError('estimated input token limit');
    }
    this.modelCalls += 1;
    this.estimatedInputTokens += inputEstimate;
    this.record('model_started', {
      agent: callbackContext?.agentName,
      modelCall: this.modelCalls,
      estimatedInputTokens: inputEstimate
    });
  }

  async afterModelCallback({ callbackContext, llmResponse }) {
    const metadata = llmResponse?.usageMetadata || {};
    const inputTokens = Number(metadata.promptTokenCount || 0);
    const outputTokens = Number(metadata.candidatesTokenCount || 0);
    const totalTokens = Number(metadata.totalTokenCount || inputTokens + outputTokens);
    this.actualUsage.inputTokens += inputTokens;
    this.actualUsage.outputTokens += outputTokens;
    this.actualUsage.totalTokens += totalTokens;
    this.record('model_finished', {
      agent: callbackContext?.agentName,
      modelCall: this.modelCalls,
      usage: { inputTokens, outputTokens, totalTokens }
    });
  }

  async beforeToolCallback({ tool, toolArgs, toolContext }) {
    const sanitized = sanitizeToolArguments(toolArgs);
    for (const key of Object.keys(toolArgs || {})) delete toolArgs[key];
    Object.assign(toolArgs || {}, sanitized);
    this.record('tool_started', { agent: toolContext?.agentName, tool: tool?.name, args: sanitized });
  }

  async afterToolCallback({ tool, toolContext }) {
    this.record('tool_finished', { agent: toolContext?.agentName, tool: tool?.name });
  }

  async onModelErrorCallback({ callbackContext, error }) {
    this.record('model_error', {
      agent: callbackContext?.agentName,
      category: classifyAgentError(error, 'model'),
      message: error?.message
    });
  }

  async onToolErrorCallback({ tool, toolContext, error }) {
    this.record('tool_error', {
      agent: toolContext?.agentName,
      tool: tool?.name,
      category: classifyAgentError(error, 'tool'),
      message: error?.message
    });
  }

  async afterRunCallback() {
    this.record('run_finished', { modelCalls: this.modelCalls, usage: this.actualUsage });
  }

  recordRuntimeError(error) {
    const category = error?.agentErrorCategory || classifyAgentError(error);
    this.record('runtime_error', { category, message: error?.message });
    return category;
  }

  snapshot() {
    return this.events.map((event) => structuredClone(event));
  }

  summary() {
    return {
      traceId: this.traceId,
      modelCalls: this.modelCalls,
      estimatedInputTokens: this.estimatedInputTokens,
      actualUsage: { ...this.actualUsage },
      budget: { maxModelCalls: this.maxModelCalls, maxEstimatedInputTokens: this.maxEstimatedInputTokens }
    };
  }
}
