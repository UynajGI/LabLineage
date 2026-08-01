# LabLineage Guardian

LabLineage Guardian is an evidence-first research lineage and handoff system.
It combines a React console, an authenticated Node.js API, PostgreSQL tenant
isolation, a signed Edge Collector, deterministic audit rules, and a layered
Google ADK agent.

The system keeps facts, inferences, conflicts, and missing evidence distinct.
It never treats an inferred file move as confirmed, and it awards R4
reproducibility only after a successful controlled rerun with matching output
hashes.

## Competition topic mapping

This project is submitted to the Firebird Hackathon under Google's
**Gemini Enterprise for Higher Education** topic. The mapping from each topic
requirement to an implemented capability — including declared trade-offs and
the live evaluation baseline — is maintained in the
[topic fit document](docs/topic-fit.md).

One-line pitch: **the model explains and interacts; deterministic services own
facts, hashes, evidence, and R0–R4 reproducibility levels.**

## Quick start

Requirements: Node.js 22.15 or newer.

```powershell
npm install --ignore-scripts
Copy-Item .env.example backend/.env.local
npm run hooks:install
npm run seed
npm run dev
```

Open [http://localhost:5173/#/deploy](http://localhost:5173/#/deploy), create a
project, declare its objective/success criteria/key outputs, and choose a source.
The API listens on `http://127.0.0.1:8788`; health, dependency readiness, and
the OpenAPI 3.1 contract are available at `/api/health`, `/api/ready`, and
`/api/openapi.json`.

Scanner, graph, deterministic assessment, audit, and local handoff-preview
features work without a model. Agent summaries use Google ADK and require either
Vertex AI application-default credentials or a Gemini key in the ignored
`backend/.env.local`. Keep secrets out of commands, logs, commits, and
documentation; `LABLINEAGE_PROXY` is optional for local development.

## System map

```text
React/Vite console
        │ /v1 JSON
        ▼
Authenticated Express API ── PostgreSQL in production
        ├── lineage, snapshots, imports, audit, handoff
        ├── immutable object storage
        ├── signed Edge Collector bundles
        └── Google ADK Runner
              ├── routed specialist agents
              ├── parallel evidence gathering
              ├── sequential synthesis and audit
              └── authenticated read-only MCP tools
```

Two deployment profiles share the same API, run state machine, and report
contract:

- `local`: API, JSON/PostgreSQL state, immutable objects, and the inline worker
  run on the workstation and bind to loopback by default.
- `google_cloud`: Cloud Run, Cloud SQL, GCS, Cloud Tasks with OIDC, and Vertex
  AI/ADC run in Google Cloud. The Collector still runs on the user's computer.

Local source code is not uploaded as a ZIP. The Local Collector reads an
explicitly authorized directory and sends a signed, path-redacted Manifest and
evidence. GitHub repositories connect through a read-only GitHub App. ZIP is a
size-limited fallback for exceptional offline transfer only.

The ADK execution trace records routing, agent transitions, bounded tool calls,
evidence identifiers, R levels, token usage, and elapsed time. Model output is
advisory; deterministic services remain authoritative for hashes, evidence,
and reproducibility scores.

## Main workflows

- **Deploy and assess a project:** declare the objective, success criteria and
  key outputs; connect a Local Collector or GitHub repository; then follow the
  automatically started scan, evidence-graph, audit, deterministic assessment,
  and optional ADK-summary stages to an immutable report.
- **Investigate lineage:** import evidence, inspect the graph, distinguish
  confirmed relationships from candidates, and review conflicts.
- **Track non-Git work:** create immutable snapshots, compare bounded changes,
  and retain verifiable cold indexes.
- **Audit reproducibility:** evaluate R0–R3 from recorded evidence and produce
  R4 only through a controlled rerun.
- **Prepare a handoff:** preview Markdown, CSV, and unsent email artifacts
  before any external action.
- **Ask Guardian:** use layered ADK agents to retrieve evidence, audit a result,
  or plan a handoff through read-only tools.

For Collector setup and commands, use the
[Edge Collector guide](docs/collector-guide.md). For architecture, security,
operations, contracts, releases, and validation boundaries, start at the
[documentation index](docs/README.md).

## Production boundary

Production requires PostgreSQL, OIDC/JWKS authentication, signed Manifest
trust, and GCS immutable object storage unless an explicit documented exception
is enabled. Run migrations with a dedicated migration identity, then run the
service with an identity that has no DDL permission.

External integrations remain guarded:

- GitHub App and local Git evidence access is read-only.
- Cloud-hosted services never receive an absolute local path; the Collector
  sends stable path tokens and structured evidence, with raw content disabled
  by default.
- Local repositories must stay under `LABLINEAGE_LOCAL_GIT_ROOTS`.
- Google Workspace writes require a preview and explicit confirmation; Gmail
  creates drafts only.
- Agent tools are bounded and read-only.

See the [administrator guide](docs/administrator-guide.md) for configuration
and the [operations runbook](docs/operations-runbook.md) for deployment,
recovery, and incident procedures.

## Verification

Run the complete repository gate before handing off a change:

```powershell
node scripts/git-hooks.mjs full
```

Useful focused commands:

```powershell
npm run test:all
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=critical
```

Repository-local `pre-commit`, `commit-msg`, `pre-push`, and `post-commit`
hooks are installed with `npm run hooks:install`. `pre-push` includes browser
E2E and accessibility checks. See
[verification status](docs/verification-status.md) for what automation proves
and which assurances still require a real external environment.

Agent-specific quality gates, cost metrics, lifecycle budgets, and the human
usability study are defined in the
[Guardian Agent evaluation protocol](docs/agent-evaluation.md).

## Documentation

The maintained documentation set is organized by audience and task in
[`docs/README.md`](docs/README.md). Historical plans and private working notes
are intentionally not part of the published documentation.
