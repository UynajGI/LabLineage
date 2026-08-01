import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  { link: '实现状态', heading: '实现状态', hash: '#/checklist' },
  { link: '仪表盘', heading: /项目概览：/, hash: '#/dashboard' },
  { link: '溯源图谱', heading: '溯源图谱', hash: '#/lineage' },
  { link: '目录差异', heading: '非 Git 目录追踪', hash: '#/snapshots' },
  { link: '审计发现', heading: '审计发现', hash: '#/findings' },
  { link: '守护代理', heading: '守护代理', hash: '#/agent' },
  { link: '交接工作区', heading: '交接单', hash: '#/handoff' },
  { link: '上传中心', heading: '上传中心', hash: '#/upload' },
  { link: '系统设置', heading: '系统设置', hash: '#/setup' },
  { link: '安全与审计', heading: '安全与审计', hash: '#/security' }
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
