ALTER TABLE ingestion_jobs
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN payload_bytes bigint CHECK (payload_bytes >= 0),
  ADD COLUMN error_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN lease_expires_at timestamptz;

CREATE INDEX ingestion_jobs_retry_idx
  ON ingestion_jobs(tenant_id, status, next_attempt_at, lease_expires_at);
