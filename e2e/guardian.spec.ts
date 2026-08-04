import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  { link: 'Implementation Status', heading: 'Implementation Status', hash: '#/checklist' },
  { link: 'Dashboard', heading: /Project Overview:/, hash: '#/dashboard' },
  { link: 'Lineage Explorer', heading: 'Lineage Explorer', hash: '#/lineage' },
  { link: 'Directory Diff', heading: 'Non-Git Directory Tracking', hash: '#/snapshots' },
  { link: 'Audit Findings', heading: 'Audit Findings', hash: '#/findings' },
  { link: 'Guardian Agent', heading: 'Guardian Agent', hash: '#/agent' },
  { link: 'Workspace Handoff', heading: 'Handoff Orders', hash: '#/handoff' },
  { link: 'Deploy Project', heading: 'Deploy a project', hash: '#/deploy' },
  { link: 'Manifest Import', heading: 'Manifest Import', hash: '#/upload' },
  { link: 'System Setup', heading: 'System Setup', hash: '#/setup' },
  { link: 'Security & Audit', heading: 'Security & Audit', hash: '#/security' }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lablineage.locale', 'en'));
});

test('live console routes load without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  await page.goto('/#/checklist');
  await expect(page.getByRole('heading', { name: 'Implementation Status' }).first()).toBeVisible();

  for (const route of routes) {
    await page.getByRole('link', { name: route.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route.hash.replace('/', '\\/')}(?:\\?|$)`));
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
  }

  expect(browserErrors).toEqual([]);
});

test('console routes have no serious or critical accessibility violations', async ({ page }) => {
  const blocking: Array<{ route: string; id: string; impact: string | null; nodes: unknown[] }> = [];
  for (const route of routes) {
    await page.goto(`/${route.hash}`);
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    blocking.push(...results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({ route: route.hash, id: violation.id, impact: violation.impact, nodes: violation.nodes })));
  }
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});

test('new user can inspect a result and its relationship evidence without clicking a graph line', async ({ page }) => {
  await page.goto('/#/lineage');
  await page.getByText('fig3.png', { exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Node Details' })).toBeVisible();
  await expect(page.getByText('Connected relationships', { exact: true })).toBeVisible();

  await page.getByRole('button', {
    name: 'Open generated relationship with plot_phase.py #019',
    exact: true
  }).click();

  await expect(page.getByRole('heading', { name: 'Relation Evidence' })).toBeVisible();
  await expect(page.getByText('Relation: generated', { exact: true })).toBeVisible();
  await expect(page.getByText('From: run_plot_019', { exact: true })).toBeVisible();
  await expect(page.getByText('To: figure_3', { exact: true })).toBeVisible();
  await expect(page.getByText('ev_figure_hash', { exact: true })).toBeVisible();
});

test('operator can import a manifest through the Upload Center', async ({ page }) => {
  const bundleId = `playwright-${Date.now()}`;
  await page.goto('/#/upload');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      schema_version: 'lablineage.manifest.v1',
      bundle_id: bundleId,
      project_key: 'phase-transition',
      captured_at: new Date().toISOString(),
      records: []
    }))
  });
  await page.getByRole('button', { name: 'Import Manifest' }).click();
  await expect(page.getByText(new RegExp(`Imported 0 nodes, 0 edges and 0 evidence records from ${bundleId}`))).toBeVisible();
});

test('operator confirmation resolves a finding and records the UI transition', async ({ page }) => {
  await page.goto('/#/findings');
  await page.getByRole('button', { name: 'Run audit' }).click();
  await expect(page.getByRole('button', { name: 'Run audit' })).toBeEnabled();
  const resolveButtons = page.getByRole('button', { name: 'Resolve' });
  const before = await resolveButtons.count();
  expect(before).toBeGreaterThan(0);
  page.once('dialog', (dialog) => dialog.accept());
  await resolveButtons.first().click();
  await expect(resolveButtons).toHaveCount(before - 1);
});

test('local handoff preview returns an immutable export identifier without sending', async ({ page }) => {
  await page.goto('/#/handoff');
  await page.getByRole('button', { name: 'Create local preview' }).click();
  await expect(page.getByRole('status')).toContainText(
    /Immutable local preview export_[a-f0-9-]+ created with 3 files\./
  );
});
