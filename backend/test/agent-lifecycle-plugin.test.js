import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GuardianLifecyclePlugin,
  classifyAgentError,
  sanitizeToolArguments
} from '../lib/agent-lifecycle-plugin.js';

test('Guardian lifecycle plugin redacts tool arguments and correlates lifecycle events', async () => {
  const plugin = new GuardianLifecyclePlugin({ traceId: 'trace-test', maxModelCalls: 2, now: () => 100 });
  const toolArgs = {
    artifact: 'fig3.png',
    apiKey: 'test-secret-value',
    nested: { authorization: 'Bearer hidden', path: 'C:\\Users\\researcher\\secret.csv' }
  };
  await plugin.beforeRunCallback({});
  await plugin.beforeToolCallback({ tool: { name: 'get_lineage_graph' }, toolArgs, toolContext: { agentName: 'EvidenceAgent' } });
  assert.deepEqual(toolArgs, {
    artifact: 'fig3.png',
    apiKey: '[REDACTED]',
    nested: { authorization: '[REDACTED]', path: '[REDACTED]' }
  });
  assert.ok(plugin.snapshot().every((event) => event.traceId === 'trace-test'));
  assert.doesNotMatch(JSON.stringify(plugin.snapshot()), /example-secret-value|researcher/);
});

test('Guardian lifecycle plugin enforces model-call and estimated-token budgets', async () => {
  const plugin = new GuardianLifecyclePlugin({ traceId: 'trace-budget', maxModelCalls: 1, maxEstimatedInputTokens: 10 });
  await plugin.beforeModelCallback({ callbackContext: { agentName: 'A' }, llmRequest: { contents: 'small' } });
  await assert.rejects(
    plugin.beforeModelCallback({ callbackContext: { agentName: 'B' }, llmRequest: { contents: 'small' } }),
    /budget exceeded/
  );
  assert.equal(plugin.summary().modelCalls, 1);
  assert.equal(plugin.snapshot().at(-1).type, 'budget_rejected');
});

test('Guardian lifecycle plugin classifies stable error categories', () => {
  assert.equal(classifyAgentError(new Error('request timed out')), 'timeout');
  assert.equal(classifyAgentError(new Error('429 quota exceeded')), 'rate_limited');
  assert.equal(classifyAgentError(new Error('schema validation failed')), 'validation');
  assert.equal(classifyAgentError(new Error('tool exploded'), 'tool'), 'tool_failure');
  assert.deepEqual(sanitizeToolArguments({ token: 'secret', value: 'safe' }), { token: '[REDACTED]', value: 'safe' });
});
