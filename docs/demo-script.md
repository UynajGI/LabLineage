# Demo script

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
