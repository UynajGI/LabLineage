# Architecture

```text
React/Vite console
       │  /v1 JSON
       ▼
Express API ── JsonStore (.lablineage/state.json)
   │   │
   │   ├── local scanner → SHA-256 snapshots → deterministic diff
   │   ├── manifest importer → nodes + evidence edges
   │   ├── audit engine → R0–R4 score + non-destructive findings
   │   └── handoff exporter → Markdown + CSV + unsent EML draft
   │
   └── Google ADK Runner
          ├── get_project_summary
          ├── get_lineage_graph
          ├── list_open_findings
          ├── get_snapshot_changes
          └── preview_handoff
```

The model never computes hashes or authoritative reproducibility scores. Those
come from deterministic services and are exposed to the agent through read-only
tools. Tool results and model text are treated as separate layers.

Development can use an atomic JSON store so the application runs without
Docker. Production rejects that mode by default and uses PostgreSQL 17,
tenant-scoped transactions, forced RLS, and a normalized projection maintained
in the same transaction as application state. Forward-only migrations are
executed by a separate identity; the runtime has DML-only database privileges.

## Data safety

- Absolute scan paths are never persisted; only relative path tokens are stored.
- Secret-shaped files, Git metadata, dependencies, and build outputs are skipped.
- `LABLINEAGE_SCAN_ROOT` constrains scanner access when configured.
- Handoff writes require preview and explicit confirmation. Drive and Sheets
  writes are externally idempotent; Gmail creates drafts only.
- Agent tools are read-only; evidence content is explicitly treated as
  untrusted data to reduce prompt-injection risk.

## Durable ingestion and immutable objects

Bundle submission stores the serialized payload under an immutable object key
before creating a `queued` job. The database stores only its private object
reference, SHA-256, size and storage generation. Workers claim a five-minute
lease, reload and verify the object, then transition through
`processing → completed/failed`. Expired leases recover on startup, 5xx failures
retry three times with exponential backoff, and a corrected failed job receives
a new immutable retry object while preserving error history.

Handoff reports use the same object abstraction. Local development uses
exclusive hard links; production uses GCS generation preconditions and CRC32C.
Neither internal object keys nor local paths appear in API responses.

## Repository provider boundary

GitHub REST and signed webhook evidence implement one repository provider.
The generic repository sync endpoint also supports `local_git`. Local paths are
canonicalized and checked against `LABLINEAGE_LOCAL_GIT_ROOTS`; Git runs without
interactive prompts or system config. File trees are streamed with a hard item
limit and contain path SHA-256 tokens instead of raw paths. Repository
snapshots, commits, branches and tags flow through the same graph/evidence
conversion as GitHub.

## Delivery architecture

CI pins third-party Actions to immutable commits and gates PostgreSQL RLS,
cross-platform Collector behavior, E2E/Axe, contracts, migrations, performance,
image vulnerabilities, SBOMs and Sigstore signatures. Terraform creates Cloud
Run, Cloud SQL, GCS, Artifact Registry and an optional repository-restricted
GitHub Workload Identity provider. CD updates the migration job to the exact
commit image, executes it, deploys Cloud Run, probes readiness and restores the
previous image on failure.
