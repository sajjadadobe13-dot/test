#!/usr/bin/env node
/**
 * Renders social preview images (1200×630) and app icons with Playwright.
 * Output is committed to src/assets so normal builds need no browser.
 *   node scripts/images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const require = createRequire(import.meta.url);
globalThis.ClipperLib = require('clipper-lib');
const { chromium } = await import('@playwright/test');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TEMPLATES, CATEGORIES, generate, MATERIALS } = await import('../src/assets/js/core/registry.js');
const { compose } = await import('../src/assets/js/core/export/compose.js');
const { toSVG } = await import('../src/assets/js/core/export/svg.js');

const outImg = path.join(ROOT, 'src/assets/img');
const outOg = path.join(ROOT, 'src/assets/og');
fs.mkdirSync(outImg, { recursive: true });
fs.mkdirSync(outOg, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

const art = (t) => {
  const res = generate(t, {}, { t: MATERIALS[t.material]?.default ?? 0 });
  const sheet = compose(res, { labels: true, dims: false, infoBlock: false, margin: 4 });
  sheet.items = sheet.items.filter((i) => i.layer !== 'safe');
  return toSVG(sheet, { preview: true });
};

const card = (title, sub, svg) => `<!doctype html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap');
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;background:#0b1220;color:#fff;display:grid;grid-template-columns:560px 1fr;overflow:hidden}
.l{padding:64px 0 56px 64px;display:flex;flex-direction:column;justify-content:space-between;background:radial-gradient(600px 300px at 0 0,rgba(255,46,147,.25),transparent 70%)}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:28px;letter-spacing:-.02em}
h1{font-size:${title.length > 28 ? 52 : 60}px;line-height:1.05;letter-spacing:-.03em;margin:0 0 18px;font-weight:800}
p{font-size:24px;color:#b8c2d6;margin:0;line-height:1.35}
.fmts{display:flex;gap:10px}.fmts span{font-weight:800;font-size:18px;border:2px solid #334155;border-radius:10px;padding:6px 12px;color:#e2e8f0}
.r{background:#fff;margin:40px 40px 40px 0;border-radius:24px;position:relative}
.r svg{position:absolute;inset:28px;width:calc(100% - 56px);height:calc(100% - 56px)}
</style></head><body><div class="l"><div class="brand"><svg viewBox="0 0 32 32" width="44" height="44"><rect x="1" y="1" width="30" height="30" rx="8" fill="#1e293b"/><path d="M9 11h6v-4h6v4h3v12h-3v3h-6v-3H9z" fill="none" stroke="#ff2e93" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v12M21 11v12M9 15h15" stroke="#22c3ee" stroke-width="1.4" stroke-dasharray="2 1.6"/></svg>${config.name}</div>
<div><h1>${title}</h1><p>${sub}</p></div><div class="fmts"><span>PDF</span><span>AI</span><span>SVG</span><span>DXF</span><span>EPS</span></div></div><div class="r">${svg}</div></body></html>`;

async function shot(htmlStr, file, w = 1200, h = 630) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(htmlStr, { waitUntil: 'networkidle' }).catch(() => page.setContent(htmlStr));
  await page.screenshot({ path: file, type: 'png' });
}

await shot(card('Free online dieline generator', `${TEMPLATES.length} templates for boxes, envelopes, pouches, cans, tubes and labels.`, art(TEMPLATES[0])), path.join(outImg, 'og-default.png'));
for (const t of TEMPLATES) {
  const cat = CATEGORIES.find((c) => c.id === t.category);
  await shot(card(`${t.name} dieline`, `${t.short} Free · ${cat.name}`, art(t)), path.join(outOg, `${t.id}.png`));
}
const icon = (size) => `<!doctype html><html><body style="margin:0;background:#0b1220;display:grid;place-items:center;width:${size}px;height:${size}px"><svg viewBox="0 0 32 32" width="${size * 0.8}" height="${size * 0.8}"><path d="M9 11h6v-4h6v4h3v12h-3v3h-6v-3H9z" fill="none" stroke="#ff2e93" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v12M21 11v12M9 15h15" stroke="#22c3ee" stroke-width="1.4" stroke-dasharray="2 1.6"/></svg></body></html>`;
for (const [s, name] of [
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
])
  await shot(icon(s), path.join(outImg, name), s, s);
await browser.close();
console.log(`Rendered ${TEMPLATES.length + 4} images`);
