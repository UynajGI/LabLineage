# LabLineage Guardian

LabLineage Guardian is a scientific research lineage, reproducibility, and handoff audit system designed for the Gemini Enterprise Agent Platform.

## Core Principles
1. **Data stays on-premise:** Raw scientific data remains on the lab servers. Only metadata, hashes, and redacted excerpts are sent to the cloud.
2. **Evidence over inference:** The system distinguishes between exact deterministic matches (hashes, Git diffs) and LLM-inferred relationships.
3. **No automatic destructive actions:** The system will not delete files, send emails, or modify permissions without explicit human confirmation.

## Architecture
- **Edge Collector:** A Python CLI that runs on lab servers to scan directories, compute hashes, and generate a signed `handoff-bundle.tar.zst`.
- **Cloud Control Plane:** Google Cloud Run services that ingest the bundle, verify signatures, and store metadata in Cloud SQL.
- **Guardian Agent:** A Gemini 2.5 Flash powered agent that analyzes the lineage graph, identifies conflicts, and suggests remediation steps.
- **Workspace Adapter:** Integrates with Google Drive (for reports), Sheets (for handoff ledgers), and Gmail (for drafting notification emails).

## Getting Started
1. Review the `README_DEPLOY.md` for infrastructure setup instructions.
2. Run the Setup Wizard in the Web UI to configure your organization, GCP project, GitHub App, and Workspace integrations.
3. Deploy the Edge Collector to your lab server and upload the generated bundle via the Upload Center.

## Security
All secrets must be stored in Google Secret Manager. The application uses Application Default Credentials and Service Accounts with least-privilege IAM roles. See `SECURITY.md` (to be created) for more details.
