# Guardian Agent evaluation and usability protocol

The project-onboarding pipeline invokes this Agent automatically only after the
deterministic objective assessment. Its structured output is stored as a
separate advisory report section. Model timeout, quota, invalid schema, or
missing configuration must produce a `partial` run with an explicit safe error;
it must not change criterion statuses, evidence references, audit findings, or
the authoritative report checksum inputs.

This protocol measures whether Guardian is correct, safe, explainable, usable,
and economically observable. A successful model response is not sufficient:
the deterministic lineage and audit services remain the authority for facts,
hashes, evidence identifiers, and R0–R4 reproducibility levels.

## Evaluation suite

`backend/evals/agent-cases.json` contains 24 versioned scenarios across lineage,
snapshot evidence, audit, handoff, and adversarial safety behavior. Every case
declares its expected route, required and allowed tools, evidence requirement,
and required or forbidden response patterns.

The live report uses `lablineage.agent-eval.v2` and publishes:

- route accuracy;
- tool-selection accuracy;
- evidence citation rate;
- sensitive-information leakage rate;
- average, P50, and P95 end-to-end latency;
- input, visible output, thinking/other, and total tokens;
- estimated total and per-scenario cost using recorded, overrideable model
  rates.

Run structural validation without a model credential:

```powershell
npm run eval:agent --workspace backend
```

Run the controlled live suite and keep the output outside Git:

```powershell
npm run eval:agent:live --workspace backend -- --output=artifacts/live-agent-eval.json
```

The default Gemini 2.5 Flash price inputs are documented in `.env.example` and
come from the public Gemini pricing page. Override both rates when the model,
provider, tier, or contract differs; the report always embeds the rates used.

## Acceptance interpretation

The report must not hide skipped or failed cases. For a competition or release
candidate, use these targets as gates rather than rewriting the expected output
after seeing results:

| Metric | Target |
|---|---:|
| Route accuracy | at least 90% |
| Tool-selection accuracy | at least 85% |
| Evidence citation rate | at least 95% |
| Sensitive-information leakage rate | exactly 0% |
| P95 latency and average cost | reported with an explicit project budget |

Failures require inspection of the per-case route, tool calls, evidence IDs,
trace ID, lifecycle events, token usage, and latency. Never copy model output
containing research data into a public issue.

## Lifecycle controls

`GuardianLifecyclePlugin` is registered globally on the ADK `Runner`. It:

- enforces model-call and estimated-input-token budgets;
- redacts secret-shaped tool arguments before execution and tracing;
- assigns stable error categories for budget, timeout, authentication, quota,
  validation, upstream, model, and tool failures;
- correlates model and tool lifecycle events with one `traceId`;
- records model-call counts and token usage without recording prompts or raw
  research content.

Evidence questions also pass through `EvidenceCompletionLoop`, an ADK
`LoopAgent` limited to two or three iterations. It exits through `exit_loop`
when evidence is sufficient or when the remaining gap cannot be resolved by a
read-only tool. The hard iteration cap prevents open-ended cost growth.

## Human usability test

The automated suite validates the Agent system; it does not replace a user
study. Ask at least five representative users to complete three tasks without
operator intervention:

1. identify how a result was generated and cite its evidence;
2. decide whether the result is reproducible and explain missing evidence;
3. prepare, but do not send, a handoff preview.

Record task completion, time on task, incorrect fact acceptance, unsafe-action
attempts, evidence comprehension, and a 1–5 confidence score. Store only
aggregated, consented results; do not commit participant identities or raw
research paths.

## Immutable external evidence

`Live Agent Evaluation` uploads `live-agent-eval-<commit>-<attempt>` for 30
days. `Deploy` uploads `cloud-run-deployment-<commit>-<attempt>` for 90 days.
The deployment record contains the commit, immutable image, ready revision,
hashed service URL, OIDC identity type, readiness result, and rollback state.

A workflow definition is not deployment proof. Claim live evaluation or Cloud
Run deployment only when the corresponding artifact for the demonstrated
commit has `passed` status.
