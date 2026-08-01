-- Forward-only migration 011: HandoffOrder domain model.
-- A handoff order is a repeatable, approvable, trackable entity owned by one
-- project. Event-level fields (departing/receiving/reviewer/due date) no longer
-- belong to the global system setup.

CREATE TABLE handoff_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  order_number text NOT NULL,
  departing_subject text NOT NULL,
  departing_email_snapshot text NOT NULL,
  receiving_subject text NOT NULL,
  receiving_email_snapshot text NOT NULL,
  reviewer_subject text NOT NULL,
  reviewer_email_snapshot text NOT NULL,
  due_at timestamptz,
  due_timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'submitted', 'in_review', 'changes_requested',
               'approved', 'receiver_accepted', 'completed', 'cancelled')
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE handoff_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES handoff_orders(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('departing', 'receiving', 'reviewer')),
  subject text NOT NULL,
  email_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES handoff_orders(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'blocked')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_task_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES handoff_tasks(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  evidence_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES handoff_orders(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  reviewer_subject text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES handoff_orders(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  event_type text NOT NULL,
  actor_subject text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES handoff_orders(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('workspace', 'local')),
  preview_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  drive_file_id text,
  sheets_ledger text,
  gmail_draft_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

-- Existing report rows stay valid; new reports are bound to an order.
ALTER TABLE handoff_reports
  ADD COLUMN handoff_order_id uuid REFERENCES handoff_orders(id) ON DELETE SET NULL;

-- Tenant isolation for every new table (mirrors 006_identity_rls.sql).
ALTER TABLE handoff_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_orders ON handoff_orders
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_participants ON handoff_participants
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_tasks ON handoff_tasks
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_task_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_task_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_task_evidence ON handoff_task_evidence
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_reviews ON handoff_reviews
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_events ON handoff_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE handoff_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_handoff_exports ON handoff_exports
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
