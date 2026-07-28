import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  { link: 'Implementation Status', heading: 'Implementation Status', hash: '#/checklist' },
  { link: 'Dashboard', heading: /Project Overview:/, hash: '#/dashboard' },
  { link: 'Lineage Explorer', heading: 'Lineage Explorer', hash: '#/lineage' },
  { link: 'Directory Diff', heading: 'Non-Git Directory Tracking', hash: '#/snapshots' },
  { link: 'Audit Findings', heading: 'Audit Findings', hash: '#/findings' },
  { link: 'Guardian Agent', heading: 'Guardian Agent', hash: '#/agent' },
  { link: 'Workspace Handoff', heading: 'Workspace Handoff', hash: '#/handoff' },
  { link: 'Upload Center', heading: 'Upload Center', hash: '#/upload' },
  { link: 'System Setup', heading: 'System Setup', hash: '#/setup' },
  { link: 'Security & Audit', heading: 'Security & Audit', hash: '#/security' }
];

test('live console routes load without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto('/#/checklist');
  await expect(page.getByText(/LIVE API/)).toBeVisible();

  for (const route of routes) {
    await page.getByRole('link', { name: route.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route.hash.replace('/', '\\/').replace('#', '#')}$`));
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
  }

  expect(browserErrors).toEqual([]);
});

test('console routes have no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/#/checklist');
  await expect(page.getByText(/LIVE API/)).toBeVisible();
  const blocking: Array<{ route: string; id: string; impact: string | null; nodes: unknown[] }> = [];
  for (const route of routes) {
    await page.goto(`/${route.hash}`);
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    blocking.push(...results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        route: route.hash,
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes
      })));
  }
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
