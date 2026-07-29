CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  actor_subject text NOT NULL,
  method text NOT NULL CHECK (method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  request_path text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  response_kind text CHECK (response_kind IN ('json', 'send', 'end')),
  response_body jsonb,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, actor_subject, method, request_path, idempotency_key)
);

CREATE INDEX idempotency_records_expiry_idx
  ON idempotency_records(tenant_id, expires_at);

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_idempotency_records ON idempotency_records
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
