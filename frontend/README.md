# LabLineage Guardian web console

This workspace contains the React 19 and Vite 8 console for LabLineage
Guardian. It visualizes live API data; it does not contain a mock fallback or
authoritative lineage logic.

## Start the full development workspace

From the repository root:

```bash
npm install --ignore-scripts
cp .env.example backend/.env.local
npm run seed
npm run dev
```

Open <http://localhost:5173/#/checklist>. The API health endpoint is
<http://127.0.0.1:8788/api/health>.

To run only the web workspace, start the API first and then run:

```bash
npm run dev --workspace frontend
```

## Main user flows

- **Lineage Explorer**: inspect nodes, connected relationships, confidence and
  evidence IDs.
- **Directory Diff**: compare authorized non-Git snapshots.
- **Audit Findings**: run deterministic audits and record reviewed resolutions.
- **Workspace Handoff**: preview reports and create immutable local exports
  without sending email.
- **Guardian Agent**: optionally explain evidence through read-only tools when
  a model is configured.

Writes remain subject to the API's role, confirmation, idempotency and audit
controls. R4 can only come from a successful controlled rerun with matching
output hashes.

## Verification

From the repository root:

```bash
npm run typecheck --workspace frontend
npm run build --workspace frontend
npm run test:e2e
```

New users should start with the
[10-minute walkthrough](../docs/quickstart.md). Architecture, deployment and
operations are documented in the repository
[documentation entry point](../docs/start-here.md).
