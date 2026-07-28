ALTER TABLE ingestion_jobs
  ADD COLUMN payload_object_key text,
  ADD COLUMN payload_storage_uri text,
  ADD COLUMN payload_storage_generation text;

ALTER TABLE ingestion_jobs
  ADD CONSTRAINT ingestion_payload_reference_consistency
  CHECK (
    (payload_object_key IS NULL AND payload_storage_uri IS NULL)
    OR (payload_object_key IS NOT NULL AND payload_storage_uri IS NOT NULL)
  );

COMMENT ON COLUMN ingestion_jobs.payload_object_key IS
  'Internal immutable object key for a queued or retryable ingestion payload; never returned by the API.';

COMMENT ON COLUMN ingestion_jobs.payload_storage_uri IS
  'Private local-object or gs:// storage URI for operational recovery; never returned by the API.';
