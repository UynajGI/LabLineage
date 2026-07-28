ALTER TABLE audit_events ADD COLUMN external_id text;
CREATE UNIQUE INDEX audit_events_tenant_external_id_idx
  ON audit_events(tenant_id, external_id)
  WHERE external_id IS NOT NULL;
