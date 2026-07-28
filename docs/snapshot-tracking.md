# Non-Git snapshot and change tracking

## Snapshot semantics

A snapshot is an immutable observation of one directory at one capture time.
The first snapshot is the baseline and is marked `baseline: true`.
`historyCoverage: observed_from_capture` means Guardian makes no factual claim
about changes before that point.

Every snapshot records a stable directory root hash over sorted path tokens,
content fingerprints, and sizes. Repeating a scan over the same directory state
therefore yields the same root hash even though the observation identifier and
timestamp are new.

## Change evidence

Adjacent snapshots produce deterministic change identifiers and evidence that
names both snapshot IDs:

- `added`, `modified`, and `deleted` are direct observations.
- A one-to-one deleted/added pair with the same hash and size is a `moved`
  change whose `inference.kind` is `move_candidate`. It is explicitly inferred,
  not represented as a confirmed fact.
- An added file matching content that still exists is marked
  `copy_candidate`; it is not mislabeled as a move.

Every binary change exposes old/new hashes, sizes, modified times, media type,
and fingerprint strength. Files above the full-hash limit remain visible using
a recorded first/middle/last sampled fingerprint instead of disappearing from
the snapshot.

## Authorized text and code diff

Raw text capture is off by default. A user must select the authorization
checkbox in the snapshot UI, which sends both `includeTextDiff: true` and the
`ALLOW_TEXT_DIFF` confirmation. Production additionally requires:

```env
LABLINEAGE_ALLOW_TEXT_DIFF=true
```

Only known text/code extensions up to 256 KiB are eligible. Secret-shaped
assignments and common token forms are redacted before storage. Unified diff is
bounded to 400 lines per side and 64 KiB output. The API returns a reason such
as `text_capture_disabled`, `line_limit_exceeded`, or
`binary_or_unsupported` when no diff is emitted.

Text snapshots are internal evidence and are never returned by snapshot-list
operations. Deployments handling regulated data should keep text capture
disabled unless the project policy and data owner explicitly permit it.

## Retention without audit-chain loss

`LABLINEAGE_SNAPSHOT_HOT_COUNT` controls the number of fully expanded recent
indexes retained per project (default 20, minimum 2). Older indexes are
compressed with gzip and stored with:

- the uncompressed SHA-256 checksum;
- original and compressed byte counts;
- the immutable snapshot metadata and directory root hash.

Materialization verifies the checksum before parsing. Snapshot list APIs expose
only compression metadata, never the compressed payload. Historical diff APIs
transparently materialize cold indexes, so compression does not erase the audit
chain or convert historical evidence into an unsupported fact.

Backups and organization-level deletion rules remain governed by
`docs/operations-runbook.md`; retention compression is not an authorization to
delete audit evidence.
