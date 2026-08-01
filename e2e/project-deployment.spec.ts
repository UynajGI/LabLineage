import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const now = '2026-08-02T00:00:00.000Z';
const steps = ['ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize']
  .map((name, index) => ({
    id: `step-${index}`,
    runId: 'run-e2e',
    projectId: 'ignored-by-ui',
    name,
    status: name === 'agent_summary' ? 'skipped' : 'succeeded',
    attempt: 1,
    errorCode: null,
    errorSummary: null,
    startedAt: now,
    completedAt: now,
    artifactRefs: []
  }));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lablineage.locale', 'en'));
});

test('keeps project and source mutations unavailable to a viewer', async ({ page }) => {
  await page.route('**/v1/capabilities', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ actor: { subject: 'viewer-e2e', kind: 'user', roles: ['viewer'] }, capabilities: [] })
  }));
  await page.route('**/v1/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/#/deploy');
  await expect(page.getByText('Administrator permission required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create project and choose source' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Deploy Project' })).toBeVisible();
});

test('generates a project-scoped Local Collector pairing without requesting a ZIP', async ({ page }) => {
  await page.goto('/#/deploy');
  const suffix = `collector-${Date.now().toString(36)}`;
  const reset = page.getByRole('button', { name: 'Deploy another project' });
  if (await reset.count()) await reset.click();
  await page.getByLabel('Project name').fill(`Collector E2E ${suffix}`);
  await page.getByLabel('Project slug (optional)').fill(suffix);
  await page.getByLabel('Project objective').fill('Connect an authorized local directory without uploading source.');
  await page.getByLabel('Success criteria (one per line)').fill('Signed evidence reaches the analysis service.');
  await page.getByLabel('Key outputs (name | expected relative path, one per line)').fill('Signed manifest | .lablineage/snapshots');
  await page.getByRole('button', { name: 'Create project and choose source' }).click();
  await page.getByRole('button', { name: 'Generate pairing code' }).click();
  await expect(page.getByText('Raw file contents: disabled')).toBeVisible();
  await expect(page.getByText('Absolute local paths: disabled')).toBeVisible();
  const command = page.locator('pre code');
  await expect(command).toContainText(`--project "${suffix}"`);
  await expect(command).toContainText('--root "<local directory>"');
  await expect(page.getByRole('heading', { name: 'One-time ZIP fallback' })).toHaveCount(0);
});

test('creates a goal, presents local-first sources, and restores an automatic GitHub report', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  await page.goto('/#/deploy');
  await expect(page.getByRole('heading', { name: 'Deploy a project' })).toBeVisible();

  const suffix = Date.now().toString(36);
  await page.getByLabel('Project name').fill(`E2E onboarding ${suffix}`);
  await page.getByLabel('Project slug (optional)').fill(`e2e-${suffix}`);
  await page.getByLabel('Project objective').fill('Produce a traceable research report.');
  await page.getByLabel('Success criteria (one per line)').fill('Every output cites recorded evidence.');
  await page.getByLabel('Key outputs (name | expected relative path, one per line)').fill('Final report | reports/final.pdf');
  await page.getByRole('button', { name: 'Create project and choose source' }).click();

  await expect(page.getByRole('radio', { name: /Local directory/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Recommended. Source code stays local by default; a signed evidence bundle is sent outbound.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /ZIP fallback/ })).toBeVisible();

  const projectId = new URL(page.url()).hash.match(/project=([^&]+)/)?.[1];
  expect(projectId).toBeTruthy();

  const run = {
    id: 'run-e2e', projectId, intentVersionId: 'intent-e2e', intentVersion: 1,
    sourceId: 'source-e2e', sourceRevision: '0123456789abcdef', inputKind: 'github',
    inputSha256: 'a'.repeat(64), status: 'completed', currentStep: 'finalize', version: 8,
    attempts: 1, retryCount: 0, deterministicReady: true, queuedAt: now, createdAt: now,
    updatedAt: now, completedAt: now, steps, events: [],
    report: { id: 'report-e2e', overallStatus: 'supported', coverageScore: 100, createdAt: now }
  };
  const report = {
    id: 'report-e2e', runId: 'run-e2e', projectId, intentVersionId: 'intent-e2e',
    overallStatus: 'supported', coverageScore: 100, sha256: 'b'.repeat(64), createdAt: now,
    document: {
      schemaVersion: 'lablineage.objective-assessment.v1', intentVersionId: 'intent-e2e',
      intentVersion: 1, objective: 'Produce a traceable research report.', overallStatus: 'supported',
      coverageScore: 100,
      criterionResults: [{ id: 'criterion-1', kind: 'criterion', label: 'Every output cites recorded evidence.', required: true, sortOrder: 0, status: 'supported', evidenceIds: ['ev-e2e'], conflictIds: [], reason: 'Recorded evidence supports this criterion.' }],
      keyOutputResults: [{ id: 'output-1', kind: 'key_output', label: 'Final report', required: true, sortOrder: 0, status: 'supported', evidenceIds: ['ev-e2e'], conflictIds: [], reason: 'The expected output was found.' }],
      findingIds: [], audit: { id: 'audit-e2e', level: 'R2', score: 80 }, missingEvidence: [],
      conflicts: [], limitations: ['Evidence coverage does not establish scientific correctness.'],
      runId: 'run-e2e', projectId, sourceId: 'source-e2e', sourceRevision: '0123456789abcdef',
      agentExplanation: null, agentTraceId: null, model: null, agentStatus: 'unavailable', createdAt: now
    }
  };

  let retried = false;
  const failedRun = {
    ...run,
    status: 'failed',
    version: 4,
    deterministicReady: false,
    completedAt: undefined,
    report: null,
    steps: steps.map((step) => step.name === 'graph'
      ? { ...step, status: 'failed', errorCode: 'GRAPH_FIXTURE_FAILURE', errorSummary: 'Synthetic retry fixture.' }
      : { ...step, status: step.name === 'ingest' || step.name === 'scan' ? 'succeeded' : 'pending', completedAt: null })
  };

  await page.route('**/v1/projects/*/sources/github', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ sourceId: 'source-e2e', runId: 'run-e2e', statusUrl: `/v1/projects/${projectId}/analysis-runs/run-e2e`, idempotent: false }) }));
  await page.route('**/v1/projects/*/analysis-runs/run-e2e', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(retried ? run : failedRun) }));
  await page.route('**/v1/projects/*/analysis-runs/run-e2e/report', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) }));
  await page.route('**/v1/projects/*/analysis-runs/run-e2e/retry', (route) => {
    retried = true;
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ...run, status: 'queued', report: null }) });
  });

  await page.getByRole('radio', { name: /GitHub App/ }).click();
  await page.getByLabel('Repository URL or owner/repo').fill('example/read-only-fixture');
  await page.getByRole('button', { name: 'Connect and analyze' }).click();
  await expect(page.getByText('Synthetic retry fixture.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry failed stage' }).click();
  await expect(page.getByRole('heading', { name: 'Objective coverage report' })).toBeVisible();
  await expect(page.getByText('The deterministic report is complete, but the optional ADK explanation is unavailable.')).toBeVisible();
  await expect(page).toHaveURL(/#\/deploy\?project=.*&run=run-e2e/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Objective coverage report' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  expect(browserErrors).toEqual([]);
});
