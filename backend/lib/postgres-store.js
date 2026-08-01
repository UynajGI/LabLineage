import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, runMigrations } from './database.js';
import { syncNormalizedProjection } from './postgres-projection.js';
import { enforceR4Evidence, makeDemoState, normalizeStateOwnership } from './store.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));

function emptyState() {
  return {
    setupConfig: {
      institutionName: '',
      labName: '',
      adminDisplayName: '',
      adminEmail: '',
      dataResidency: '',
      defaultRegion: '',
      defaultTimezone: 'Asia/Shanghai',
      notificationLanguage: 'zh-CN',
      defaultProjectName: '',
      defaultProjectSlug: '',
      departingMemberEmail: '',
      receivingMemberEmail: '',
      reviewerEmail: '',
      handoffDueDate: ''
    },
    projects: [],
    projectIntents: [],
    projectSuccessCriteria: [],
    projectKeyOutputs: [],
    analysisRuns: [],
    analysisRunSteps: [],
    analysisReports: [],
    analysisRunEvents: [],
    collectorPairings: [],
    collectorCredentials: [],
    sources: [],
    ingestionJobs: [],
    statusProposals: [],
    lineageProposals: [],
    handoffReports: [],
    handoffOrders: [],
    handoffParticipants: [],
    handoffTasks: [],
    handoffTaskEvidence: [],
    handoffReviews: [],
    handoffEvents: [],
    handoffExports: [],
    idempotencyRecords: [],
    snapshots: [],
    evidence: [],
    nodes: [],
    edges: [],
    findings: [],
    audits: [],
    handoffs: [],
    auditEvents: [],
    importedBundles: [],
    workspaceExports: []
  };
}

export class PostgresStore {
  constructor({ pool = createPool(), tenantId, tenantSlug, tenantName } = {}) {
    this.pool = pool;
    this.tenantSlug = tenantSlug || process.env.LABLINEAGE_TENANT_SLUG;
    this.tenantName = tenantName || process.env.LABLINEAGE_TENANT_NAME || this.tenantSlug;
    this.state = null;
    this.stateQueue = Promise.resolve();
    this.tenantId = tenantId || process.env.LABLINEAGE_TENANT_ID || null;
    this.dataDir = path.resolve(backendDir, '..', '..', process.env.LABLINEAGE_DATA_DIR || '.lablineage');
  }

  async withStateLock(operation) {
    const previous = this.stateQueue;
    let release;
    this.stateQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async init() {
    if (!this.tenantSlug) throw new Error('LABLINEAGE_TENANT_SLUG is required in PostgreSQL mode');
    if (process.env.LABLINEAGE_AUTO_MIGRATE === 'true') {
      await runMigrations(this.pool, path.resolve(backendDir, '..', 'migrations'));
    }
    if (this.tenantId) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [this.tenantId]);
        const tenant = await client.query(
          'SELECT id FROM tenants WHERE id=$1 AND slug=$2',
          [this.tenantId, this.tenantSlug]
        );
        await client.query('COMMIT');
        if (!tenant.rowCount) throw new Error('Configured tenant ID and slug do not match an accessible tenant');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } else {
      const allowBootstrap = process.env.LABLINEAGE_ALLOW_TENANT_BOOTSTRAP === 'true'
        || process.env.NODE_ENV !== 'production';
      if (!allowBootstrap) {
        throw new Error('LABLINEAGE_TENANT_ID is required for a least-privilege production runtime');
      }
      const tenant = await this.pool.query(
        `INSERT INTO tenants(slug,name) VALUES($1,$2)
         ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [this.tenantSlug, this.tenantName]
      );
      this.tenantId = tenant.rows[0].id;
    }
    const initial = process.env.LABLINEAGE_SEED_DEMO === 'true' ? makeDemoState() : emptyState();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [this.tenantId]);
      await client.query(
        `INSERT INTO application_state(tenant_id,state) VALUES($1,$2::jsonb)
         ON CONFLICT(tenant_id) DO NOTHING`,
        [this.tenantId, JSON.stringify(initial)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.refresh();
    await this.update(() => {});
    return this;
  }

  async refresh() {
    return this.withStateLock(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [this.tenantId]);
        const result = await client.query('SELECT state FROM application_state WHERE tenant_id=$1', [this.tenantId]);
        await client.query('COMMIT');
        if (!result.rowCount) throw new Error('Tenant application state is missing');
        this.state = result.rows[0].state;
        normalizeStateOwnership(this.state);
        enforceR4Evidence(this.state);
        return this.state;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });
  }

  get() {
    if (!this.state) throw new Error('Store has not been initialized');
    return this.state;
  }

  async update(mutator) {
    return this.withStateLock(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [this.tenantId]);
        const locked = await client.query(
          'SELECT state,version FROM application_state WHERE tenant_id=$1 FOR UPDATE',
          [this.tenantId]
        );
        if (!locked.rowCount) throw new Error('Tenant application state is missing');
        const nextState = locked.rows[0].state;
        const result = await mutator(nextState);
        await client.query(
          `UPDATE application_state
           SET state=$2::jsonb,version=version+1,updated_at=now()
           WHERE tenant_id=$1`,
          [this.tenantId, JSON.stringify(nextState)]
        );
        await syncNormalizedProjection(client, this.tenantId, nextState);
        await client.query('COMMIT');
        this.state = nextState;
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async log({ action, resource, status = 'success', details, userSubject, actor }) {
    const event = {
      id: `ae_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      traceId: `trace_${randomUUID()}`,
      userSubject: userSubject || actor || 'system',
      action,
      resource,
      status,
      details
    };
    await this.update((state) => {
      state.auditEvents.unshift(event);
      state.auditEvents = state.auditEvents.slice(0, 500);
    });
    return event;
  }

  async close() {
    await this.pool.end();
  }
}
