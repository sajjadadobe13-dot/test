#!/usr/bin/env node
/**
 * Static site build: bundles the app with esbuild and pre-renders every page
 * (home, gallery, categories, one SEO page per template, guide, legal) plus
 * thumbnails, sitemap, robots and manifest into ./dist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import config from '../site.config.mjs';
import * as content from './content.mjs';

const require = createRequire(import.meta.url);
globalThis.ClipperLib = require('clipper-lib');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const { TEMPLATES, CATEGORIES, generate, MATERIALS, usesCaliper } = await import('../src/assets/js/core/registry.js');
const { compose, stats, fmtLen, LAYERS, LAYER_ORDER } = await import('../src/assets/js/core/export/compose.js');
const { toSVG } = await import('../src/assets/js/core/export/svg.js');

const BASE = config.base.endsWith('/') ? config.base : config.base + '/';
const u = (p = '') => BASE + p.replace(/^\//, '');
const abs = (p = '') => config.url + u(p);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const year = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ setup
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'), (f) => !f.includes(`${path.sep}js${path.sep}`));
copyDir(path.join(SRC, 'static'), DIST);

const hash = Date.now().toString(36);
await esbuild.build({
  entryPoints: { editor: path.join(SRC, 'assets/js/entry-editor.js'), site: path.join(SRC, 'assets/js/entry-site.js') },
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  outdir: path.join(DIST, 'assets/js'),
  entryNames: '[name].min',
  legalComments: 'none',
  logLevel: 'warning',
});

// ------------------------------------------------------------------ layout
const logo = `<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#0b1220"/><path d="M9 11h6v-4h6v4h3v12h-3v3h-6v-3H9z" fill="none" stroke="#ff2e93" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v12M21 11v12M9 15h15" stroke="#22c3ee" stroke-width="1.4" stroke-dasharray="2 1.6"/></svg>`;

function head({ title, description, canonical, image = 'assets/img/og-default.png', jsonld = [], noindex = false, type = 'website' }) {
  return `<!doctype html>
<html lang="en" data-site="${esc(config.name)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(canonical))}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="${config.themeColor}">
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(abs(canonical))}">
<meta property="og:image" content="${esc(abs(image))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(abs(image))}">
<link rel="icon" href="${u('favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${u('assets/img/apple-touch-icon.png')}">
<link rel="manifest" href="${u('manifest.webmanifest')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="${u(`assets/css/styles.css?v=${hash}`)}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>`;
}

const navLinks = [
  ['templates/', 'All templates'],
  ['templates/boxes/', 'Boxes'],
  ['templates/pouches/', 'Pouches'],
  ['templates/cans/', 'Labels'],
  ['guide/', 'Dieline guide'],
];

function header(active = '') {
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${u()}" aria-label="${esc(config.name)} home">${logo}<span>${esc(config.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      ${navLinks.map(([href, label]) => `<a href="${u(href)}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      <a class="btn btn-sm btn-primary nav-cta" href="${u('dieline/reverse-tuck-end-box/')}">Create a dieline</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  const cols = CATEGORIES.map(
    (c) => `<div><h3><a href="${u(`templates/${c.id}/`)}">${esc(c.name)}</a></h3><ul>${TEMPLATES.filter((t) => t.category === c.id)
      .slice(0, 6)
      .map((t) => `<li><a href="${u(`dieline/${t.id}/`)}">${esc(t.name)}</a></li>`)
      .join('')}</ul></div>`,
  ).join('');
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand"><a class="brand" href="${u()}">${logo}<span>${esc(config.name)}</span></a>
      <p>Free, browser-based dieline generator for packaging designers, printers and brands. Exact dimensions, industry-standard layers, five file formats.</p></div>
      <div class="footer-cols">${cols}<div><h3>Resources</h3><ul><li><a href="${u('guide/')}">Dieline guide</a></li><li><a href="${u('templates/')}">All templates</a></li><li><a href="${u('about/')}">About</a></li><li><a href="${u('privacy/')}">Privacy</a></li><li><a href="${u('terms/')}">Terms</a></li></ul></div></div>
    </div>
    <div class="footer-bottom"><p>© ${year} ${esc(config.name)}. Dielines are generated in your browser – your designs never leave your device.</p><p>Always confirm specifications with your printer and approve a physical sample before production.</p></div>
  </div>
</footer>`;
}

function page({ file, title, description, canonical, body, active, jsonld, image, scripts = ['site'], noindex, type }) {
  const htmlStr = `${head({ title, description, canonical, jsonld, image, noindex, type })}
<body>
${header(active)}
<main id="main">
${body}
</main>
${footer()}
${scripts.map((s) => `<script type="module" src="${u(`assets/js/${s}.min.js?v=${hash}`)}"></script>`).join('\n')}
</body>
</html>
`;
  const out = path.join(DIST, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, htmlStr);
  pages.push({ file, canonical, noindex });
}
const pages = [];

// ---------------------------------------------------------------- drawings
function render(t, values = {}, opts = {}) {
  const mat = MATERIALS[t.material];
  const res = generate(t, values, { t: mat?.default ?? 0, dimMode: 'inner', bleed: 3, safe: 3 });
  return { res, sheet: compose(res, { unit: 'mm', labels: true, dims: true, infoBlock: false, lineWidth: 0.5, margin: 6, meta: { title: t.name }, ...opts }) };
}

function thumbSVG(t) {
  const { sheet } = render(t, {}, { labels: false, dims: false, margin: 4 });
  sheet.items = sheet.items.filter((i) => ['cut', 'crease', 'perf', 'glue', 'guide'].includes(i.layer));
  return toSVG(sheet, { preview: true }).replace('class="dl-svg"', `class="dl-svg" width="${Math.round(sheet.width * 4)}" height="${Math.round(sheet.height * 4)}"`);
}

fs.mkdirSync(path.join(DIST, 'assets/thumbs'), { recursive: true });
const thumbSize = {};
for (const t of TEMPLATES) {
  const svg = thumbSVG(t);
  fs.writeFileSync(path.join(DIST, `assets/thumbs/${t.id}.svg`), svg);
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  thumbSize[t.id] = { w: +m[1], h: +m[2] };
}

function card(t) {
  const s = thumbSize[t.id];
  const search = [t.name, t.short, t.group, t.standard, ...(t.keywords || []), CATEGORIES.find((c) => c.id === t.category)?.name].join(' ').toLowerCase();
  return `<a class="card" href="${u(`dieline/${t.id}/`)}" data-cat="${t.category}" data-search="${esc(search)}">
  <div class="card-thumb"><img src="${u(`assets/thumbs/${t.id}.svg`)}" alt="${esc(t.name)} dieline template" loading="lazy" decoding="async" width="${Math.round(s.w * 2)}" height="${Math.round(s.h * 2)}"></div>
  <div class="card-body"><span class="tag">${esc(t.group)}</span><h3>${esc(t.name)}</h3><p>${esc(t.short)}</p></div>
</a>`;
}

const orgLd = { '@context': 'https://schema.org', '@type': 'Organization', name: config.name, url: abs(''), logo: abs('assets/img/icon-512.png') };
const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })),
});
const faqLd = (faqs) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
});
const faqHTML = (faqs) => `<div class="faq">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><div><p>${a}</p></div></details>`).join('')}</div>`;

// ------------------------------------------------------------------- home
{
  const hero = render(TEMPLATES.find((t) => t.id === 'reverse-tuck-end-box'), {}, { dims: false });
  hero.sheet.items = hero.sheet.items.filter((i) => i.layer !== 'safe');
  const heroSvg = toSVG(hero.sheet, { preview: true }).replace('class="dl-svg"', 'class="dl-svg hero-svg"');
  const cats = CATEGORIES.map((c) => {
    const list = TEMPLATES.filter((t) => t.category === c.id);
    const first = list[0];
    return `<a class="cat-card" href="${u(`templates/${c.id}/`)}"><div class="cat-thumb"><img src="${u(`assets/thumbs/${first.id}.svg`)}" alt="" loading="lazy" width="200" height="140"></div><div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><span class="count">${list.length} templates →</span></div></a>`;
  }).join('');
  const popular = ['reverse-tuck-end-box', 'mailer-box', 'stand-up-pouch', 'beverage-can-label', 'invitation-envelope', 'cup-sleeve', 'shipping-box-rsc', 'squeeze-tube'].map((id) => card(TEMPLATES.find((t) => t.id === id))).join('');
  const body = `
<section class="hero">
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">Free dieline generator · ${TEMPLATES.length} templates</p>
      <h1>Custom dielines for every package, <span class="hl">in seconds.</span></h1>
      <p class="lede">Choose a box, envelope, pouch, can, tube, container or print product, enter your dimensions and download a production-ready dieline as <strong>PDF, AI, SVG, DXF or EPS</strong>. No sign-up, no watermark.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="${u('templates/')}">Browse templates</a>
        <a class="btn btn-ghost btn-lg" href="${u('dieline/reverse-tuck-end-box/')}">Try a tuck end box</a>
      </div>
      <ul class="hero-points">
        <li>Industry-standard spot colours &amp; layers</li>
        <li>Board-thickness compensation</li>
        <li>Bleed &amp; safe zone built in</li>
      </ul>
    </div>
    <div class="hero-art" aria-hidden="true"><div class="paper">${heroSvg}</div>
      <div class="hero-badges"><span class="badge b-cut">CutContour</span><span class="badge b-crease">Crease</span><span class="badge b-bleed">Bleed 3 mm</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><h2>Pick a packaging type</h2><p>Every template is fully parametric – type your size and the dieline redraws instantly.</p></div>
    <div class="cat-grid">${cats}</div>
  </div>
</section>

<section class="section alt">
  <div class="container">
    <div class="section-head"><h2>How it works</h2></div>
    <ol class="steps">
      <li><span class="step-n">1</span><h3>Choose a template</h3><p>Start from ${TEMPLATES.length} structural designs: tuck end and mailer boxes, RSC shipping cartons, envelopes, stand-up pouches, can labels, cup sleeves and more.</p></li>
      <li><span class="step-n">2</span><h3>Enter your dimensions</h3><p>Work in millimetres, centimetres or inches, pick a size preset or type exact inside or outside dimensions and your board caliper.</p></li>
      <li><span class="step-n">3</span><h3>Download &amp; design</h3><p>Export a layered vector file, place your artwork on the panels in Illustrator, Affinity, Inkscape or Canva, and send it to print.</p></li>
    </ol>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><h2>Popular dieline templates</h2><a class="link-more" href="${u('templates/')}">See all ${TEMPLATES.length} →</a></div>
    <div class="grid">${popular}</div>
  </div>
</section>

<section class="section alt">
  <div class="container">
    <div class="section-head"><h2>Built to printer specifications</h2><p>Files follow the conventions packaging printers and die-makers expect, so they drop straight into prepress.</p></div>
    <div class="features">
      ${content.features.map(([t, d, icon]) => `<div class="feature"><div class="f-icon" aria-hidden="true">${icon}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="container formats">
    <div class="section-head"><h2>Five professional file formats</h2></div>
    <div class="format-grid">
      ${content.formats.map(([f, d]) => `<div class="format"><span class="fmt">${f}</span><p>${d}</p></div>`).join('')}
    </div>
  </div>
</section>

<section class="section alt">
  <div class="container narrow">
    <div class="section-head"><h2>Frequently asked questions</h2></div>
    ${faqHTML(content.homeFaq)}
  </div>
</section>

<section class="section cta-band">
  <div class="container cta-inner">
    <h2>Ready to make your dieline?</h2>
    <p>Free forever. Runs in your browser. Your designs stay on your device.</p>
    <a class="btn btn-primary btn-lg" href="${u('templates/')}">Start now</a>
  </div>
</section>`;
  page({
    file: 'index.html',
    title: `Free Dieline Generator for Boxes, Pouches & Labels | ${config.name}`,
    description: `Create custom dielines online for free: ${TEMPLATES.length} templates for boxes, mailers, envelopes, pouches, cans, tubes, cups and labels. Download PDF, AI, SVG, DXF, EPS.`,
    canonical: '',
    body,
    jsonld: [
      orgLd,
      { '@context': 'https://schema.org', '@type': 'WebSite', name: config.name, url: abs(''), potentialAction: { '@type': 'SearchAction', target: `${abs('templates/')}?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: config.name, url: abs(''), applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: 'Online dieline generator for packaging.' },
      faqLd(content.homeFaq),
    ],
  });
}

// --------------------------------------------------------------- galleries
function galleryPage({ file, cat, title, h1, intro, canonical, active }) {
  const list = cat ? TEMPLATES.filter((t) => t.category === cat) : TEMPLATES;
  const chips = cat
    ? ''
    : `<div class="chips" role="group" aria-label="Filter by category"><button type="button" class="chip-f" data-filter="all" aria-pressed="true">All</button>${CATEGORIES.map((c) => `<button type="button" class="chip-f" data-filter="${c.id}" aria-pressed="false">${esc(c.short)}</button>`).join('')}</div>`;
  const others = CATEGORIES.filter((c) => c.id !== cat)
    .map((c) => `<a class="pill" href="${u(`templates/${c.id}/`)}">${esc(c.name)}</a>`)
    .join('');
  const body = `
<section class="page-head">
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${u()}">Home</a><span>/</span>${cat ? `<a href="${u('templates/')}">Templates</a><span>/</span><span aria-current="page">${esc(h1)}</span>` : '<span aria-current="page">Templates</span>'}</nav>
    <h1>${esc(h1)}</h1>
    <p class="lede">${intro}</p>
    <div class="gallery-tools">
      <label class="search"><span class="sr-only">Search templates</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="tpl-search" type="search" placeholder="Search e.g. mailer, pouch, 12 oz…" autocomplete="off"></label>
      <span id="tpl-count" class="muted">${list.length} templates</span>
    </div>
    ${chips}
  </div>
</section>
<section class="section tight">
  <div class="container">
    <div class="grid" data-gallery>${list.map(card).join('')}</div>
    <p id="tpl-empty" class="empty" hidden>No templates match your search. Try “box”, “label” or “envelope”.</p>
    ${cat ? `<div class="more-cats"><h2>More categories</h2><div class="pills">${others}</div></div>` : ''}
  </div>
</section>`;
  const ld = [
    crumbs(cat ? [['Home', ''], ['Templates', 'templates/'], [h1, `templates/${cat}/`]] : [['Home', ''], ['Templates', 'templates/']]),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`dieline/${t.id}/`), name: t.name })) },
  ];
  page({ file, title, description: intro.replace(/<[^>]+>/g, '').slice(0, 158), canonical, body, active, jsonld: ld });
}

galleryPage({
  file: 'templates/index.html',
  title: `Dieline Templates – Boxes, Pouches, Envelopes | ${config.name}`,
  h1: 'Dieline templates',
  intro: `${TEMPLATES.length} free, fully customisable dieline templates. Pick a structure, enter your size and download a print-ready file in PDF, AI, SVG, DXF or EPS.`,
  canonical: 'templates/',
  active: 'templates/',
});
for (const c of CATEGORIES) {
  galleryPage({
    file: `templates/${c.id}/index.html`,
    cat: c.id,
    title: `${c.name} Dieline Templates | ${config.name}`,
    h1: `${c.name} dielines`,
    intro: content.categoryIntro[c.id],
    canonical: `templates/${c.id}/`,
    active: `templates/${c.id}/`,
  });
}

// ------------------------------------------------------------ editor pages
/** Keep titles short enough not to be truncated in search results. */
function seoTitle(t) {
  for (const cand of [`${t.name} Dieline Generator – Free PDF & AI | ${config.name}`, `${t.name} Dieline Generator | ${config.name}`, `${t.name} Dieline Generator – Free`, `${t.name} Dieline Generator`]) if (cand.length <= 65) return cand;
  return `${t.name} Dieline`;
}

