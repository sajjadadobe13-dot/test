import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { watchErrors } from './helpers.mjs';

const templateIds = fs.readdirSync('dist/dieline');

test.describe('every template editor', () => {
  for (const id of templateIds) {
    test(`${id} loads, renders and lists layers`, async ({ page }) => {
      const w = watchErrors(page);
      await page.goto(`/dieline/${id}/`);
      await expect(page.locator('.editor.ready')).toBeVisible();
      await expect(page.locator('#canvas svg .layer-cut path').first()).toBeVisible();
      await expect(page.locator('#legend .chip').first()).toBeVisible();
      await expect(page.locator('#controls .field').first()).toBeVisible();
      await expect(page.locator('[data-stat="flat"]')).not.toHaveText('');
      w.assertClean();
    });
  }
});

test('changing a dimension updates preview, stats and URL', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  const before = await page.locator('[data-stat="flat"]').textContent();
  await page.fill('#f-L', '100');
  await expect(page.locator('[data-stat="flat"]')).not.toHaveText(before);
  await expect(page).toHaveURL(/L=100/);
  w.assertClean();
});

test('validation shows an error and keeps the last good drawing', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  const flat = await page.locator('[data-stat="flat"]').textContent();
  await page.fill('#f-W', '1');
  await expect(page.locator('#f-W-err')).toContainText('Min');
  await expect(page.locator('#f-W')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-stat="flat"]')).toHaveText(flat);
  await page.fill('#f-W', 'abc');
  await expect(page.locator('#f-W-err')).toContainText('number');
});

test('unit switch converts values and arrow keys step', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/?L=76.2');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.getByRole('radio', { name: 'in', exact: true }).click();
  await expect(page.locator('#f-L')).toHaveValue('3');
  await expect(page.locator('#f-L + .unit')).toHaveText('in');
  await page.locator('#f-L').press('ArrowUp');
  await expect(page.locator('#f-L')).toHaveValue('3.0625');
  await page.getByRole('radio', { name: 'mm', exact: true }).click();
});

test('presets fill the form', async ({ page }) => {
  await page.goto('/dieline/mailer-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.selectOption('#preset', { label: 'Apparel 300 × 230 × 80 mm' });
  await expect(page.locator('#f-L')).toHaveValue('300');
  await expect(page.locator('#f-W')).toHaveValue('230');
});

test('options reveal dependent fields and change geometry', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await expect(page.locator('.field[data-key="header"]')).toBeHidden();
  const cuts = await page.locator('#canvas .layer-cut path').count();
  await page.getByLabel('Hang tab (euro slot header)').check();
  await expect(page.locator('.field[data-key="header"]')).toBeVisible();
  await expect(page.locator('#canvas .layer-cut path')).toHaveCount(cuts + 1); // euro slot
  const flat = await page.locator('[data-stat="flat"]').textContent();
  await page.fill('#f-header', '90');
  await expect(page.locator('[data-stat="flat"]')).not.toHaveText(flat);
});

test('layer chips hide layers in the preview', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  const chip = page.locator('#legend .chip', { hasText: 'Bleed' });
  await chip.click();
  await expect(page.locator('#canvas .layer-bleed')).toBeHidden();
  await expect(page.locator('#legend .chip', { hasText: 'Bleed' })).toHaveAttribute('aria-pressed', 'false');
});

test('3D preview builds a folded box', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.getByRole('tab', { name: '3D preview' }).click();
  await expect(page.locator('#stage3d')).toBeVisible();
  await expect(page.locator('#stage3d .s3d-face')).toHaveCount(6);
  await expect(page.locator('.s3d-cap')).toContainText('70 mm × 40 mm × 120 mm');
  await page.getByRole('tab', { name: '2D dieline' }).click();
  await expect(page.locator('#viewport')).toBeVisible();
});

test('zoom controls', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.click('#zoom-in');
  await expect(page.locator('#zoom-level')).toHaveText('125%');
  await page.click('#zoom-fit');
  await expect(page.locator('#zoom-level')).toHaveText('100%');
});

test('shared links restore the design', async ({ page }) => {
  await page.goto('/dieline/stand-up-pouch/?W=200&H=300&G=110&zipper=0&u=cm');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await expect(page.locator('#f-W')).toHaveValue('20');
  await expect(page.getByLabel('Reclosable zipper')).not.toBeChecked();
});

const signatures = {
  pdf: (b) => b.subarray(0, 8).toString() === '%PDF-1.6',
  ai: (b) => b.subarray(0, 8).toString() === '%PDF-1.6',
  svg: (b) => b.toString().includes('<svg') && b.toString().includes('inkscape:label="Cut"'),
  dxf: (b) => b.toString().startsWith('0\nSECTION') && b.toString().includes('\nCUT\n'),
  eps: (b) => b.toString().startsWith('%!PS-Adobe-3.0 EPSF-3.0'),
};

for (const fmt of Object.keys(signatures)) {
  test(`download ${fmt.toUpperCase()}`, async ({ page }) => {
    const w = watchErrors(page);
    await page.goto('/dieline/reverse-tuck-end-box/?L=80&W=50&D=130');
    await expect(page.locator('.editor.ready')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`#export [data-export="${fmt}"]`)]);
    expect(dl.suggestedFilename()).toBe(`reverse-tuck-end-box-80x50x130mm-dieline.${fmt}`);
    const buf = fs.readFileSync(await dl.path());
    expect(signatures[fmt](buf)).toBe(true);
    await expect(page.locator('#toast')).toHaveText(`${fmt.toUpperCase()} downloaded`);
    w.assertClean();
  });
}

test('hidden layers are left out of downloads', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.locator('#legend .chip', { hasText: 'Bleed' }).click();
  await page.locator('#legend .chip', { hasText: 'Safe Zone' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export [data-export="dxf"]')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  expect(txt).not.toMatch(/\nBLEED\n/);
  expect(txt).not.toMatch(/\nSAFE_ZONE\n/);
  expect(txt).toMatch(/\nCUT\n/);
});

test('copy link puts the current design on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/dieline/reverse-tuck-end-box/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.fill('#f-D', '150');
  await page.click('#share');
  await expect(page.locator('#toast')).toHaveText('Link copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('/dieline/reverse-tuck-end-box/?D=150');
});

test('reset restores defaults', async ({ page }) => {
  await page.goto('/dieline/reverse-tuck-end-box/?L=120');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.click('#reset');
  await expect(page.locator('#f-L')).toHaveValue('70');
});

test('material selector changes panel compensation', async ({ page }) => {
  await page.goto('/dieline/shipping-box-rsc/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  const flat = await page.locator('[data-stat="flat"]').textContent();
  await page.selectOption('#f-material', { label: 'BC double wall (6.5 mm)' });
  await expect(page.locator('[data-stat="flat"]')).not.toHaveText(flat);
});

test('impossible taper shows a friendly message and disables downloads', async ({ page }) => {
  await page.goto('/dieline/tapered-tub-label/');
  await expect(page.locator('.editor.ready')).toBeVisible();
  await page.fill('#f-Dt', '300');
  await page.fill('#f-Db', '20');
  await page.fill('#f-h', '10');
  await expect(page.locator('#msg')).toContainText('too steep');
  await expect(page.locator('#export')).toHaveClass(/disabled/);
});
