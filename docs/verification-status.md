# Verification status and assurance boundaries

## Project onboarding validation map

Repository automation covers the following contracts for the current feature:

| Area | Repository evidence | Still external |
|---|---|---|
| Project intent and run state | unit/integration tests for versioned goals, legal transitions, lease recovery, retry/cancel and deterministic assessment | representative-user acceptance |
| Local Collector | pairing expiry/single use, signature and replay checks, revocation, manifest-driven automatic run | cross-network Cloud Run pairing canary and target filesystem scale |
| GitHub App | stubbed read-only collection, pinned SHA, immutable input, `403/404/429` mapping | authorized sandbox installation and live rate-limit behavior |
| ZIP fallback | traversal/symlink/size/compression defenses, immutable object, automatic report and cleanup | approved real-data policy review |
| Console | TypeScript build plus Playwright journey, refresh restoration, retry/error and Axe checks | assistive-technology and representative-user review |
| Google Cloud | Terraform fmt/init/validate, deployment-mode validation and workflow lint | apply in target project, Cloud Tasks OIDC canary, alert delivery and rollback drill |
| Google ADK | deterministic fake-model tests, structured trace/evaluation workflow, graceful `partial` fallback | controlled Vertex live evaluation with retained artifact |

Passing repository checks proves the implementation contract, not a successful
deployment in a particular GCP project. Record a live item only from that
environment's immutable artifact; missing credentials, skipped workflows or an
unrun canary are `not_run`, never “passed”.

This document separates repeatable repository evidence from assurances that
require a real identity provider, cloud project, third-party tenant, or
research workload. It is a validation map, not a delivery plan.

## Evidence levels

- **Automated:** enforced by local hooks or CI and repeatable from the
  repository.
- **Environment-dependent:** implemented and testable, but conclusive evidence
  must come from the target external environment.
- **Manual:** requires an accountable human approval or operational exercise.

## Validation map

| Area | Automated repository evidence | Additional assurance required |
|---|---|---|
| API and data contracts | OpenAPI coverage, idempotency checks, forward-only migration validation, PostgreSQL integration tests, and tenant-isolation tests | Production database provisioning, least-privilege review, and restore exercise |
| Identity and authorization | OIDC/JWKS validation paths, role checks, project isolation, hashed service tokens, and negative HTTP tests | Target IdP login, claim mapping, revocation, and emergency-access review |
| Manifest and object ingestion | Schema, signature, trust fingerprint, deduplication, job lease/retry, payload checksum, and immutable-object tests | Target GCS lifecycle, retention, IAM, and large-payload validation |
| Lineage and reproducibility | Deterministic edge IDs, conflict handling, bounded findings, and R0–R4 policy tests | Representative research golden set and controlled rerun acceptance |
| Edge Collector and snapshots | Cross-platform CLI tests, atomic snapshots, resumable indexing, signed bundles, deterministic diff, resource limits, and benchmark gate | Representative storage and million-file workload exercise |
| Messy-project pipeline benchmark | Deterministic synthetic messy research directories (deadline-rush / postdoc-handoff / repro-baseline) exercising the real scan → snapshot → diff → audit chain: secret-skip accounting, retention roundtrip, move-candidate inference, diff shape, and R0–R4 ordering via `npm run benchmark:messy --workspace backend` (writes git-ignored `output/benchmark/`) | Representative real research workloads and human acceptance |
| GitHub and local Git | Read-only provider contracts, webhook signature/idempotency tests, bounded tree collection, and local-root isolation | GitHub App sandbox, enterprise-policy review, and installation revocation |
| Google Workspace | Preview/confirmation gates, Drive/Sheets/Gmail connector contracts, idempotency, and draft-only email policy | Workspace OAuth sandbox, consent review, revocation, and data-residency approval |
| Google ADK | Routed specialists, parallel evidence gathering, sequential synthesis, durable session isolation, real MCP discovery/calls, trace policy, and offline evaluation | Controlled live-model evidence, quota/budget alerts, and production model policy |
| Runtime and deployment | Container build, non-root runtime checks, Terraform validation, pinned workflow actions, migration job, readiness checks, and rollback workflow | Cloud deployment approval, immutable-digest promotion, rollback drill, and runtime registry evidence |
| Security and supply chain | Secret blocking, dependency audit policy, threat model, SBOM generation, checksum verification, container scan, and keyless-signature verification | Periodic permission review, incident exercise, and documented acceptance of remaining transitive risk |
| Operations and observability | Health/readiness endpoints, metrics, tracing hooks, bounded queues, graceful shutdown, backup/restore scripts, and runbook checks | Alert delivery test, recovery-time measurement, and on-call rehearsal |
| User experience | Browser E2E, accessibility checks, seeded workflow, and deterministic demo path | Representative user acceptance and accessibility review with assistive technology |

## Interpretation rules

- A green CI run proves only the automated column for the tested commit.
- A configured integration is not a successful external validation.
- A skipped live-model workflow is recorded as skipped, never as passed.
- R4 is valid only after a successful controlled rerun whose output hashes
  match the expected manifest.
- Manual or environment-dependent evidence should identify the commit,
  environment, actor, time, and immutable artifact or audit record.

## Canonical evidence

Use GitHub Actions logs and retained release/evaluation artifacts for a specific
commit. Operational evidence belongs in the approved immutable object store,
not in this document. Procedures are defined in the
[operations runbook](operations-runbook.md) and
[release guide](release-and-supply-chain.md).
