# Cloud Run competition deployment

The public competition deployment uses the same formal `google_cloud` profile
as production; it is not an in-memory exception. The application runs on Cloud
Run with Cloud SQL PostgreSQL, immutable GCS objects, Cloud Tasks OIDC dispatch,
OIDC application auth, and Vertex AI through ADC. Local Collector stays on the
presenter's computer.

## Provision once

1. Configure a dedicated GCP project, billing budget/alerts, DNS/OIDC callback,
   and a protected GitHub `staging` environment.
2. Copy `frontend/deploy/terraform/terraform.tfvars.example` to ignored
   `terraform.tfvars`. Use an immutable image digest and a stable worker URL.
3. Keep Terraform state in an encrypted remote backend. Apply the module and run
   the emitted provisioning job command.
4. Add the GitHub App private-key version to the Terraform-created Secret
   Manager container out of band. Do not put private keys or model keys in Git,
   tfvars, workflow inputs, terminal history, screenshots, or deployment output.
5. Install the GitHub App only on a dedicated read-only fixture repository.

## Deploy a commit

Run the protected **Deploy** workflow. It builds the exact commit, runs the
forward-only migration job, updates Cloud Run, verifies readiness and executes
the required signed-Collector and read-only GitHub analysis canaries. Configure
`STAGING_CANARY_BEARER_TOKEN` and `STAGING_CANARY_GITHUB_REPOSITORY` in the
protected environment. Missing configuration or either path failing restores
the previous image; migrations are never rolled back in place.

The deployment evidence artifact must contain environment, commit, image digest,
Cloud Run revision, readiness, canary terminal state and report checksum. It must
contain only hashes of identity-bearing URLs/IDs and no tokens or payloads.

## Judge journey

1. Sign in through the configured OIDC provider and open `#/deploy`.
2. Create an isolated demo project and goal.
3. Pair the laptop Collector or connect the sandbox GitHub App repository.
4. Observe the automatically started analysis to a terminal state and open the
   objective report. The source SHA/path tokens and evidence IDs must be visible;
   internal object keys and absolute paths must not be visible.
5. Show the ADK summary as a separate advisory section. If Vertex is unavailable,
   explain the honest `partial` state and continue with the deterministic report.

## Cost and cleanup

Set minimum Cloud Run instances to zero unless demo latency requires otherwise;
Cloud SQL is the dominant idle cost. After the event, revoke demo Collector
pairings and the GitHub App installation, remove secret versions, retain approved
audit/release evidence, and destroy infrastructure only after database/object
retention review. Never delete a bucket or database merely to make a failed demo
look clean.
