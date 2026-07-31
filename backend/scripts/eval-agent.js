import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuardianAgent, runGuardianAgent } from '../lib/agent.js';
import { classifyAgentError } from '../lib/agent-lifecycle-plugin.js';
import {
  aggregateEvaluationMetrics,
  detectSensitiveLeaks,
  estimateResultCost,
  evaluateAgentResult,
  evidenceIdsFromResult,
  suiteSummary,
  validateEvalSuite
} from '../lib/agent-eval.js';
import { createStore } from '../lib/store-factory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const allCases = JSON.parse(await readFile(path.resolve(here, '../evals/agent-cases.json'), 'utf8'));
const caseArgument = process.argv.find((item) => item.startsWith('--case='));
const selectedCase = caseArgument?.slice('--case='.length);
const outputArgument = process.argv.find((item) => item.startsWith('--output='));
const outputPath = outputArgument?.slice('--output='.length);
const cases = selectedCase ? allCases.filter((item) => item.id === selectedCase) : allCases;
if (!cases.length) throw new Error(`Unknown evaluation case: ${selectedCase}`);

const pricing = {
  model: process.env.LABLINEAGE_MODEL || 'gemini-2.5-flash',
  inputUsdPerMillion: Number(process.env.LABLINEAGE_AGENT_INPUT_USD_PER_MILLION || 0.30),
  outputUsdPerMillion: Number(process.env.LABLINEAGE_AGENT_OUTPUT_USD_PER_MILLION || 2.50),
  source: 'https://ai.google.dev/gemini-api/docs/pricing',
  overrideable: true
};

const store = await createStore();
try {
  const project = store.get().projects[0];
  if (!project) throw new Error('Agent evaluation requires at least one project');
  const agent = createGuardianAgent(store, project.id);
  const tools = agent.guardianToolNames;
  const suiteErrors = validateEvalSuite(allCases, tools);
  if (suiteErrors.length) throw new Error(`Invalid evaluation suite:\n${suiteErrors.join('\n')}`);
  if (!process.argv.includes('--live')) {
    const report = {
      schemaVersion: 'lablineage.agent-eval.v2',
      mode: 'static',
      generatedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA || null,
      suite: suiteSummary(allCases),
      selectedCases: cases.map((item) => item.id),
      tools,
      pricing,
      passed: true
    };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } else {
    const results = [];
    for (const testCase of cases) {
      const caseStartedAt = Date.now();
      try {
        const result = await runGuardianAgent(store, {
          projectId: project.id,
          userId: 'agent-evaluator',
          message: testCase.prompt,
          conversationId: `eval_${testCase.id}_${Date.now()}`
        });
        const failures = evaluateAgentResult(testCase, result);
        results.push({
          id: testCase.id,
          category: testCase.category,
          passed: failures.length === 0,
          failures,
          expectedRoute: testCase.expectedRoute,
          route: result.route,
          toolCalls: result.toolCalls,
          evidenceIds: evidenceIdsFromResult(result),
          sensitiveLeaks: detectSensitiveLeaks(result),
          traceId: result.traceId,
          lifecycle: result.lifecycle,
          usage: result.usage,
          durationMs: result.durationMs,
          estimatedCostUsd: estimateResultCost(result, pricing)
        });
      } catch (error) {
        results.push({
          id: testCase.id,
          category: testCase.category,
          passed: false,
          failures: [`execution error: ${error.agentErrorCategory || classifyAgentError(error)}`],
          expectedRoute: testCase.expectedRoute,
          route: null,
          toolCalls: [],
          evidenceIds: [],
          sensitiveLeaks: [],
          traceId: error.traceId || null,
          lifecycle: null,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          durationMs: Date.now() - caseStartedAt,
          estimatedCostUsd: 0,
          error: { category: error.agentErrorCategory || classifyAgentError(error), statusCode: error.statusCode || 500 }
        });
      }
    }
    const metrics = aggregateEvaluationMetrics(cases, results, pricing);
    const passed = results.every((item) => item.passed);
    const report = {
      schemaVersion: 'lablineage.agent-eval.v2',
      mode: 'live',
      generatedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA || null,
      model: pricing.model,
      suite: suiteSummary(cases),
      metrics,
      passed,
      results
    };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (!passed) process.exitCode = 1;
  }
} finally {
  if (typeof store.close === 'function') await store.close();
}
