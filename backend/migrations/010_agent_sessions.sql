CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_subject text NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 500),
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 8 AND 100),
  app_name text NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, actor_subject, conversation_id)
);

CREATE TABLE agent_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  author text NOT NULL,
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id, event_id)
);

CREATE INDEX agent_sessions_lookup_idx
  ON agent_sessions(tenant_id, project_id, actor_subject, updated_at DESC);
CREATE INDEX agent_session_events_order_idx
  ON agent_session_events(tenant_id, session_id, occurred_at, id);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_agent_sessions ON agent_sessions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_agent_session_events ON agent_session_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
