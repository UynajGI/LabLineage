import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardianAgent } from '../lib/agent.js';

test('Guardian agent exposes only the approved read-only tool set', () => {
  const store = {
    get: () => ({
      projects: [],
      nodes: [],
      edges: [],
      findings: [],
      audits: [],
      snapshots: [],
      auditEvents: []
    })
  };
  const agent = createGuardianAgent(store, 'project-a');
  const toolNames = agent.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [
    'get_lineage_graph',
    'get_project_summary',
    'get_snapshot_changes',
    'list_open_findings',
    'preview_handoff'
  ]);
  assert.equal(toolNames.some((name) => /write|delete|send|permission/i.test(name)), false);
  assert.match(agent.instruction, /不可信数据/);
  assert.match(agent.instruction, /不发送邮件/);
  assert.match(agent.instruction, /evidence_id/);
});
