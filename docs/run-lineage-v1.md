# Run lineage v1 technical design

Status: implemented baseline

## Problem

A useful result must answer one bounded question:

> Which observed execution produced this result, using which code, inputs,
> parameters, and environment, and what evidence supports every relationship?

The collector already inventories those entities, but an inventory is not a
lineage graph. Unconnected entities must never be combined to claim that a
result is reproducible.

## Scope

Version 1 builds a result-centred execution spine for commands launched through
`lablineage run`:

```text
CodeVersion ───────┐
Dataset ───────────┤
ParameterSet ──────┼──> Run ──> Figure / Dataset
Environment ───────┘
```

Every edge has an evidence ID and a confidence label. The manifest continues to
export opaque entity IDs and path tokens, never absolute or raw relative paths.

This version does not claim to recover arbitrary shell pipelines, dynamic file
access, notebook state, imported modules, container contents, or scientific
conclusions. Those remain explicit future work.

## Evidence contract

| Relationship | Source | Target | Evidence rule | Confidence |
|---|---|---|---|---|
| `executed_code` | code asset or Git CodeVersion | Run | command argument resolves to the collected code asset; current Git version was observed with the run | `exact` |
| `used_input` | Dataset | Run | explicit command argument, or a static `reads_from` edge from the executed code | `exact` for explicit, `strong` for static |
| `used_parameter_set` | ParameterSet | Run | its source config is an explicit command argument, or statically read by executed code | `exact` or `strong` |
| `captured_environment` | Environment | Run | runtime environment record was captured in the post-run snapshot | `exact` |
| `generated` | Run | changed asset | before/after content hash changed during the controlled run | `exact` |

An argument is eligible only when its normalized path stays inside the scan
root and its deterministic asset ID exists in the post-run manifest. Secret
arguments remain redacted. Output arguments that changed during the run are not
also classified as inputs.

## Result-scoped reproducibility

The audit scores each Figure from its own connected execution spine. It does not
borrow evidence from another result or from disconnected inventory nodes.

The audit returns a `resultScores` entry for every Figure. For each Figure it
uses the best evidenced generating Run, while the project-level summary uses
the lowest-scoring Figure so one good result cannot hide an orphan or
unreproducible result. It returns `resultId` so the summary scope is explicit;
ties are resolved by stable entity ID. A project with no Figure has no result
spine and therefore scores R0.

R4 still requires a controlled rerun, exit code zero, an exact `generated`
edge with evidence, and a matching expected/observed output hash.

## Reference study

`examples/reference-study` is a deterministic, dependency-free experiment:

- a CSV is the input Dataset;
- a JSON file is the ParameterSet source;
- a Node script is the executed CodeVersion;
- the controlled runtime is the Environment;
- an SVG chart is the result.

The collector test runs the study in a temporary directory and compares its
graph contract with
`collector/test/fixtures/reference-study.golden.json`. The golden file is test
oracle data, not an input visible to the scanned study.

## Acceptance criteria

1. A controlled run connects code, input, parameter set, environment, and every
   changed output to the same Run.
2. Every connection contains at least one evidence ID.
3. No exported record contains the scan root.
4. Disconnected entities cannot increase a Figure's reproducibility score.
5. The reference study produces the expected relationships and qualifies for
   R4 only when its output hash matches the expected baseline.
6. Existing signed-manifest, redaction, resource-control, and R4 invariants
   remain intact.

## Next versions

- v1.1: record dependency lockfiles and distinguish runtime capture from a
  complete environment lock.
- v1.2: instrument Python and notebook file access to replace static inference
  with observed reads/writes.
- v1.3: group repeated notebook cells and abandoned outputs into experiment
  attempts.
- v1.4: connect figures and tables to machine-readable claims, with human
  confirmation for scientific meaning.
