import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIT_RULES, deriveFindings } from '../lib/audit.js';

function evidence(id) {
  return [`ev_${id}`];
}

test('audit golden graph covers every named result-risk class with stable IDs', () => {
  const nodes = [
    { id: 'orphan', type: 'Figure', label: 'orphan.png', status: 'candidate', details: { hash: 'sha256:orphan' }, evidenceIds: evidence('orphan') },
    { id: 'failed', type: 'Run', label: 'failed run', details: { exitCode: '2' }, evidenceIds: evidence('failed') },
    { id: 'failed-output', type: 'Figure', label: 'failed.png', status: 'candidate', details: { hash: 'sha256:failed' }, evidenceIds: evidence('failed-output') },
    { id: 'duplicate-a', type: 'Figure', label: 'result-a.png', status: 'candidate', details: { hash: 'sha256:duplicate' }, evidenceIds: evidence('duplicate-a') },
    { id: 'duplicate-b', type: 'Figure', label: 'result-b.png', status: 'candidate', details: { hash: 'sha256:duplicate' }, evidenceIds: evidence('duplicate-b') },
    { id: 'run', type: 'Run', label: 'analysis', details: { exitCode: '0' }, evidenceIds: evidence('run') },
    { id: 'code', type: 'CodeVersion', label: 'new code', details: { modifiedAt: '2026-02-01T00:00:00Z' }, evidenceIds: evidence('code') },
    { id: 'stale', type: 'Figure', label: 'stale.png', status: 'candidate', details: { hash: 'sha256:current', modifiedAt: '2026-01-01T00:00:00Z' }, evidenceIds: evidence('stale') },
    { id: 'junk', type: 'Figure', label: 'scratch/cache-copy.png', status: 'candidate', details: { hash: 'sha256:junk' }, evidenceIds: evidence('junk') },
    { id: 'conflict-a', type: 'Figure', label: 'paper-figure.png', status: 'accepted', details: { hash: 'sha256:one' }, evidenceIds: evidence('conflict-a') },
    { id: 'conflict-b', type: 'Figure', label: 'paper-figure.png', status: 'candidate', details: { hash: 'sha256:two' }, evidenceIds: evidence('conflict-b') },
    { id: 'accepted-temp', type: 'Figure', label: 'scratch/accepted.png', status: 'accepted', details: { hash: 'sha256:accepted' }, evidenceIds: evidence('accepted-temp') }
  ];
  const edges = [
    { source: 'failed', target: 'failed-output', relation: 'generated', confidence: 'exact', evidenceIds: evidence('failed-edge') },
    { source: 'run', target: 'stale', relation: 'generated', confidence: 'exact', evidenceIds: evidence('stale-edge'), observedHash: 'sha256:before-edit' },
    { source: 'code', target: 'run', relation: 'used_input', confidence: 'exact', evidenceIds: evidence('code-edge') }
  ];
  const first = deriveFindings(nodes, edges);
  const second = deriveFindings(nodes, edges);
  const types = new Set(first.map((finding) => finding.type));
  for (const required of ['orphan', 'failed_run', 'duplicate', 'stale', 'manual_edit', 'unreproducible', 'junk_suspected', 'conflict']) {
    assert.equal(types.has(required), true, `missing ${required}`);
  }
  assert.deepEqual(first.map((finding) => finding.id), second.map((finding) => finding.id));
  assert.equal(first.some((finding) => finding.type === 'junk_suspected' && finding.affectedEntities.includes('accepted-temp')), false);
  assert.equal(first.some((finding) => /立即删除|自动执行删除|自动清理/.test(finding.proposedAction)), false);
  assert.equal(new Set(AUDIT_RULES.map((rule) => rule.id)).size, AUDIT_RULES.length);
});

test('complete upstream evidence avoids unreproducible finding', () => {
  const nodes = [
    { id: 'code', type: 'CodeVersion' },
    { id: 'data', type: 'Dataset' },
    { id: 'params', type: 'ParameterSet' },
    { id: 'env', type: 'Environment' },
    { id: 'run', type: 'Run', details: { exitCode: '0' }, evidenceIds: ['ev_run'] },
    { id: 'figure', type: 'Figure', label: 'figure.png', status: 'accepted', details: { hash: 'sha256:figure' } }
  ];
  const edges = [
    ...['code', 'data', 'params', 'env'].map((source) => ({ source, target: 'run', relation: 'used_input', confidence: 'exact', evidenceIds: [`ev_${source}`] })),
    { source: 'run', target: 'figure', relation: 'generated', confidence: 'exact', evidenceIds: ['ev_output'] }
  ];
  assert.equal(deriveFindings(nodes, edges).some((finding) => finding.type === 'unreproducible'), false);
});
