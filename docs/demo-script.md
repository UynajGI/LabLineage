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
首次演示前先完成[10 分钟体验](quickstart.md)，不要临场接入敏感目录。

1. Run `npm install --ignore-scripts`, copy `.env.example` to
   `backend/.env.local`, run `npm run seed`, then `npm run dev`.
2. Open <http://localhost:5173/#/checklist>, confirm the banner says
   **LIVE API / 真实后端数据**, and select the seeded Phase Transition project.
3. Open **Lineage Explorer** and select `fig3.png`. Explain the exact run, code,
   dataset, parameter, environment, and evidence IDs. Point out which
   relationships are confirmed and which are candidates.
4. Open **Audit Findings**, click **Run audit**, and explain the R0–R4
   breakdown. Emphasize that findings do not delete suspicious results and
   should not be resolved until their evidence is checked.
5. Open **Directory Diff**, scan an allowed disposable directory, change one
   file, scan again, and show the deterministic diff.
6. Open **Workspace Handoff**, review the Drive/Sheets/Gmail preview, and click
   **Create local preview**. Show the immutable export ID and file count.
   Explain that the server stores Markdown/CSV/EML objects internally, does not
   expose an absolute path, and sends no email.
7. Optional: if a model key is configured, open **Guardian Agent** and ask:
   `fig3.png 是怎么生成的？现在还能复现吗？请区分事实、推断和缺失证据，并列出 evidence_id。`
