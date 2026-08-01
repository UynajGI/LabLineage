import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { GuardianSessionService } from '../lib/agent-session-service.js';
import { PostgresStore } from '../lib/postgres-store.js';

const { Pool } = pg;
const adminUrl = process.env.LABLINEAGE_TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.LABLINEAGE_TEST_DATABASE_APP_URL;
const enabled = Boolean(adminUrl && appUrl);
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

test('PostgreSQL projection and RLS isolate a least-privilege runtime role', {
  skip: enabled ? false : 'Set LABLINEAGE_TEST_DATABASE_ADMIN_URL and LABLINEAGE_TEST_DATABASE_APP_URL'
}, async () => {
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  const appPool = new Pool({ connectionString: appUrl, max: 2 });
  try {
    await admin.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lablineage_app_test') THEN
          CREATE ROLE lablineage_app_test LOGIN PASSWORD 'app-test-only-password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
          ALTER ROLE lablineage_app_test PASSWORD 'app-test-only-password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
      GRANT USAGE ON SCHEMA public TO lablineage_app_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lablineage_app_test;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lablineage_app_test;
    `);
    await admin.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [[tenantA, tenantB]]);
    await admin.query(
      `INSERT INTO tenants(id,slug,name) VALUES
       ($1,'rls-a','RLS tenant A'),($2,'rls-b','RLS tenant B')`,
      [tenantA, tenantB]
    );
    await admin.query(
      `INSERT INTO projects(id,tenant_id,slug,name) VALUES
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'raw-a','Raw A'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$2,'raw-b','Raw B')`,
      [tenantA, tenantB]
    );

    const client = await appPool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      const visibleToA = await client.query('SELECT tenant_id FROM projects ORDER BY tenant_id');
      await client.query('COMMIT');
      assert.deepEqual(visibleToA.rows.map((row) => row.tenant_id), [tenantA]);

      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      await assert.rejects(
        client.query(
          `INSERT INTO projects(id,tenant_id,slug,name)
           VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$1,'cross-tenant','Cross tenant')`,
          [tenantB]
        ),
        (error) => error.code === '42501'
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const store = new PostgresStore({
      pool: appPool,
      tenantId: tenantA,
      tenantSlug: 'rls-a',
      tenantName: 'RLS tenant A'
    });
    await store.init();
    await admin.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lablineage_app_test;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lablineage_app_test;
    `);
    await store.update((state) => {
      state.projects.push({
        id: 'project-projection',
        slug: 'projection',
        name: 'Projection verification',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      state.nodes.push({
        id: 'artifact-projection',
        projectId: 'project-projection',
        type: 'Dataset',
        label: 'projection.csv',
        status: 'verified',
        reproducibility: 'R2',
        details: { hash: `sha256:${'a'.repeat(64)}`, sizeBytes: 42 }
      });
    });
    const projected = await admin.query(
      `SELECT count(*)::int AS count
       FROM artifacts a
       JOIN projects p ON p.id=a.project_id
       WHERE a.tenant_id=$1 AND p.settings->>'externalId'='project-projection'`,
      [tenantA]
    );
    assert.equal(projected.rows[0].count, 1);

    let resumeUpdate;
    let updateEntered;
    const entered = new Promise((resolve) => { updateEntered = resolve; });
    const paused = new Promise((resolve) => { resumeUpdate = resolve; });
    const concurrentUpdate = store.update(async (state) => {
      updateEntered();
      await paused;
      state.projects.push({
        id: 'project-concurrent-refresh',
        slug: 'concurrent-refresh',
        name: 'Concurrent refresh verification',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
    await entered;
    let refreshFinished = false;
    const concurrentRefresh = store.refresh().then(() => { refreshFinished = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(refreshFinished, false, 'refresh must wait for the active state update');
    } finally {
      resumeUpdate();
    }
    await Promise.all([concurrentUpdate, concurrentRefresh]);
    await store.refresh();
    assert.equal(store.get().projects.some((project) => project.id === 'project-concurrent-refresh'), true);

    const sessions = new GuardianSessionService(store, 'project-projection');
    const conversation = await sessions.createConversation('postgres-actor', 'PostgreSQL session');
    const session = await sessions.getSession({
      appName: sessions.appName,
      userId: 'postgres-actor',
      sessionId: conversation.id
    });
    await sessions.appendEvent({
      session,
      event: {
        id: 'postgres-event-1',
        author: 'EvidenceRetrieverAgent',
        timestamp: Date.now() / 1000,
        actions: { stateDelta: { persisted: true } },
        content: { role: 'model', parts: [{ text: 'persisted' }] }
      }
    });
    const restored = await sessions.getSession({
      appName: sessions.appName,
      userId: 'postgres-actor',
      sessionId: conversation.id
    });
    assert.equal(restored.events.length, 1);
    assert.equal(restored.state.persisted, true);

    const tenantBClient = await appPool.connect();
    try {
      await tenantBClient.query('BEGIN READ ONLY');
      await tenantBClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB]);
      const invisibleSessions = await tenantBClient.query('SELECT id FROM agent_sessions');
      await tenantBClient.query('COMMIT');
      assert.equal(invisibleSessions.rowCount, 0);
    } finally {
      tenantBClient.release();
    }
  } finally {
    await appPool.end();
    await admin.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [[tenantA, tenantB]]).catch(() => {});
    await admin.end();
  }
});
