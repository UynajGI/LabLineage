import { expect, test } from '@playwright/test';

test('language toggle switches the console between Chinese and English', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/#/checklist');
  await expect(page.getByRole('heading', { name: '实现状态' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('heading', { name: 'Implementation Status' }).first()).toBeVisible();

  await page.getByRole('button', { name: '切换到中文' }).click();
  await expect(page.getByRole('heading', { name: '实现状态' }).first()).toBeVisible();

  expect(browserErrors).toEqual([]);
});
