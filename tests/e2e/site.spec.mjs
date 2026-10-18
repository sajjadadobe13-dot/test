import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { watchErrors, noHorizontalScroll } from './helpers.mjs';

const templateIds = fs.readdirSync('dist/dieline');

test('home page renders hero, categories and links', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Custom dielines');
  await expect(page.locator('.cat-card')).toHaveCount(7);
  await expect(page.locator('.hero-svg')).toBeVisible();
  await page.getByRole('link', { name: 'Browse templates' }).first().click();
  await expect(page).toHaveURL(/\/templates\/$/);
  w.assertClean();
});

test('gallery search and category filters', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/templates/');
  const cards = page.locator('[data-gallery] .card');
  await expect(cards).toHaveCount(templateIds.length);
  await page.fill('#tpl-search', 'mailer');
  await expect(page.locator('[data-gallery] .card:visible')).toHaveCount(1);
  await page.fill('#tpl-search', 'zzzz');
  await expect(page.locator('#tpl-empty')).toBeVisible();
  await page.fill('#tpl-search', '');
  await page.getByRole('button', { name: 'Envelopes' }).click();
  await expect(page.locator('[data-gallery] .card:visible')).toHaveCount(2);
  await expect(page).toHaveURL(/cat=envelopes/);
  w.assertClean();
});

test('category pages list only their templates', async ({ page }) => {
  await page.goto('/templates/pouches/');
  await expect(page.locator('h1')).toHaveText('Pouches & Bags dielines');
  const n = await page.locator('[data-gallery] .card').count();
  expect(n).toBeGreaterThanOrEqual(4);
});

test('guide, about, privacy, terms and 404 pages', async ({ page }) => {
  for (const [url, h1] of [
    ['/guide/', 'What is a dieline'],
    ['/about/', 'About'],
    ['/privacy/', 'Privacy'],
    ['/terms/', 'Terms'],
  ]) {
    await page.goto(url);
    await expect(page.locator('h1')).toContainText(h1);
  }
  const res = await page.goto('/does-not-exist/');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('folded away');
});

test('SEO essentials on every page', async ({ page }) => {
  const files = ['', 'templates/', 'guide/', 'about/', 'privacy/', 'terms/', ...fs.readdirSync('dist/templates').filter((f) => !f.includes('.')).map((c) => `templates/${c}/`), ...templateIds.map((id) => `dieline/${id}/`)];
  for (const f of files) {
    await page.goto('/' + f);
    const title = await page.title();
    expect(title.length, f).toBeGreaterThan(15);
    expect(title.length, `${f} title ≤ 65 chars`).toBeLessThanOrEqual(65);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc.length, f).toBeGreaterThan(70);
    expect(desc.length, f).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${f.replace(/\//g, '\\/')}$`));
    await expect(page.locator('h1')).toHaveCount(1);
    for (const ld of await page.locator('script[type="application/ld+json"]').allTextContents()) expect(() => JSON.parse(ld)).not.toThrow();
    const imgsWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imgsWithoutAlt, f).toBe(0);
  }
});

test('sitemap and robots', async ({ request }) => {
  const sm = await (await request.get('/sitemap.xml')).text();
  for (const id of templateIds) expect(sm).toContain(`/dieline/${id}/`);
  expect(sm).not.toContain('404');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap:');
});

test('desktop pages have no horizontal overflow', async ({ page }) => {
  for (const url of ['/', '/templates/', '/guide/', '/dieline/mailer-box/']) {
    await page.goto(url);
    await noHorizontalScroll(page);
  }
});
