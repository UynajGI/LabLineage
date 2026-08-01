import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardianAgent, routeGuardianMessage } from '../lib/agent.js';

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
  const toolNames = agent.guardianToolNames.sort();
  assert.deepEqual(toolNames, [
    'get_handoff_order',
    'get_lineage_graph',
    'get_project_summary',
    'get_snapshot_changes',
    'list_handoff_orders',
    'list_open_findings',
    'mcp_lineage_evidence',
    'mcp_repository_evidence',
    'preview_handoff'
  ]);
  assert.equal(toolNames.some((name) => /write|delete|send|permission/i.test(name)), false);
  const agents = [];
  const visit = (current) => {
    agents.push(current);
    for (const child of current.subAgents || []) visit(child);
  };
  visit(agent);
  const names = agents.map((item) => item.name);
  assert.ok(names.includes('EvidenceRetrieverAgent'));
  assert.ok(names.includes('ReproducibilityAuditorAgent'));
  assert.ok(names.includes('HandoffPlannerAgent'));
  assert.ok(names.includes('ParallelEvidenceSources'));
  assert.ok(names.includes('EvidenceCompletionLoop'));
  assert.ok(names.includes('EvidenceCompletionAgent'));
  const completionLoop = agents.find((item) => item.name === 'EvidenceCompletionLoop');
  assert.equal(completionLoop.maxIterations, 2);
  const completionAgent = agents.find((item) => item.name === 'EvidenceCompletionAgent');
  assert.ok(completionAgent.tools.some((tool) => tool.name === 'exit_loop'));
  const instructions = agents.map((item) => item.instruction || '').join('\n');
  assert.match(instructions, /不可信数据/);
  assert.match(instructions, /不发送邮件/);
  assert.match(instructions, /evidence_id/);
  assert.match(instructions, /确定退出规则/);
  assert.equal(routeGuardianMessage('请审计当前 R3 复现证据'), 'audit');
  assert.equal(routeGuardianMessage('准备交接计划'), 'handoff');
  assert.equal(routeGuardianMessage('fig3 是怎么生成的'), 'evidence');
});
