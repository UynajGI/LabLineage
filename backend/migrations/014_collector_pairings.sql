CREATE TABLE collector_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'claimed', 'expired', 'revoked')),
  collector_external_id text,
  source_external_id text,
  created_by_subject text NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE collector_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  pairing_id uuid NOT NULL REFERENCES collector_pairings(id) ON DELETE RESTRICT,
  external_id text NOT NULL,
  collector_external_id text NOT NULL,
  public_key_fingerprint text NOT NULL CHECK (public_key_fingerprint ~ '^[a-f0-9]{64}$'),
  public_key_pem text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, collector_external_id),
  UNIQUE (tenant_id, project_id, public_key_fingerprint)
);

CREATE INDEX collector_pairings_project_status_idx
  ON collector_pairings(tenant_id, project_id, status, expires_at);
CREATE INDEX collector_credentials_project_status_idx
  ON collector_credentials(tenant_id, project_id, status, expires_at);

ALTER TABLE collector_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_pairings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_collector_pairings ON collector_pairings
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE collector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_collector_credentials ON collector_credentials
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
