# Release and supply-chain procedure

LabLineage Guardian treats the container image, Collector package, SBOM, and
checksums as one release evidence set. The main-branch CI job creates and signs
that set only after tests, cross-platform Collector checks, and Terraform
validation succeed.

## Produced evidence

The `lablineage-release-evidence-<commit>` GitHub Actions artifact contains:

- `lablineage-guardian.cdx.json`: CycloneDX SBOM for the production image.
- `lablineage-edge-collector-<version>.tgz`: installable Collector package.
- `SHA256SUMS`: SHA-256 digests for the SBOM and Collector package.
- `SHA256SUMS.sigstore.json`: Sigstore bundle containing the keyless signature,
  certificate, transparency-log evidence, and verification material.

The artifact is retained for 90 days. A long-lived release must copy the exact
evidence set to the organization's immutable release archive before that period
expires.

## Trust and verification

CI dependencies are pinned to full Git commit identifiers. The signing job has
only `contents: read` and `id-token: write`; it uses GitHub's OIDC identity
instead of a stored signing key. CI immediately verifies the signature against
the expected repository workflow identity and GitHub Actions OIDC issuer.

After downloading and extracting an evidence artifact:

```sh
node scripts/verify-release-evidence.mjs ./artifacts
cosign verify-blob \
  --bundle ./artifacts/SHA256SUMS.sigstore.json \
  --certificate-identity \
    "https://github.com/OWNER/REPOSITORY/.github/workflows/ci.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ./artifacts/SHA256SUMS
```

Both commands must pass before installation or deployment. The first command
also rejects path traversal, missing packages, malformed checksums, and
non-CycloneDX SBOM documents.

## Collector installation and rollback

Install the package whose digest appears in the verified `SHA256SUMS`:

```sh
npm install --global ./artifacts/lablineage-edge-collector-<version>.tgz
lablineage --help
```

Rollback uses the same process with the previous release's complete, verified
evidence set. Never mix a package, checksum file, or Sigstore bundle from
different commits.

## Image promotion

The CI artifact identifies a tested commit but does not by itself authorize a
production deployment. Promotion must:

1. rebuild or pull the image for that exact commit;
2. confirm its digest against the deployment record;
3. attach the verified SBOM/evidence artifact;
4. obtain the environment's manual approval;
5. deploy by immutable digest, then execute readiness and rollback checks from
   `docs/operations-runbook.md`.

The protected `Deploy` workflow publishes the exact commit image to the
Terraform-managed Artifact Registry using GitHub OIDC, updates the migration
job, deploys Cloud Run, probes readiness, and rolls back to the previous image
on failure. Automatic staging runs only when `ENABLE_STAGING_DEPLOY=true`;
production is manual and subject to GitHub environment approval. Cloud project
names and identities remain environment variables, never repository secrets.

## Local Git gates

`node scripts/install-git-hooks.mjs` enables four standard hooks:

- `pre-commit` scans staged files for credentials/private state and runs
  change-scoped contract, type, or Collector checks.
- `commit-msg` enforces Conventional Commits.
- `pre-push` runs the complete test/build/evaluation/contract/performance and
  browser accessibility suite.
- `post-commit` records a checksum-protected receipt under `.git/`.
