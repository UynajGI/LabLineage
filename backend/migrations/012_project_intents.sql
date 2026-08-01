-- Forward-only migration 012: immutable, versioned project objectives.

CREATE TABLE project_intent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 1 AND 4000),
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  is_legacy boolean NOT NULL DEFAULT false,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, project_id, version)
);

CREATE TABLE project_success_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intent_version_id uuid NOT NULL REFERENCES project_intent_versions(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (intent_version_id, sort_order)
);

CREATE TABLE project_key_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intent_version_id uuid NOT NULL REFERENCES project_intent_versions(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  output_kind text NOT NULL CHECK (
    output_kind IN ('artifact', 'code', 'dataset', 'figure', 'report', 'environment', 'other')
  ),
  expected_path_hint text CHECK (expected_path_hint IS NULL OR char_length(expected_path_hint) BETWEEN 1 AND 500),
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (intent_version_id, sort_order)
);

CREATE INDEX project_intent_versions_project_idx
  ON project_intent_versions(project_id, version DESC);
CREATE INDEX project_success_criteria_intent_idx
  ON project_success_criteria(intent_version_id, sort_order);
CREATE INDEX project_key_outputs_intent_idx
  ON project_key_outputs(intent_version_id, sort_order);

ALTER TABLE project_intent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_intent_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_intent_versions ON project_intent_versions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE project_success_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_success_criteria FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_success_criteria ON project_success_criteria
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE project_key_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_key_outputs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_project_key_outputs ON project_key_outputs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
