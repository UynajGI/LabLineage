import { BaseSessionService, createSession } from '@google/adk';
import { randomUUID } from 'node:crypto';
import { stableUuid } from './postgres-projection.js';

const APP_PREFIX = 'lablineage_guardian:';

function appNameForProject(projectId) {
  return `${APP_PREFIX}${projectId}`;
}

function projectIdFromAppName(appName) {
  if (!appName.startsWith(APP_PREFIX)) throw new Error('Invalid Guardian ADK app name');
  return appName.slice(APP_PREFIX.length);
}

function newSession({ appName, userId, sessionId, state = {}, lastUpdateTime = Date.now() }) {
  return createSession({
    id: sessionId,
    appName,
    userId,
    state: structuredClone(state),
    events: [],
    lastUpdateTime
  });
}

function jsonSessions(state) {
  state.agentSessions ||= [];
  return state.agentSessions;
}

export class GuardianSessionService extends BaseSessionService {
  constructor(store, projectId) {
    super();
    this.store = store;
    this.projectId = projectId;
    this.appName = appNameForProject(projectId);
  }

  get isPostgres() {
    return Boolean(this.store.pool && this.store.tenantId);
  }

  async withTenantClient(work) {
    const client = await this.store.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [this.store.tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  assertBoundary({ appName, userId, sessionId }) {
    if (appName !== this.appName || projectIdFromAppName(appName) !== this.projectId) {
      throw new Error('ADK session project boundary mismatch');
    }
    if (!userId || !sessionId) throw new Error('ADK session actor and conversation are required');
  }

  async createSession({ appName, userId, state = {}, sessionId = `conv_${randomUUID()}` }) {
    this.assertBoundary({ appName, userId, sessionId });
    const session = newSession({ appName, userId, sessionId, state });
    if (this.isPostgres) {
      const projectUuid = stableUuid(`project:${this.projectId}`);
      return this.withTenantClient(async (client) => {
        await client.query(
          `INSERT INTO agent_sessions(
             id,tenant_id,project_id,actor_subject,conversation_id,app_name,title,state,created_at,updated_at
           )
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now())
           ON CONFLICT(tenant_id,project_id,actor_subject,conversation_id) DO NOTHING`,
          [
            stableUuid(`agent-session:${this.store.tenantId}:${this.projectId}:${userId}:${sessionId}`),
            this.store.tenantId,
            projectUuid,
            userId,
            sessionId,
            appName,
            String(state.title || 'New conversation').slice(0, 200),
            JSON.stringify(state)
          ]
        );
        return (await this.getSessionWithClient(client, { appName, userId, sessionId })) || session;
      });
    }
    await this.store.update((root) => {
      const sessions = jsonSessions(root);
      if (!sessions.some((item) =>
        item.projectId === this.projectId && item.actorSubject === userId && item.conversationId === sessionId
      )) {
        sessions.push({
          projectId: this.projectId,
          actorSubject: userId,
          conversationId: sessionId,
          appName,
          title: String(state.title || 'New conversation').slice(0, 200),
          state: structuredClone(state),
          events: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });
    return (await this.getSession({ appName, userId, sessionId })) || session;
  }

  async getSessionWithClient(client, { appName, userId, sessionId, config }) {
    const projectUuid = stableUuid(`project:${this.projectId}`);
    const result = await client.query(
      `SELECT id,state,extract(epoch from updated_at) * 1000 AS updated_ms
       FROM agent_sessions
       WHERE tenant_id=$1 AND project_id=$2 AND actor_subject=$3 AND conversation_id=$4 AND app_name=$5`,
      [this.store.tenantId, projectUuid, userId, sessionId, appName]
    );
    if (!result.rows[0]) return undefined;
    const session = newSession({
      appName,
      userId,
      sessionId,
      state: result.rows[0].state || {},
      lastUpdateTime: Number(result.rows[0].updated_ms)
    });
    const values = [this.store.tenantId, result.rows[0].id];
    let filter = '';
    if (config?.afterTimestamp) {
      values.push(new Date(config.afterTimestamp).toISOString());
      filter = ` AND occurred_at > $${values.length}`;
    }
    const limit = config?.numRecentEvents
      ? ` LIMIT ${Math.max(1, Math.min(Number(config.numRecentEvents), 1000))}`
      : '';
    const events = await client.query(
      `SELECT event FROM agent_session_events
       WHERE tenant_id=$1 AND session_id=$2${filter}
       ORDER BY occurred_at DESC,id DESC${limit}`,
      values
    );
    session.events = events.rows.reverse().map((row) => row.event);
    return session;
  }

  async getSession({ appName, userId, sessionId, config }) {
    this.assertBoundary({ appName, userId, sessionId });
    if (this.isPostgres) {
      return this.withTenantClient((client) =>
        this.getSessionWithClient(client, { appName, userId, sessionId, config })
      );
    }
    const item = jsonSessions(this.store.get()).find((candidate) =>
      candidate.projectId === this.projectId &&
      candidate.actorSubject === userId &&
      candidate.conversationId === sessionId &&
      candidate.appName === appName
    );
    if (!item) return undefined;
    let events = structuredClone(item.events || []);
    if (config?.afterTimestamp) {
      events = events.filter((event) => Number(event.timestamp || 0) * 1000 > config.afterTimestamp);
    }
    if (config?.numRecentEvents) events = events.slice(-config.numRecentEvents);
    const session = newSession({
      appName,
      userId,
      sessionId,
      state: item.state || {},
      lastUpdateTime: Date.parse(item.updatedAt)
    });
    session.events = events;
    return session;
  }

  async listSessions({ appName, userId, limit, offset = 0, page, order }) {
    this.assertBoundary({ appName, userId, sessionId: 'list-sessions' });
    const pageSize = limit ? Math.max(1, Math.min(Number(limit), 100)) : undefined;
    const resolvedOffset = page && pageSize ? (Math.max(1, page) - 1) * pageSize : Math.max(0, offset);
    if (this.isPostgres) {
      return this.withTenantClient(async (client) => {
        const projectUuid = stableUuid(`project:${this.projectId}`);
        const count = await client.query(
          `SELECT count(*)::int AS total
           FROM agent_sessions WHERE tenant_id=$1 AND project_id=$2 AND actor_subject=$3 AND app_name=$4`,
          [this.store.tenantId, projectUuid, userId, appName]
        );
        const totalItems = count.rows[0].total;
        const values = [this.store.tenantId, projectUuid, userId, appName];
        const paging = pageSize ? ` LIMIT ${pageSize} OFFSET ${resolvedOffset}` : '';
        const rows = await client.query(
          `SELECT conversation_id,state,extract(epoch from updated_at) * 1000 AS updated_ms
           FROM agent_sessions
           WHERE tenant_id=$1 AND project_id=$2 AND actor_subject=$3 AND app_name=$4
           ${order ? `ORDER BY updated_at ${order === 'asc' ? 'ASC' : 'DESC'}` : ''}${paging}`,
          values
        );
        const sessions = rows.rows.map((row) => newSession({
          appName,
          userId,
          sessionId: row.conversation_id,
          state: row.state || {},
          lastUpdateTime: Number(row.updated_ms)
        }));
        return {
          sessions,
          page: pageSize ? Math.floor(resolvedOffset / pageSize) + 1 : 1,
          limit: pageSize || totalItems,
          totalItems,
          totalPages: pageSize ? Math.ceil(totalItems / pageSize) : (totalItems ? 1 : 0)
        };
      });
    }
    const all = jsonSessions(this.store.get())
      .filter((item) =>
        item.projectId === this.projectId && item.actorSubject === userId && item.appName === appName
      )
      .sort((a, b) => order === 'asc'
        ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const selected = pageSize ? all.slice(resolvedOffset, resolvedOffset + pageSize) : all;
    return {
      sessions: selected.map((item) => newSession({
        appName,
        userId,
        sessionId: item.conversationId,
        state: item.state || {},
        lastUpdateTime: Date.parse(item.updatedAt)
      })),
      page: pageSize ? Math.floor(resolvedOffset / pageSize) + 1 : 1,
      limit: pageSize || all.length,
      totalItems: all.length,
      totalPages: pageSize ? Math.ceil(all.length / pageSize) : (all.length ? 1 : 0)
    };
  }

  async deleteSession({ appName, userId, sessionId }) {
    this.assertBoundary({ appName, userId, sessionId });
    if (this.isPostgres) {
      const projectUuid = stableUuid(`project:${this.projectId}`);
      await this.withTenantClient((client) => client.query(
        `DELETE FROM agent_sessions
         WHERE tenant_id=$1 AND project_id=$2 AND actor_subject=$3 AND conversation_id=$4 AND app_name=$5`,
        [this.store.tenantId, projectUuid, userId, sessionId, appName]
      ));
      return;
    }
    await this.store.update((root) => {
      root.agentSessions = jsonSessions(root).filter((item) =>
        !(item.projectId === this.projectId &&
          item.actorSubject === userId &&
          item.conversationId === sessionId &&
          item.appName === appName)
      );
    });
  }

  async appendEvent({ session, event }) {
    const appended = await super.appendEvent({ session, event });
    if (event.partial) return appended;
    session.lastUpdateTime = Date.now();
    if (this.isPostgres) {
      await this.withTenantClient(async (client) => {
        const projectUuid = stableUuid(`project:${this.projectId}`);
        const sessionId = stableUuid(
          `agent-session:${this.store.tenantId}:${this.projectId}:${session.userId}:${session.id}`
        );
        await client.query(
          `UPDATE agent_sessions
           SET state=$1::jsonb,updated_at=now()
           WHERE tenant_id=$2 AND project_id=$3 AND actor_subject=$4 AND conversation_id=$5`,
          [JSON.stringify(session.state), this.store.tenantId, projectUuid, session.userId, session.id]
        );
        await client.query(
          `INSERT INTO agent_session_events(
             tenant_id,session_id,event_id,author,event,occurred_at
           ) VALUES($1,$2,$3,$4,$5::jsonb,now())
           ON CONFLICT(tenant_id,session_id,event_id) DO UPDATE SET event=EXCLUDED.event,author=EXCLUDED.author`,
          [
            this.store.tenantId,
            sessionId,
            event.id || `event_${randomUUID()}`,
            event.author || 'unknown',
            JSON.stringify(event)
          ]
        );
      });
      return appended;
    }
    await this.store.update((root) => {
      const item = jsonSessions(root).find((candidate) =>
        candidate.projectId === this.projectId &&
        candidate.actorSubject === session.userId &&
        candidate.conversationId === session.id
      );
      if (!item) throw new Error('ADK session disappeared before event append');
      item.state = structuredClone(session.state);
      const index = item.events.findIndex((candidate) => candidate.id === event.id);
      if (index >= 0) item.events[index] = structuredClone(event);
      else item.events.push(structuredClone(event));
      item.updatedAt = new Date().toISOString();
    });
    return appended;
  }

  async createConversation(actorId, title = 'New conversation') {
    const conversationId = `conv_${randomUUID()}`;
    const session = await this.createSession({
      appName: this.appName,
      userId: actorId,
      sessionId: conversationId,
      state: { projectId: this.projectId, actorId, conversationId, title }
    });
    return this.toConversation(session);
  }

  async listConversations(actorId) {
    const result = await this.listSessions({
      appName: this.appName,
      userId: actorId,
      limit: 100,
      order: 'desc'
    });
    return result.sessions.map((session) => this.toConversation(session));
  }

  toConversation(session) {
    return {
      id: session.id,
      projectId: this.projectId,
      actorId: session.userId,
      title: String(session.state.title || 'New conversation'),
      updatedAt: new Date(session.lastUpdateTime).toISOString()
    };
  }
}

export { appNameForProject };
