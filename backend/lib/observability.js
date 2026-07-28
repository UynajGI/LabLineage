import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';

const counters = new Map();
const durations = new Map();
const agentUsage = new Map();

function metricKey(method, route, status) {
  return `${method}|${route}|${status}`;
}

function sanitize(value) {
  if (value === undefined) return undefined;
  return String(value).replace(/[\r\n]/g, ' ').slice(0, 500);
}

export function structuredLog(level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sanitize(value)]))
  };
  const target = level === 'error' ? console.error : console.log;
  target(JSON.stringify(record));
}

export function requestObservability() {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = /^[a-zA-Z0-9._-]{8,128}$/.test(incoming || '') ? incoming : randomUUID();
    res.set('x-request-id', req.requestId);
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = req.route?.path || req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
      const key = metricKey(req.method, route, res.statusCode);
      counters.set(key, (counters.get(key) || 0) + 1);
      durations.set(key, (durations.get(key) || 0) + durationSeconds);
      structuredLog('info', 'http_request', {
        requestId: req.requestId,
        traceId,
        actor: req.actor?.subject || 'unauthenticated',
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(durationSeconds * 1000)
      });
    });
    next();
  };
}

export function renderPrometheusMetrics(state = {}) {
  const lines = [
    '# HELP lablineage_http_requests_total HTTP requests handled.',
    '# TYPE lablineage_http_requests_total counter'
  ];
  for (const [key, count] of counters) {
    const [method, route, status] = key.split('|');
    const labels = `method="${method}",route="${route.replaceAll('"', '\\"')}",status="${status}"`;
    lines.push(`lablineage_http_requests_total{${labels}} ${count}`);
  }
  lines.push(
    '# HELP lablineage_http_request_duration_seconds_sum Total HTTP request duration.',
    '# TYPE lablineage_http_request_duration_seconds_sum counter'
  );
  for (const [key, duration] of durations) {
    const [method, route, status] = key.split('|');
    const labels = `method="${method}",route="${route.replaceAll('"', '\\"')}",status="${status}"`;
    lines.push(`lablineage_http_request_duration_seconds_sum{${labels}} ${duration}`);
  }
  lines.push(
    '# HELP lablineage_agent_requests_total Agent requests by model.',
    '# TYPE lablineage_agent_requests_total counter',
    '# HELP lablineage_agent_tokens_total Agent token usage by model and direction.',
    '# TYPE lablineage_agent_tokens_total counter'
  );
  for (const [model, usage] of agentUsage) {
    const safeModel = model.replaceAll('"', '\\"');
    lines.push(`lablineage_agent_requests_total{model="${safeModel}"} ${usage.requests}`);
    lines.push(`lablineage_agent_tokens_total{model="${safeModel}",direction="input"} ${usage.inputTokens}`);
    lines.push(`lablineage_agent_tokens_total{model="${safeModel}",direction="output"} ${usage.outputTokens}`);
  }
  const ingestionJobs = state.ingestionJobs || [];
  lines.push(
    '# HELP lablineage_ingestion_jobs Current durable ingestion jobs by status.',
    '# TYPE lablineage_ingestion_jobs gauge'
  );
  for (const status of ['queued', 'processing', 'completed', 'failed']) {
    lines.push(`lablineage_ingestion_jobs{status="${status}"} ${ingestionJobs.filter((job) => job.status === status).length}`);
  }
  const oldestQueued = ingestionJobs
    .filter((job) => job.status === 'queued')
    .map((job) => Date.parse(job.createdAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  lines.push(
    '# HELP lablineage_ingestion_oldest_queued_seconds Age of the oldest queued ingestion job.',
    '# TYPE lablineage_ingestion_oldest_queued_seconds gauge',
    `lablineage_ingestion_oldest_queued_seconds ${oldestQueued ? Math.max(0, (Date.now() - oldestQueued) / 1000) : 0}`,
    '# HELP lablineage_idempotency_records Current retained idempotency records.',
    '# TYPE lablineage_idempotency_records gauge',
    `lablineage_idempotency_records ${(state.idempotencyRecords || []).length}`
  );
  return `${lines.join('\n')}\n`;
}

export function recordAgentUsage(model, usage = {}) {
  const current = agentUsage.get(model) || { requests: 0, inputTokens: 0, outputTokens: 0 };
  current.requests += 1;
  current.inputTokens += Number(usage.inputTokens || 0);
  current.outputTokens += Number(usage.outputTokens || 0);
  agentUsage.set(model, current);
}
