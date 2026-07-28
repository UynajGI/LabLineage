CREATE TABLE lineage_edge_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lineage_edge_id uuid NOT NULL REFERENCES lineage_edges(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirm', 'reject')),
  comment text NOT NULL,
  reviewer_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE asset_status_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  replacement_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  proposed_status text NOT NULL CHECK (proposed_status IN ('candidate', 'accepted', 'superseded', 'quarantined', 'duplicate')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  proposed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE handoff_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  handoff_external_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  format text NOT NULL CHECK (format = 'markdown'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_uri text NOT NULL,
  generated_by text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, handoff_external_id, version)
);

CREATE INDEX lineage_edge_reviews_project_idx ON lineage_edge_reviews(project_id, created_at DESC);
CREATE INDEX asset_status_proposals_project_idx ON asset_status_proposals(project_id, status, created_at DESC);
CREATE INDEX handoff_reports_project_idx ON handoff_reports(project_id, created_at DESC);

ALTER TABLE lineage_edge_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineage_edge_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_status_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_status_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE handoff_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_lineage_edge_reviews ON lineage_edge_reviews
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_asset_status_proposals ON asset_status_proposals
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_handoff_reports ON handoff_reports
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
