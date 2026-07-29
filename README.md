# LabLineage Guardian

LabLineage Guardian is an evidence-first research lineage and handoff system. It includes a React console, an authenticated Node API, PostgreSQL migrations and tenant isolation, a signed Edge Collector, deterministic lineage/audit rules, a Google ADK agent, and guarded GitHub/Google Workspace integrations.

## New here?

Start with [从这里开始](docs/start-here.md). It separates the paths for researchers, auditors, administrators, operators, and developers.

- [10 分钟体验](docs/quickstart.md): use seeded data; no cloud or model credentials required.
- [接入第一个项目](docs/first-project.md): create a project, scan a safe directory, import a signed Manifest, and inspect lineage.
- [核心术语表](docs/glossary.md): Project, Snapshot, Bundle, Evidence, Finding, and R0–R4.

## Open the application

Requirements: Node.js 22.15 or newer.

macOS / Linux:

```bash
npm install --ignore-scripts
cp .env.example backend/.env.local
npm run seed
npm run dev
```

Windows PowerShell:

```powershell
npm install --ignore-scripts
Copy-Item .env.example backend/.env.local
npm run seed
npm run dev
```

Then open [http://localhost:5173/#/checklist](http://localhost:5173/#/checklist). The development command waits for the API health check before starting Vite, and read-only requests tolerate a brief API watch restart. API health is at [http://127.0.0.1:8788/api/health](http://127.0.0.1:8788/api/health); dependency readiness is at [http://127.0.0.1:8788/api/ready](http://127.0.0.1:8788/api/ready).

The machine-readable OpenAPI 3.1 contract is available at [http://127.0.0.1:8788/api/openapi.json](http://127.0.0.1:8788/api/openapi.json), and `/api/version` reports API, implementation, Manifest, and Collector runtime compatibility versions. CI fails if any implemented `/v1` operation is missing or if a write request or successful response still uses a placeholder contract.

The scanner, graph, audit and local handoff preview work without a model key. Agent chat requires `GOOGLE_GENAI_API_KEY` or `GEMINI_API_KEY`. For a Vertex AI Express Mode `AQ.` key, keep `LABLINEAGE_VERTEX_EXPRESS=TRUE`; `LABLINEAGE_PROXY=http://127.0.0.1:17891` routes model traffic through the requested local proxy.

## Edge Collector

For the production project workflow and security guidance, see [Edge Collector 安装与安全操作指南](docs/collector-guide.md).
Non-Git baseline semantics, bounded text diff, binary summaries, inferred move
candidates, and cold-index retention are documented in
[Non-Git snapshot and change tracking](docs/snapshot-tracking.md).
Release artifacts, CycloneDX SBOMs, checksums, keyless signatures, verification,
promotion, and rollback are documented in
[Release and supply-chain procedure](docs/release-and-supply-chain.md).

Initialize a project, create immutable snapshots, and export a signed offline handoff archive:

```powershell
npm run collector -- init --project project-slug --root C:\research\project
npm run collector -- scan --project project-slug --root C:\research\project
npm run collector -- export --project project-slug --root C:\research\project --snapshot latest --output handoff-bundle.tar.zst
npm run collector -- verify handoff-bundle.tar.zst
```

The low-level stateless command remains available for automation:

```powershell
npm run collector -- snapshot --root C:\research\project --project project-slug --out bundle.json --path-salt "replace-with-secret"
```

Add `--private-key collector-private.pem` to create an Ed25519-signed bundle. Verify and compare bundles:

```powershell
npm run collector -- verify --bundle bundle.json
npm run collector -- diff --before before.json --after after.json
```

A controlled rerun can produce R4 evidence only when the command exits successfully and changed output hashes match an expected manifest:

```powershell
npm run collector -- run --root C:\research\project --project project-slug --out rerun.json --path-salt "replace-with-secret" --expected expected.json --private-key collector-private.pem -- python analysis.py
```

Upload one bundle, or resume a directory queue after an interruption. The service
token can be supplied through `LABLINEAGE_SERVICE_TOKEN` so it does not appear in
shell history:

```powershell
$env:LABLINEAGE_SERVICE_TOKEN = "replace-with-service-token"
npm run collector -- upload --bundle bundle.json --url http://127.0.0.1:8788
npm run collector -- upload --queue C:\research\upload-queue --url http://127.0.0.1:8788
```

Queue progress is atomically recorded in `.lablineage-upload-state.json`. Completed
`bundle_id` values are skipped on the next run; transient network, 429 and 5xx
failures are retried with bounded exponential backoff.

## Production

- Set `DATABASE_URL`, tenant settings and OIDC/JWKS settings; JSON storage is rejected in production unless explicitly overridden.
- Run `npm run migrate` using a migration identity, then start the application with a runtime identity that has no DDL permissions.
- Require signed manifests and configure trusted Collector SPKI fingerprints.
- Use a read-only GitHub App installation and Workspace OAuth scopes limited to Drive files, Sheets values and Gmail drafts.
- Allow local Git only through `LABLINEAGE_LOCAL_GIT_ROOTS`; repository evidence never exports raw file paths.
- Build with `Dockerfile`, or use `compose.yaml` for a local PostgreSQL production-shaped environment.
- Base images and browser dependencies are digest/version pinned; production deployment resolves the pushed Artifact Registry tag to a digest before migration or rollout.
- Provision Artifact Registry and GitHub OIDC with Terraform, then use the protected `Deploy` workflow for staging or production.

See the [documentation entry point](docs/start-here.md), [user guide](docs/user-guide.md), [administrator guide](docs/administrator-guide.md), [full-scope completion matrix](docs/full-scope-completion-matrix.md), [API and data contracts](docs/api-and-data-contracts.md), [operations runbook](docs/operations-runbook.md), [threat model](docs/threat-model.md), [dependency risk register](docs/dependency-risk-register.md), and [architecture](docs/architecture.md).

## Verification

```powershell
npm run test:all
npm run build
npm audit --omit=dev --omit=optional --audit-level=critical
```

Git uses repository-local `pre-commit`, `commit-msg`, `pre-push`, and `post-commit` hooks. `pre-push` runs the complete local validation, including E2E/accessibility. Reinstall them with `node scripts/install-git-hooks.mjs`.

The capability page is sourced from live backend configuration. Mock completion states and simulated integration-success scripts are intentionally absent.
