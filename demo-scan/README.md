# Demo Scan Directory

Sample handover project used by the Cloud Run demo instance to exercise the
scan → snapshot → diff → audit pipeline. Judges scan `/app/demo-scan`.

The project is a LaTeX research paper prepared with the APS (American Physical
Society) sample template:

- `apssamp.tex` — main manuscript source
- `apssamp.pdf` — compiled paper
- `apssamp.bib` — bibliography
- `apstemplate.tex` — APS template overview
- `fig_1.eps`, `fig_2.eps` — figure files
- `vid_1a.eps`, `vid_1b.eps` — media placeholders

Note: per repository policy, secret-shaped files (`.env*`) are never committed;
secret-skip behaviour is exercised by the collector's own fixtures instead.
