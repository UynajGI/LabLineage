# Architecture

```text
React/Vite console
       │ /v1 JSON
       ▼
Express API ── JsonStore (.lablineage/state.json, development only)
   │
   ├── local scanner → SHA-256 snapshots → deterministic diff
   ├── manifest importer → nodes + evidence edges
   ├── audit engine → R0–R4 score + non-destructive findings
   ├── handoff exporter → immutable Markdown + CSV + unsent EML draft
   │
   └── Google ADK Runner
          │ projectId + actorId + conversationId
          ▼
       GuardianRootAgent (RoutedAgent)
          ├── EvidenceRetrieverAgent (SequentialAgent)
          │      ├── ParallelEvidenceSources (ParallelAgent)
          │      │      ├── lineage source
          │      │      └── repository source
          │      └── evidence synthesis
          ├── ReproducibilityAuditorAgent (SequentialAgent)
          │      ├── AuditEvidenceSources (ParallelAgent)
          │      └── deterministic audit decision
          └── HandoffPlannerAgent
                 │
                 ├── five schema-bounded FunctionTools
                 └── MCPToolset → internal read-only MCP endpoint
```

The root uses deterministic intent routing, while the specialist agents keep
evidence retrieval, reproducibility judgment and handoff planning separate.
Evidence sources can execute concurrently, but synthesis and audit decisions
are sequential. `RoutedAgent` is experimental in ADK 1.4.0, so the dependency is
pinned and its routing, agent names and allowed tools are covered by policy
tests.

The model never computes hashes or authoritative reproducibility scores. Those
come from deterministic services and are exposed through read-only tools. Tool
results and model text remain separate layers, and every response returns a
structured execution trace containing routes, agent transitions, tool calls,
tool results, bounded evidence IDs, R levels and elapsed time.

## Session boundary

ADK state is scoped by `projectId + actorId + conversationId`. PostgreSQL stores
sessions and append-only ADK events in tenant-scoped tables with `ENABLE RLS`,
`FORCE RLS` and tenant policies. A user can start a new conversation or delete a
conversation and all of its events. The JSON implementation exists only for
local development; production requires PostgreSQL.

## Read-only MCP boundary

The API hosts an internal Streamable HTTP MCP endpoint with two tools:
`lineage_evidence` and `repository_evidence`. Each tool is annotated read-only
and non-destructive, returns bounded fields, and never returns local paths or
credentials. The endpoint requires a process-internal bearer token and is not a
public `/v1` integration. ADK discovers and calls these tools through
`MCPToolset`; an integration test exercises the real protocol boundary.

## Data safety

- Absolute scan paths are never persisted; only relative path tokens are stored.
- Secret-shaped files, Git metadata, dependencies and build outputs are skipped.
- `LABLINEAGE_SCAN_ROOT` constrains scanner access when configured.
- Handoff writes require preview and explicit confirmation. Drive and Sheets
  writes are externally idempotent; Gmail creates drafts only.
- Agent and MCP tools are read-only; evidence content is explicitly treated as
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
image vulnerabilities, SBOMs and Sigstore signatures. A separate scheduled or
manual live-Agent evaluation records model, route, structured trace, tool calls,
token usage and latency as a retained workflow artifact.

Terraform creates Cloud Run, Cloud SQL, GCS, Artifact Registry and an optional
repository-restricted GitHub Workload Identity provider. CD updates the
migration job to the exact commit image, executes it, deploys Cloud Run, probes
readiness and restores the previous image on failure.
