# LabLineage Guardian contributor rules

## Runtime and commands

- Use Node.js 22.15 or newer; CI uses 22.22.0.
- Install with `npm install --ignore-scripts`.
- Start both services with `npm run dev`; API is `127.0.0.1:8788`, Vite is
  `127.0.0.1:5173`.
- Install repository hooks with `node scripts/install-git-hooks.mjs`.
- Before handoff, run `node scripts/git-hooks.mjs full`. A real push also runs
  Playwright E2E/Axe through `pre-push`.
- Benchmark the scan/snapshot/diff/audit pipeline on synthetic messy projects
  with `npm run benchmark:messy --workspace backend`; it writes the git-ignored
  `output/benchmark/` report and never touches repository state.

## Security boundaries

- Never commit `.env*` except `.env.example`, `.lablineage/`, Terraform state,
  test output, private keys, tokens, raw research data, or generated reports.
- Never repeat credentials in logs, tests, documentation, commits, or responses.
- Production requires PostgreSQL, OIDC, signed Manifest trust and GCS unless an
  explicit documented exception is enabled.
- R4 reproducibility is produced only by a successful controlled rerun with
  matching output hashes.
- Agent tools remain read-only. External or state-changing operations require a
  preview, explicit confirmation, idempotency and an audit record.
- Do not export absolute research paths. Local Git paths must remain within
  `LABLINEAGE_LOCAL_GIT_ROOTS` and evidence stores path tokens only.

## Data and API invariants

- Every `/v1` write route uses the durable idempotency middleware and declares
  `Idempotency-Key` in OpenAPI.
- Every tenant table uses `ENABLE RLS`, `FORCE RLS` and a tenant policy.
- Migrations are forward-only, consecutively numbered and immutable after use.
- Facts, inferences, conflicts and missing evidence must stay distinguishable;
  a move candidate is not a confirmed move.
- New large payloads and generated reports belong in immutable object storage,
  not PostgreSQL JSON state.

## Change checklist

- Update OpenAPI, migrations/projection, tests, environment examples and the
  affected architecture/API/runbook/user documentation together.
- Keep third-party GitHub Actions pinned to full 40-character commit SHAs.
- Use Conventional Commits.
- Preserve unrelated user work and never stage local credentials or generated
  state.
- Console UI strings go through `t()` in `frontend/i18n.tsx` (default zh, with
  the EN/中文 toggle); do not hardcode new user-facing English labels.
