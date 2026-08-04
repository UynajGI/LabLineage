# Reference study

This small deterministic study lets a new user exercise LabLineage without
providing a real research project. It reads a CSV and JSON parameter file, then
writes an SVG bar chart.

From this directory:

```sh
node analysis.mjs data/input.csv params.json results/chart.svg
```

From the repository root, capture the complete execution spine:

```sh
npm run collector -- init --project reference-study --root ./examples/reference-study
npm run collector -- run --project reference-study --root ./examples/reference-study --label baseline \
  -- node analysis.mjs data/input.csv params.json results/chart.svg
npm run collector -- run --project reference-study --root ./examples/reference-study \
  --expected SNAPSHOT_ID_FROM_PREVIOUS_COMMAND --label verified-rerun \
  -- node analysis.mjs data/input.csv params.json results/chart.svg
```

The resulting manifest should connect the input Dataset, parsed ParameterSet,
code, and captured Environment to one Run, then connect that Run to
`chart.svg`. The second command can reach R4 because it compares the rewritten
output with the first run's expected hash. Generated results and `.lablineage/`
are intentionally ignored by Git.
