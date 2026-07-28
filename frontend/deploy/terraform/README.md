# Google Cloud deployment

This module creates a private-by-default Cloud Run v2 service, a separate
provisioning job, PostgreSQL 17 Cloud SQL with HA/backups/PITR, least-privilege
runtime and migration identities, Secret Manager entries, and a versioned
evidence/report bucket. The runtime receives separate object-creator and
object-viewer roles; it is not granted object deletion. Objects have a 30-day
retention policy and a configurable lifecycle deletion age (365 days by
default).

1. Copy `terraform.tfvars.example` to an untracked `terraform.tfvars`.
2. Use an immutable image digest and a real OIDC client configured for PKCE.
3. Store Terraform state in an encrypted, access-controlled remote backend; the
   state contains generated database credentials.
4. Run `terraform init`, `terraform plan -out plan.tfplan`, review it, then
   `terraform apply plan.tfplan`.
5. Execute the output `post_apply_command`. The job applies migrations,
   provisions the configured tenant UUID, and grants only DML privileges to the
   runtime database role.
6. Add versions to the empty GitHub/Workspace secrets only when those
   integrations are approved. Never put those values in `tfvars`.
7. Run the API, RLS, OIDC, signed Manifest, rollback, and restore checks from the
   operations runbook before admitting pilot users.

For direct browser PKCE, the static shell and callback must be reachable before
the browser owns a token, so the example uses `allUsers` at the Cloud Run layer.
All `/v1` routes still validate OIDC Bearer tokens and project roles. If policy
forbids public invocation, keep `invoker_members` empty and put the service
behind an approved IAP/authenticated-proxy design; a plain group binding on a
private `run.app` URL is not a browser login experience.
The Cloud Run service is configured with `LABLINEAGE_OBJECT_STORE=gcs`,
`LABLINEAGE_GCS_BUCKET`, and `GOOGLE_CLOUD_PROJECT`. Handoff reports use
generation-match preconditions so an existing object key can never be silently
overwritten. Set `object_lifecycle_days` to the approved evidence retention
period; it may not be shorter than the bucket's 30-day retention policy.

## GitHub OIDC deployment

Set `enable_github_deploy = true` and the exact `github_repository`. Terraform
then creates a Docker Artifact Registry repository, a GitHub Workload Identity
Pool/provider, and a deployment service account. Trust is restricted by the
GitHub `repository` OIDC claim; no long-lived cloud key is stored in GitHub.
The deployer can write only to this Artifact Registry repository, administer
Cloud Run, and act as the existing runtime and migration identities.

Map these outputs and resource names into protected GitHub environments:

- `github_workload_identity_provider` → `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `github_deploy_service_account` → `GCP_DEPLOY_SERVICE_ACCOUNT`
- `artifact_repository` → `GAR_REPOSITORY`
- project, region, service and provision job → `GCP_PROJECT_ID`,
  `GCP_REGION`, `CLOUD_RUN_SERVICE`, and `MIGRATION_JOB`

The `Deploy` workflow updates the migration job to the exact commit image,
executes it, updates Cloud Run, probes `/api/ready`, and restores the previous
image automatically if readiness does not succeed. Production remains a
manual, protected-environment deployment.
