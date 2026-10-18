import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Serve pages with the production Content-Security-Policy from src/static/_headers
// and make sure nothing the app does is blocked by it.
const csp = fs.readFileSync('src/static/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1];

test('app works under the production CSP', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
  });
  const violations = [];
  page.on('console', (m) => /Content Security Policy|Refused to/.test(m.text()) && violations.push(m.text()));
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.fill('#f-L', '90');
  await page.getByRole('tab', { name: '3D preview' }).click();
  await expect(page.locator('#stage3d .s3d-face').first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export [data-export="pdf"]')]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  await page.goto('/templates/');
  await page.fill('#tpl-search', 'pouch');
  expect(violations).toEqual([]);
});