for (const t of TEMPLATES) {
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const { res, sheet } = render(t);
  const st = stats(res);
  const svg = toSVG(sheet, { preview: true });
  const usedLayers = LAYER_ORDER.filter((k) => k !== 'info' && (res.layers[k] || []).length).map((k) => LAYERS[k].name);
  const related = TEMPLATES.filter((x) => x.category === t.category && x.id !== t.id)
    .concat(TEMPLATES.filter((x) => x.category !== t.category))
    .slice(0, 4);
  const faqs = content.templateFaq(t, { fmtLen, MATERIALS, usesCaliper });
  const paramRows = t.params
    .filter((p) => p.type !== 'bool' || true)
    .map((p) => {
      const def = p.type === 'length' ? (p.auto ? 'Automatic' : fmtLen(p.default, 'mm')) : p.type === 'bool' ? (p.default ? 'On' : 'Off') : p.type === 'select' ? p.options.find((o) => o.value === p.default)?.label : p.default;
      return `<tr><th scope="row">${esc(p.label)}</th><td>${esc(def)}</td><td>${esc(p.help || (p.type === 'length' ? `${fmtLen(p.min ?? 0, 'mm')} – ${fmtLen(p.max ?? 0, 'mm')}` : ''))}</td></tr>`;
    })
    .join('');
  const dl = (fmt, label, sub, primary) =>
    `<button type="button" class="dl ${primary ? 'dl-primary' : ''}" data-export="${fmt}"><span class="dl-fmt">${label}</span><span class="dl-sub">${sub}</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const body = `
<div class="editor-page">
  <div class="ed-head container-wide">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${u()}">Home</a><span>/</span><a href="${u('templates/')}">Templates</a><span>/</span><a href="${u(`templates/${cat.id}/`)}">${esc(cat.name)}</a><span>/</span><span aria-current="page">${esc(t.name)}</span></nav>
    <div class="ed-title">
      <div><h1>${esc(t.name)} <span class="h1-sub">Dieline Generator</span></h1><p class="lede">${esc(t.short)} <span class="std">${esc(t.standard)}</span></p></div>
      <div class="ed-actions"><button type="button" id="reset" class="btn btn-ghost btn-sm">Reset</button><button type="button" id="share" class="btn btn-ghost btn-sm"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Copy link</button></div>
    </div>
  </div>
  <div class="editor container-wide" data-template="${t.id}">
    <aside id="controls" class="ed-controls" aria-label="Dieline settings"><noscript><p class="noscript">JavaScript is required to customise and download dielines.</p></noscript><div class="skeleton"></div></aside>
    <section class="ed-stage" aria-label="Dieline preview">
      <div class="ed-toolbar">
        <div class="tabs" role="tablist" aria-label="View"><button type="button" role="tab" id="view-2d" aria-selected="true">2D dieline</button><button type="button" role="tab" id="view-3d" aria-selected="false" hidden>3D preview</button></div>
        <div class="zoom"><button type="button" id="zoom-out" aria-label="Zoom out">−</button><span id="zoom-level" aria-live="polite">100%</span><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="zoom-fit" class="fit">Fit</button></div>
      </div>
      <div id="msg" class="ed-msg" role="alert" hidden></div>
      <div id="viewport" class="ed-viewport"><div id="canvas" class="ed-canvas">${svg}</div></div>
      <div id="stage3d" class="ed-3d" hidden></div>
      <div id="legend" class="ed-legend" aria-label="Layers"></div>
    </section>
    <aside id="export" class="ed-export" aria-label="Download">
      <h2>Download dieline</h2>
      <div class="dl-list">
        ${dl('pdf', 'PDF', 'Print & prepress', true)}
        ${dl('ai', 'AI', 'Adobe Illustrator')}
        ${dl('svg', 'SVG', 'Inkscape, Figma, Canva')}
        ${dl('dxf', 'DXF', 'CAD & cutting tables')}
        ${dl('eps', 'EPS', 'Legacy workflows')}
      </div>
      <dl class="stats">
        <div><dt>Flat size</dt><dd data-stat="flat">${fmtLen(st.flatW, 'mm').replace(/ mm$/, '')} × ${fmtLen(st.flatH, 'mm')}</dd></div>
        <div><dt>Incl. bleed</dt><dd data-stat="bleed">${fmtLen(res.bounds.width, 'mm').replace(/ mm$/, '')} × ${fmtLen(res.bounds.height, 'mm')}</dd></div>
        <div><dt>Knife length</dt><dd data-stat="knife">${(st.cutLen / 1000).toFixed(2)} m</dd></div>
        <div><dt>Crease length</dt><dd data-stat="crease">${st.creaseLen ? (st.creaseLen / 1000).toFixed(2) + ' m' : '—'}</dd></div>
        <div><dt>Fits on sheet</dt><dd data-stat="sheet">–</dd></div>
      </dl>
      <p class="ed-note">Vector files at 1:1 scale with separate <strong>CutContour</strong>, <strong>Crease</strong>, bleed and safe-zone layers set to overprint.</p>
    </aside>
  </div>
  <div class="dl-bar" aria-label="Quick download">
    <button type="button" class="btn btn-primary" data-export-global="pdf">PDF</button><button type="button" class="btn" data-export-global="ai">AI</button><button type="button" class="btn" data-export-global="svg">SVG</button><button type="button" class="btn" data-export-global="dxf">DXF</button>
  </div>

  <section class="section tpl-info">
    <div class="container tpl-grid">
      <article class="prose">
        <h2>About the ${esc(t.name.toLowerCase())} dieline</h2>
        <p>${esc(t.description)}</p>
        <h2>How to create your ${esc(t.name.toLowerCase())} dieline</h2>
        <ol>
          <li><strong>Enter your dimensions</strong> – choose millimetres, centimetres or inches${t.dimMode ? ' and whether you are entering inside (product) or outside dimensions' : ''}. Pick a preset to start from a common size.</li>
          ${usesCaliper(t) ? `<li><strong>Select your material</strong> – the ${esc(MATERIALS[t.material].label.toLowerCase())} caliper is used to compensate panel sizes so the finished pack fits.</li>` : ''}
          <li><strong>Check the preview</strong> – cut lines are solid magenta, creases dashed cyan, bleed green and the safe zone dashed orange.${t.preview3d ? ' Switch to the 3D view to check proportions.' : ''}</li>
          <li><strong>Download</strong> the PDF or AI file, place it on a locked layer in your design software and build your artwork on the panels. Extend backgrounds to the bleed line.</li>
          <li><strong>Send to print</strong> with the dieline layer kept separate, and approve a physical sample before the production run.</li>
        </ol>
        <h2>Parameters</h2>
        <div class="table-wrap"><table><thead><tr><th scope="col">Setting</th><th scope="col">Default</th><th scope="col">Notes</th></tr></thead><tbody>${paramRows}</tbody></table></div>
        <h2>FAQ</h2>
        ${faqHTML(faqs)}
      </article>
      <aside class="spec-card">
        <h2>Specifications</h2>
        <dl>
          <div><dt>Structure</dt><dd>${esc(t.standard)}</dd></div>
          <div><dt>Category</dt><dd><a href="${u(`templates/${cat.id}/`)}">${esc(cat.name)}</a></dd></div>
          <div><dt>Material</dt><dd>${esc(MATERIALS[t.material]?.label || '—')}</dd></div>
          <div><dt>Layers</dt><dd>${usedLayers.map(esc).join(', ')}</dd></div>
          <div><dt>Formats</dt><dd>PDF, AI, SVG, DXF, EPS</dd></div>
          <div><dt>Units</dt><dd>mm, cm, inches</dd></div>
          <div><dt>Price</dt><dd>Free, no sign-up</dd></div>
        </dl>
      </aside>
    </div>
  </section>
  <section class="section alt">
    <div class="container"><div class="section-head"><h2>Related templates</h2><a class="link-more" href="${u('templates/')}">All templates →</a></div><div class="grid">${related.map(card).join('')}</div></div>
  </section>
</div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  const kw = t.keywords?.[0] || `${t.name} dieline`;
  page({
    file: `dieline/${t.id}/index.html`,
    title: seoTitle(t),
    description: `Free ${kw}: enter your dimensions and download a print-ready ${t.name.toLowerCase()} dieline with cut, crease, bleed and safe-zone layers in PDF, AI, SVG, DXF or EPS.`.slice(0, 160),
    canonical: `dieline/${t.id}/`,
    image: `assets/og/${t.id}.png`,
    body,
    scripts: ['editor'],
    jsonld: [
      crumbs([
        ['Home', ''],
        ['Templates', 'templates/'],
        [cat.name, `templates/${cat.id}/`],
        [t.name, `dieline/${t.id}/`],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: `${t.name} Dieline Generator`,
        url: abs(`dieline/${t.id}/`),
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Any (web browser)',
        description: t.description,
        image: abs(`assets/og/${t.id}.png`),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: config.name },
      },
      faqLd(faqs),
    ],
  });
}

