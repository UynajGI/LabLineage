# Competition demo script

The console UI now defaults to Chinese with an EN/中文 toggle in the header;
UI names below carry both languages.

1. Run `npm install --ignore-scripts`, `npm run seed`, then `npm run dev`.
2. Open <http://localhost:5173> and show the seeded 相变研究（Phase Transition Study）project.
3. Open **Lineage Explorer（溯源图谱）**, select `fig3.png`, and show the recorded
   run, code, dataset, parameters, environment, and evidence identifiers.
4. Open **Guardian Agent（守护代理）** and ask:
   `fig3.png 是怎么生成的？当前能否复现？请区分事实、推断和缺失项，并列出 evidence_id。`
5. Expand the execution trace. Point out deterministic routing, parallel
   evidence retrieval, the bounded evidence-completion loop, read-only tool
   calls, lifecycle correlation, token usage, and elapsed time.
6. State the system boundary explicitly: **the model explains and interacts;
   deterministic services own facts, hashes, evidence, and R0–R4 levels.**
7. Show the retained `lablineage.agent-eval.v2` artifact for the same commit:
   route accuracy, tool-selection accuracy, evidence citation rate, sensitive
   leakage rate, P95 latency, tokens, and estimated cost.
8. Open **Directory Diff（目录差异）**, scan an allowed demo directory, change one
   file, scan again, and show that a move candidate is not presented as a fact.
8b. Open **Upload Center（上传中心）** and drag a project `.zip` in: the archive is
    extracted, scanned, and fingerprinted on the server (path-traversal entries
    are skipped), and the new snapshot diff shows up in **Directory Diff（目录差异）**.
    JSON manifests still follow the validated manifest import path.
8c. In **Guardian Agent（守护代理）**, ask the agent to analyze the uploaded project
    (`分析这个项目，生成谱系`): it lists the scanned files, infers a 代码→数据→输出
    candidate chain, and renders a JSON candidate block. Click
    **采纳为推断谱系（Adopt inferred lineage）** — the deterministic service
    validates the candidates against the snapshot and adds them as dashed
    inferred edges in **Lineage Explorer（溯源图谱）**, where an auditor can
    confirm them into facts via the existing review flow.
9. Trigger a reproducibility audit and show the R0–R4 breakdown. Emphasize that
   R4 requires a successful controlled rerun with matching output hashes.
10. Open **Handoff（交接工作区）**, generate a preview, and show that no email,
    upload, delete, or permission change occurs without an explicit
    confirmation path.
11. Show the Cloud Run deployment artifact for the same commit, including the
    immutable image, ready revision, health result, OIDC identity, and rollback
    status. Do not claim deployment if the artifact is missing or skipped.

The complete automated and human protocol is in
[Guardian Agent evaluation and usability protocol](agent-evaluation.md).
