# LabLineage Edge Collector

The LabLineage Edge Collector scans a local research workspace without
uploading file contents or raw paths. It produces signed, privacy-preserving
manifests that can be reviewed offline and then uploaded to Guardian.

## Requirements

- Node.js 22.15 or newer
- A LabLineage Guardian source identifier and API URL for uploads

## Install from a release artifact

```sh
npm install --global ./lablineage-edge-collector-0.3.0.tgz
lablineage --help
```

## Project workflow

```sh
lablineage init
lablineage scan
lablineage diff
lablineage run -- your-command --and-arguments
lablineage export --output snapshot.tar.zst
lablineage verify snapshot.tar.zst
lablineage upload snapshot.tar.zst \
  --api-url https://guardian.example.org \
  --source SOURCE_ID \
  --token-file ./collector-token.txt
```

`init` creates local signing material under `.lablineage/`. Keep that
directory private and backed up. The collector refuses to overwrite an
existing identity. Configure exclusions and evidence policy in
`.lablineage/policy.yaml`.

For policy examples, key rotation, offline transfer, troubleshooting, and
upgrade/rollback procedures, see the Guardian administrator's
`docs/collector-guide.md`.