// ------------------------------------------------------------- guide/legal
page({
  file: 'guide/index.html',
  title: `What Is a Dieline? Complete Packaging Guide | ${config.name}`,
  description: 'Everything about dielines: cut and crease lines, bleed, safe zones, spot colours, board caliper, FEFCO and ECMA styles, file formats and a pre-press checklist.',
  canonical: 'guide/',
  active: 'guide/',
  type: 'article',
  body: content.guide({ u, TEMPLATES, LAYERS }),
  jsonld: [
    crumbs([
      ['Home', ''],
      ['Dieline guide', 'guide/'],
    ]),
    { '@context': 'https://schema.org', '@type': 'Article', headline: 'What is a dieline? The complete packaging dieline guide', datePublished: today, dateModified: today, author: { '@type': 'Organization', name: config.name }, publisher: orgLd, mainEntityOfPage: abs('guide/') },
  ],
});
page({ file: 'about/index.html', title: `About | ${config.name}`, description: `${config.name} is a free online dieline generator for packaging designers, printers and brands.`, canonical: 'about/', body: content.about({ u, config, count: TEMPLATES.length }) });
page({ file: 'privacy/index.html', title: `Privacy Policy | ${config.name}`, description: `How ${config.name} handles your data: dielines are generated locally in your browser.`, canonical: 'privacy/', body: content.privacy({ config, today }) });
page({ file: 'terms/index.html', title: `Terms of Use | ${config.name}`, description: `Terms of use for ${config.name}, the free online dieline generator: permitted use, no-warranty notice and limitation of liability.`, canonical: 'terms/', body: content.terms({ config, today }) });
page({
  file: '404.html',
  title: `Page not found | ${config.name}`,
  description: 'The page you are looking for does not exist.',
  canonical: '404.html',
  noindex: true,
  body: `<section class="section"><div class="container narrow center"><p class="eyebrow">404</p><h1>This page folded away</h1><p class="lede">The page you are looking for doesn’t exist. Try one of our dieline templates instead.</p><p><a class="btn btn-primary" href="${u('templates/')}">Browse templates</a></p></div></section>`,
});

