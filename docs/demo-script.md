# Competition demo script

Target length: 6–8 minutes. Use a pre-authorized sandbox GitHub repository or a
Collector fixture with no private research data.

1. Open **Deploy Project** and state the boundary: local source stays on the
   workstation; Cloud Run receives signed, path-redacted evidence. ZIP is only a
   fallback.
2. Create a project with a concrete objective, two measurable success criteria,
   and two expected outputs. Point out that the intent is versioned.
3. Choose one source:
   - Local Collector: generate the short code, run the prepared `pair`/`sync`
     command, then show online status; or
   - GitHub: connect the sandbox repository through the read-only GitHub App and
     show the pinned commit SHA.
4. Show that connection automatically creates a durable run. Walk through real
   stages: ingest, scan, evidence graph, deterministic audit, objective
   assessment, then ADK summary. Refresh the page to demonstrate URL/run restore.
5. Open the report. For one criterion, follow its evidence IDs into the graph;
   show a missing item as `not_assessable`, not a fabricated pass.
6. Contrast the layers: deterministic services own hashes, evidence and R0–R4;
   Google ADK uses routed specialist agents and read-only tools to explain the
   result. Disable/omit the model in the prepared fallback to show the run becomes
   `partial` while the authoritative report remains available.
7. Show an inferred lineage edge and its human review boundary. A candidate is
   not a fact until reviewed.
8. Create a HandoffOrder to demonstrate that departing/receiver/reviewer/deadline
   belong to each order rather than global settings. Preview but do not execute
   external writes.
9. Close with the two deployment profiles: fully local, or Cloud Run + Cloud SQL
   + GCS + Cloud Tasks + Vertex AI while Collector stays local.

Before judging, capture the deployed commit SHA, image digest, readiness result,
Collector/GitHub canary result, report checksum and live ADK evaluation artifact.
If any external check was skipped, label it `not_run`.
