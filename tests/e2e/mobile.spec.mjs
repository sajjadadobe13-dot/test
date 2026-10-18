import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { watchErrors, noHorizontalScroll } from './helpers.mjs';

test('mobile pages fit the viewport', async ({ page }) => {
  for (const url of ['/', '/templates/', '/templates/boxes/', '/guide/', '/dieline/stand-up-pouch/', '/dieline/mailer-box/', '/dieline/cup-sleeve/']) {
    await page.goto(url);
    await noHorizontalScroll(page);
  }
});

test('mobile menu opens and closes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await toggle.click();
  await expect(page.locator('#site-nav')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-nav')).toBeHidden();
});

test('mobile sticky download bar works', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/dieline/beverage-can-label/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await expect(page.locator('.dl-bar')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.dl-bar [data-export-global="pdf"]').click()]);
  const buf = fs.readFileSync(await dl.path());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  w.assertClean();
});