// ------------------------------------------------------------ meta files
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter((p) => !p.noindex)
  .map((p) => `  <url><loc>${abs(p.canonical)}</loc><lastmod>${today}</lastmod><changefreq>${p.canonical.startsWith('dieline/') ? 'monthly' : 'weekly'}</changefreq><priority>${p.canonical === '' ? '1.0' : p.canonical.startsWith('dieline/') ? '0.9' : '0.7'}</priority></url>`)
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
fs.writeFileSync(
  path.join(DIST, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: `${config.name} – Dieline Generator`,
      short_name: config.name,
      start_url: u(),
      scope: u(),
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: config.themeColor,
      icons: [
        { src: u('assets/img/icon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: u('assets/img/icon-512.png'), sizes: '512x512', type: 'image/png' },
        { src: u('favicon.svg'), sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ),
);
fs.writeFileSync(path.join(DIST, 'favicon.svg'), logo.replace('class="logo-mark" ', 'xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', ''));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(
  path.join(DIST, 'assets/js/THIRD-PARTY-NOTICES.txt'),
  `This site bundles Clipper (clipper-lib ${require('clipper-lib/package.json').version}) by Angus Johnson, JavaScript port by Timo.\nBoost Software License 1.0 – https://www.boost.org/LICENSE_1_0.txt\n`,
);

console.log(`Built ${pages.length} pages, ${TEMPLATES.length} templates → ${path.relative(ROOT, DIST)}/`);

function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d, filter);
    else if (filter(s)) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}
