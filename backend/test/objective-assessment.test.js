import assert from 'node:assert/strict';
import test from 'node:test';
import { assessProjectObjective, assertAssessmentEvidence } from '../lib/objective-assessment.js';
import { snapshotToEvidenceGraph } from '../lib/snapshot-to-graph.js';

const intent = {
  id: 'intent_1',
  version: 1,
  objective: 'Publish a reproducible report.',
  successCriteria: [
    { id: 'criterion_1', description: 'The report contains reproducibility evidence', required: true, sortOrder: 0 },
  ],
  keyOutputs: [
    { id: 'output_1', name: 'Final report', expectedPathHint: 'results/report.pdf', required: true, sortOrder: 0 },
    { id: 'output_2', name: 'Training dataset', expectedPathHint: 'data/train.csv', required: true, sortOrder: 1 },
  ],
};

test('snapshot graph creates stable exact file evidence without inventing edges', () => {
  const snapshot = {
    id: 'snapshot_1',
    collectedAt: '2026-08-02T00:00:00Z',
    files: [
      { pathToken: 'results/report.pdf', contentHash: 'sha256:abc', sizeBytes: 42, extension: '.pdf', mediaType: 'application/pdf' },
      { pathToken: 'src/train.py', contentHash: 'sha256:def', sizeBytes: 84, extension: '.py', kind: 'code' },
    ],
  };
  const first = snapshotToEvidenceGraph('project_1', snapshot);
  const second = snapshotToEvidenceGraph('project_1', snapshot);
  assert.deepEqual(first, second);
  assert.equal(first.edges.length, 0);
  assert.deepEqual(first.nodes.map((node) => node.type), ['Figure', 'Script']);
  assert.equal(first.nodes.every((node) => node.confidence === 'exact' && node.evidenceIds.length === 1), true);
});

test('objective assessment uses a fixed score and cites only real evidence', () => {
  const graph = snapshotToEvidenceGraph('project_1', {
    id: 'snapshot_1',
    files: [
      { pathToken: 'results/report.pdf', contentHash: 'sha256:abc', sizeBytes: 42, extension: '.pdf' },
    ],
  });
  const report = assessProjectObjective({ intent, evidence: graph.evidence, nodes: graph.nodes });
  const reportOutput = report.keyOutputResults.find((result) => result.id === 'output_1');
  const datasetOutput = report.keyOutputResults.find((result) => result.id === 'output_2');
  assert.equal(reportOutput.status, 'supported');
  assert.equal(reportOutput.evidenceIds.length, 1);
  assert.equal(datasetOutput.status, 'missing');
  assert.equal(report.criterionResults[0].status, 'partial');
  assert.equal(report.coverageScore, 50);
  assert.equal(report.overallStatus, 'partial');
  assert.doesNotThrow(() => assertAssessmentEvidence(report, graph.evidence.map((item) => item.id)));
});

test('open deterministic conflicts outrank matching evidence', () => {
  const graph = snapshotToEvidenceGraph('project_1', {
    id: 'snapshot_1',
    files: [{ pathToken: 'results/report.pdf', contentHash: 'sha256:abc', extension: '.pdf' }],
  });
  const report = assessProjectObjective({
    intent,
    evidence: graph.evidence,
    nodes: graph.nodes,
    findings: [{
      id: 'finding_1', type: 'conflict', severity: 'P1', status: 'open',
      affectedEntities: [graph.nodes[0].id], evidenceIds: [],
    }],
  });
  assert.equal(report.overallStatus, 'conflicted');
  assert.equal(report.keyOutputResults[0].status, 'conflicted');
  assert.deepEqual(report.keyOutputResults[0].conflictIds, ['finding_1']);
});

test('fabricated evidence references fail closed', () => {
  assert.throws(
    () => assertAssessmentEvidence({
      criterionResults: [{ id: 'criterion', status: 'supported', evidenceIds: ['ev_missing'] }],
      keyOutputResults: [],
    }, new Set()),
    /unknown evidence/u,
  );
});
