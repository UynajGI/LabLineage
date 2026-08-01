import assert from 'node:assert/strict';
import test from 'node:test';
import { stableUuid, syncNormalizedProjection } from '../lib/postgres-projection.js';

test('stable UUID mapping is deterministic and namespaced', () => {
  assert.equal(stableUuid('artifact:a'), stableUuid('artifact:a'));
  assert.notEqual(stableUuid('artifact:a'), stableUuid('project:a'));
  assert.match(stableUuid('artifact:a'), /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test('normalized projection writes projects, artifacts, evidence and lineage', async () => {
  const statements = [];
  const client = { query: async (sql, values) => { statements.push({ sql, values }); return { rowCount: 1, rows: [] }; } };
  const state = {
    projects: [{ id: 'p1', slug: 'p1', name: 'Project', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    nodes: [
      { id: 'p1', projectId: 'p1', type: 'Project', label: 'Project' },
      { id: 'a', projectId: 'p1', type: 'Dataset', label: 'data', details: { hash: `sha256:${'a'.repeat(64)}` }, evidenceIds: ['ev1'] },
      { id: 'b', projectId: 'p1', type: 'Figure', label: 'figure', evidenceIds: ['ev2'] }
    ],
    evidence: [
      { id: 'ev1', projectId: 'p1', evidenceType: 'hash', source: 'collector', capturedAt: '2026-01-01T00:00:00Z', payload: {} },
      { id: 'ev2', projectId: 'p1', evidenceType: 'hash', source: 'collector', capturedAt: '2026-01-01T00:00:00Z', payload: {} }
    ],
    edges: [{ source: 'a', target: 'b', relation: 'generated', confidence: 'exact', evidenceIds: ['ev2'] }],
    snapshots: [],
    audits: [],
    findings: [],
    auditEvents: []
  };
  await syncNormalizedProjection(client, '11111111-1111-4111-8111-111111111111', state);
  const sql = statements.map((item) => item.sql).join('\n');
  assert.match(sql, /INSERT INTO projects/);
  assert.match(sql, /INSERT INTO artifacts/);
  assert.match(sql, /INSERT INTO artifact_versions/);
  assert.match(sql, /INSERT INTO evidence/);
  assert.match(sql, /INSERT INTO lineage_edges/);
});

test('snapshot projection hash is stable across JSONB key ordering', async () => {
  const statements = [];
  const client = { query: async (sql, values) => { statements.push({ sql, values }); return { rowCount: 1, rows: [] }; } };
  const state = (file) => ({
    projects: [{ id: 'p1', slug: 'p1', name: 'Project', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    nodes: [], evidence: [], edges: [], audits: [], findings: [], auditEvents: [],
    snapshots: [{ id: 's1', projectId: 'p1', collectedAt: '2026-01-01T00:00:00Z', fileCount: 1, files: [file] }]
  });
  await syncNormalizedProjection(client, '11111111-1111-4111-8111-111111111111', state({
    pathToken: 'reports/canary.json',
    fingerprint: { value: 'fixture', algorithm: 'sha256', strength: 'strong' }
  }));
  await syncNormalizedProjection(client, '11111111-1111-4111-8111-111111111111', state({
    fingerprint: { strength: 'strong', algorithm: 'sha256', value: 'fixture' },
    pathToken: 'reports/canary.json'
  }));
  const hashes = statements
    .filter((item) => /INSERT INTO snapshots/.test(item.sql))
    .map((item) => item.values[3]);
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], hashes[1]);
});
