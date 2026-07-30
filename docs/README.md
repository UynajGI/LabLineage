# LabLineage Guardian documentation

This directory is the canonical maintained documentation set. Choose a path by
what you need to do; do not use historical planning files as operating
instructions.

## Start here

| Document | Audience | Use it for |
|---|---|---|
| [User guide](user-guide.md) | Researchers and reviewers | Daily lineage, audit, Guardian, snapshot, and handoff workflows |
| [Administrator guide](administrator-guide.md) | Operators and platform owners | Configuration, identity, storage, hooks, CI/CD, and launch checks |
| [Demo script](demo-script.md) | Presenters and judges | A short, repeatable product walkthrough |

## Understand and integrate

| Document | Audience | Use it for |
|---|---|---|
| [Architecture](architecture.md) | Engineers and security reviewers | Components, ADK orchestration, trust boundaries, and persistence |
| [API and data contracts](api-and-data-contracts.md) | API and database maintainers | Compatibility, idempotency, migrations, retention, and import contracts |
| [Edge Collector guide](collector-guide.md) | Research-infrastructure operators | Installation, scanning, signing, export, upload, and troubleshooting |
| [Snapshot tracking](snapshot-tracking.md) | Engineers and auditors | Non-Git snapshot, diff, move-candidate, and retention semantics |

## Operate and release

| Document | Audience | Use it for |
|---|---|---|
| [Operations runbook](operations-runbook.md) | On-call and platform teams | Deployment, health, backup, recovery, alerts, and incident response |
| [Release and supply chain](release-and-supply-chain.md) | Release engineers | SBOM, checksums, signing, promotion, rollback, and live-evaluation evidence |
| [Threat model](threat-model.md) | Security reviewers | Threats, controls, validation methods, and external assurance boundaries |
| [Dependency risk register](dependency-risk-register.md) | Maintainers and security reviewers | Accepted transitive risks, controls, and exit conditions |
| [Verification status](verification-status.md) | Maintainers, judges, and auditors | What repository automation proves and what requires an external environment |

## Documentation rules

- `README.md` is the project landing page; detailed procedures belong here.
- Each subject has one canonical document. Link to it instead of copying long
  procedures into another file.
- Prefer stable behavior and invariants over volatile counts, dates, or
  milestone commentary.
- Mark environment-dependent evidence explicitly. A defined workflow is not
  proof that a cloud deployment or third-party integration succeeded.
- Update documentation with the code, OpenAPI contract, migrations,
  environment examples, and tests that change the documented behavior.
- Keep credentials, raw research data, generated reports, local paths, and
  private planning notes out of the repository.
