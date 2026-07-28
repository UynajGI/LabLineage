CREATE TABLE data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('filesystem', 'github', 'google_drive', 'offline_bundle')),
  network_mode text NOT NULL CHECK (network_mode IN ('connected', 'outbound_only', 'air_gapped')),
  export_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  bundle_id text,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb,
  error jsonb,
  actor_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE NULLS NOT DISTINCT (tenant_id, source_id, bundle_id)
);

CREATE INDEX data_sources_project_idx ON data_sources(project_id, created_at DESC);
CREATE INDEX ingestion_jobs_project_status_idx ON ingestion_jobs(project_id, status, created_at DESC);

ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_data_sources ON data_sources
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_ingestion_jobs ON ingestion_jobs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
