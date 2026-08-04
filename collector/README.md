# LabLineage Edge Collector

The Node.js Edge Collector scans a local research workspace without uploading
file contents or raw paths. It produces signed, privacy-preserving manifests
that can be reviewed offline and uploaded to Guardian.

## Requirements and installation

- Node.js 22.15 or newer
- Read-only access to the directory being scanned

Install a verified release artifact:

```sh
npm install --global ./lablineage-edge-collector-0.3.0.tgz
lablineage
```

Running `lablineage` without a command prints the CLI usage.

## Project workflow

```sh
lablineage init --project phase-transition --root /srv/lab/phase-transition
lablineage scan --project phase-transition --root /srv/lab/phase-transition --out manifest.json
lablineage verify manifest.json
lablineage diff --project phase-transition --root /srv/lab/phase-transition --from SNAPSHOT_ID --to latest
lablineage run --project phase-transition --root /srv/lab/phase-transition --label fig3 -- python scripts/plot.py
lablineage export --project phase-transition --root /srv/lab/phase-transition --snapshot latest --output handoff-bundle.tar.zst
lablineage verify handoff-bundle.tar.zst
```

`init` creates signing material, a path salt, snapshots and a local SQLite
index under `<root>/.lablineage/`. Keep that directory private and backed up;
the Collector refuses to overwrite an existing identity.

Configure exclusions and evidence policy with a
`lablineage.policy.v1` YAML file and pass it to `scan` with `--policy`.

## Upload

Use `LABLINEAGE_SERVICE_TOKEN` to keep the service token out of shell history:

```sh
export LABLINEAGE_SERVICE_TOKEN='replace-with-service-token'
lablineage upload --bundle manifest.json --url https://guardian.example.org --source SOURCE_ID
lablineage upload --queue ./upload-queue --url https://guardian.example.org --source SOURCE_ID
```

The upload queue records completed bundle IDs atomically and resumes after
transient failures.

For policy examples, resource limits, key rotation, offline transfer,
troubleshooting and rollback, see the
[Collector guide](../docs/collector-guide.md). Verify release checksums and
Sigstore evidence using the
[release procedure](../docs/release-and-supply-chain.md) before installation.
