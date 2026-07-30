import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuardianAgent, runGuardianAgent } from '../lib/agent.js';
import { evaluateAgentResult, validateEvalSuite } from '../lib/agent-eval.js';
import { createStore } from '../lib/store-factory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const allCases = JSON.parse(await readFile(path.resolve(here, '../evals/agent-cases.json'), 'utf8'));
const caseArgument = process.argv.find((item) => item.startsWith('--case='));
const selectedCase = caseArgument?.slice('--case='.length);
const outputArgument = process.argv.find((item) => item.startsWith('--output='));
const outputPath = outputArgument?.slice('--output='.length);
const cases = selectedCase ? allCases.filter((item) => item.id === selectedCase) : allCases;
if (!cases.length) throw new Error(`Unknown evaluation case: ${selectedCase}`);
const store = await createStore();
try {
  const project = store.get().projects[0];
  if (!project) throw new Error('Agent evaluation requires at least one project');
  const agent = createGuardianAgent(store, project.id);
  const tools = agent.guardianToolNames;
  const suiteErrors = validateEvalSuite(cases, tools);
  if (suiteErrors.length) throw new Error(`Invalid evaluation suite:\n${suiteErrors.join('\n')}`);
  if (!process.argv.includes('--live')) {
    const report = {
      schemaVersion: 'lablineage.agent-eval.v1',
      mode: 'static',
      generatedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA || null,
      cases: cases.length,
      tools,
      passed: true
    };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 0;
  } else {
    const results = [];
    for (const testCase of cases) {
      const result = await runGuardianAgent(store, {
        projectId: project.id,
        userId: 'agent-evaluator',
        message: testCase.prompt,
        conversationId: `eval_${testCase.id}_${Date.now()}`
      });
      const failures = evaluateAgentResult(testCase, result);
      results.push({
        id: testCase.id,
        passed: failures.length === 0,
        failures,
        toolCalls: result.toolCalls,
        route: result.route,
        trace: result.trace,
        usage: result.usage,
        durationMs: result.durationMs
      });
    }
    const passed = results.every((item) => item.passed);
    const report = {
      schemaVersion: 'lablineage.agent-eval.v1',
      mode: 'live',
      generatedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA || null,
      model: process.env.LABLINEAGE_MODEL || 'gemini-2.5-flash',
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
