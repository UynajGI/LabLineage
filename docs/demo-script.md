# Demo script

1. Run `npm install --ignore-scripts`, `npm run seed`, then `npm run dev`.
2. Open <http://localhost:5173> and show the seeded Phase Transition project.
3. Open **Lineage Graph** and select `fig3.png`. Explain the exact run, code,
   dataset, parameter, and environment evidence.
4. Open **Guardian Agent** and ask:
   `fig3.png 是怎么生成的？现在还能复现吗？请列出 evidence_id。`
5. Open **Snapshot Diff**, scan an allowed demo directory, change one file,
   scan again, and show the deterministic diff.
6. Trigger a reproducibility audit and show the R0–R4 breakdown. Emphasize that
   suspicious results are never deleted.
7. Open **Handoff**, generate a preview, and inspect the local Markdown, CSV,
   and unsent `.eml` files under `.lablineage/exports/`.

