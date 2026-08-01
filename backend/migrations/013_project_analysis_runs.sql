-- Forward-only migration 013: durable project analysis runs and immutable report metadata.

CREATE TABLE project_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  intent_version_id uuid NOT NULL REFERENCES project_intent_versions(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'ingesting', 'scanning', 'graphing', 'auditing',
               'summarizing', 'completed', 'partial', 'failed', 'cancelled')
  ),
  current_step text CHECK (
    current_step IS NULL OR current_step IN (
      'ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize'
    )
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  source_revision text,
  input_kind text CHECK (input_kind IS NULL OR input_kind IN ('collector_manifest', 'github', 'zip')),
  input_object_key text,
  input_sha256 text CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  deterministic_ready boolean NOT NULL DEFAULT false,
  error_code text,
  error_summary text CHECK (error_summary IS NULL OR char_length(error_summary) <= 2000),
  actor_subject text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, project_id, idempotency_key)
);

CREATE TABLE project_analysis_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES project_analysis_runs(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  step_name text NOT NULL CHECK (
    step_name IN ('ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')
  ),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  input_sha256 text CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[a-f0-9]{64}$'),
  output_sha256 text CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(artifact_refs) = 'array'),
  error_code text,
  error_summary text CHECK (error_summary IS NULL OR char_length(error_summary) <= 2000),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (run_id, step_name)
);

CREATE TABLE project_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES project_analysis_runs(id) ON DELETE RESTRICT,
  intent_version_id uuid NOT NULL REFERENCES project_intent_versions(id) ON DELETE RESTRICT,
  external_id text NOT NULL,
  audit_external_id text,
  overall_status text NOT NULL CHECK (
    overall_status IN ('supported', 'partial', 'missing', 'conflicted', 'not_assessable')
  ),
  coverage_score integer NOT NULL CHECK (coverage_score BETWEEN 0 AND 100),
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  media_type text NOT NULL DEFAULT 'application/json',
  model text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, run_id)
);

CREATE TABLE project_analysis_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES project_analysis_runs(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  event_type text NOT NULL,
  actor_subject text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE INDEX project_analysis_runs_project_status_idx
  ON project_analysis_runs(project_id, status, queued_at DESC);
CREATE INDEX project_analysis_run_steps_claim_idx
  ON project_analysis_run_steps(status, lease_expires_at, updated_at);
CREATE INDEX project_analysis_run_events_timeline_idx
  ON project_analysis_run_events(run_id, created_at, id);

ALTER TABLE project_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_analysis_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_analysis_runs ON project_analysis_runs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE project_analysis_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_analysis_run_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_analysis_run_steps ON project_analysis_run_steps
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE project_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_analysis_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_analysis_reports ON project_analysis_reports
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE project_analysis_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_analysis_run_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_analysis_run_events ON project_analysis_run_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
