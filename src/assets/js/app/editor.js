import { byId, defaults, generate, MATERIALS, usesCaliper } from '../core/registry.js';
import { compose, stats, LAYERS, LAYER_ORDER, fmtLen } from '../core/export/compose.js';
import { toSVG } from '../core/export/svg.js';
import { toPDF } from '../core/export/pdf.js';
import { toDXF } from '../core/export/dxf.js';
import { toEPS } from '../core/export/eps.js';
import { toUnit, fromUnit, debounce, download, track, storage, el, fitSheet } from './util.js';
import { mount3D } from './preview3d.js';

const SITE = document.documentElement.dataset.site || 'DielineForge';
const root = document.querySelector('[data-template]');
const tpl = byId(root.dataset.template);

// ------------------------------------------------------------------ state
const material = MATERIALS[tpl.material] || MATERIALS.carton;
const prefs = storage.get('df:prefs', {});
const guessUnit = () => (/^en-US|^en-LR|^my/i.test(navigator.language || '') ? 'in' : 'mm');
const state = {
  values: defaults(tpl),
  unit: prefs.unit || guessUnit(),
  dimMode: 'inner',
  t: material.default,
  bleed: prefs.bleed ?? 3,
  safe: prefs.safe ?? 3,
  lineWidth: prefs.lineWidth ?? 0.5,
  exportLabels: prefs.exportLabels ?? true,
  exportDims: prefs.exportDims ?? true,
  infoBlock: prefs.infoBlock ?? true,
  hidden: new Set(),
  preset: '',
};
readURL();

let current = null; // { res, st }
const $ = (s) => root.querySelector(s);
const controls = $('#controls');
const exportBox = $('#export');
const canvas = $('#canvas');
const viewport = $('#viewport');
const msg = $('#msg');
const legend = $('#legend');

// ---------------------------------------------------------------- URL sync
function readURL() {
  const q = new URLSearchParams(location.search);
  for (const p of tpl.params) {
    if (!q.has(p.key)) continue;
    const raw = q.get(p.key);
    if (p.type === 'bool') state.values[p.key] = raw === '1' || raw === 'true';
    else if (p.type === 'select') state.values[p.key] = p.options.some((o) => o.value === raw) ? raw : p.default;
    else if (raw === '') state.values[p.key] = p.auto ? null : p.default;
    else {
      const v = parseFloat(raw);
      if (Number.isFinite(v)) state.values[p.key] = v;
    }
  }
  if (['mm', 'cm', 'in'].includes(q.get('u'))) state.unit = q.get('u');
  if (q.get('dim') === 'outer') state.dimMode = 'outer';
  if (q.has('t') && Number.isFinite(parseFloat(q.get('t')))) state.t = parseFloat(q.get('t'));
  if (q.has('bleed') && Number.isFinite(parseFloat(q.get('bleed')))) state.bleed = parseFloat(q.get('bleed'));
}

function shareURL() {
  const q = new URLSearchParams();
  for (const p of tpl.params) {
    const v = state.values[p.key];
    if (v === null || v === undefined) continue;
    if (p.type === 'bool') {
      if (v !== p.default) q.set(p.key, v ? '1' : '0');
    } else if (v !== p.default) q.set(p.key, typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v);
  }
  if (state.unit !== 'mm') q.set('u', state.unit);
  if (state.dimMode !== 'inner') q.set('dim', state.dimMode);
  if (state.t !== material.default) q.set('t', String(state.t));
  if (state.bleed !== 3) q.set('bleed', String(state.bleed));
  const s = q.toString();
  return location.origin + location.pathname + (s ? '?' + s : '');
}
const syncURL = debounce(() => history.replaceState(null, '', shareURL()), 300);

// ---------------------------------------------------------------- controls
const lenTypes = new Set(['length']);
function visible(p) {
  if (!p.showIf) return true;
  return typeof p.showIf === 'function' ? p.showIf(state.values) : !!state.values[p.showIf];
}

function field(p) {
  const id = `f-${p.key}`;
  const wrap = el('div', { class: 'field', 'data-key': p.key });
  if (p.type === 'bool') {
    const input = el('input', { type: 'checkbox', id, checked: !!state.values[p.key] });
    input.addEventListener('change', () => {
      state.values[p.key] = input.checked;
      changed(true);
    });
    wrap.classList.add('field-check');
    wrap.append(el('label', { for: id }, input, el('span', { text: p.label })));
  } else if (p.type === 'select') {
    const sel = el('select', { id });
    for (const o of p.options) sel.append(el('option', { value: o.value, selected: state.values[p.key] === o.value, text: o.label }));
    sel.addEventListener('change', () => {
      state.values[p.key] = sel.value;
      changed(true);
    });
    wrap.append(el('label', { for: id, text: p.label }), sel);
  } else {
    const isLen = lenTypes.has(p.type);
    const u = isLen ? state.unit : '';
    const input = el('input', {
      id,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      value: isLen ? toUnit(state.values[p.key], state.unit) : state.values[p.key] ?? '',
      placeholder: p.auto ? 'Auto' : '',
      'aria-describedby': `${id}-hint`,
    });
    const err = el('div', { class: 'field-err', id: `${id}-err`, role: 'alert' });
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      let v = raw === '' ? null : isLen ? fromUnit(raw, state.unit) : parseFloat(raw.replace(',', '.'));
      let problem = '';
      if (v === null && !p.auto) problem = 'Required';
      else if (v !== null && !Number.isFinite(v)) problem = 'Enter a number';
      else if (v !== null && p.min !== undefined && v < p.min - 1e-9) problem = `Min ${isLen ? fmtLen(p.min, state.unit) : p.min}`;
      else if (v !== null && p.max !== undefined && v > p.max + 1e-9) problem = `Max ${isLen ? fmtLen(p.max, state.unit) : p.max}`;
      err.textContent = problem;
      input.setAttribute('aria-invalid', problem ? 'true' : 'false');
      wrap.classList.toggle('invalid', !!problem);
      if (problem) return;
      state.values[p.key] = v;
      state.preset = '';
      const ps = controls.querySelector('#preset');
      if (ps) ps.value = '';
      changed(false);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (isLen ? (state.unit === 'in' ? 0.0625 : state.unit === 'cm' ? 0.1 : 1) : p.step || 1);
      const cur = parseFloat(input.value || input.placeholder) || 0;
      const next = Math.round((cur + (e.key === 'ArrowUp' ? step : -step)) * 10000) / 10000;
      input.value = String(next);
      input.dispatchEvent(new Event('input'));
    });
    wrap.append(
      el('label', { for: id }, p.label, p.auto ? el('span', { class: 'opt', text: ' optional' }) : null),
      el('div', { class: 'input-unit' }, input, u ? el('span', { class: 'unit', text: u }) : null),
      err,
    );
  }
  if (p.help) wrap.append(el('div', { class: 'hint', id: `${id}-hint`, text: p.help }));
  if (!visible(p)) wrap.hidden = true;
  return wrap;
}

function section(title, nodes, { open = true, id } = {}) {
  const d = el('details', { class: 'sect', open, id });
  d.append(el('summary', { text: title }), el('div', { class: 'sect-body' }, nodes));
  return d;
}

function buildControls() {
  controls.textContent = '';
  // presets
  if (tpl.presets?.length) {
    const sel = el('select', { id: 'preset', 'aria-label': 'Size preset' });
    sel.append(el('option', { value: '', text: 'Custom size…' }));
    tpl.presets.forEach((pr, i) => sel.append(el('option', { value: String(i), selected: state.preset === String(i), text: pr.name })));
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      const pr = tpl.presets[+sel.value];
      state.values = { ...defaults(tpl), ...pr.values };
      state.preset = sel.value;
      buildControls();
      changed(true);
      track('preset_select', { template: tpl.id, preset: pr.name });
    });
    controls.append(el('div', { class: 'field preset' }, el('label', { for: 'preset', text: 'Size preset' }), sel));
  }
  // units + inside/outside
  const unitSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Units' });
  for (const u of ['mm', 'cm', 'in']) {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(state.unit === u), class: state.unit === u ? 'on' : '', text: u });
    b.addEventListener('click', () => {
      state.unit = u;
      prefs.unit = u;
      storage.set('df:prefs', prefs);
      buildControls();
      changed(true);
    });
    unitSeg.append(b);
  }
  const head = el('div', { class: 'ctl-head' }, unitSeg);
  if (tpl.dimMode) {
    const dm = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Dimension type' });
    for (const [v, label] of [
      ['inner', 'Inside'],
      ['outer', 'Outside'],
    ]) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(state.dimMode === v), class: state.dimMode === v ? 'on' : '', text: label, title: `${label} dimensions` });
      b.addEventListener('click', () => {
        state.dimMode = v;
        buildControls();
        changed(true);
      });
      dm.append(b);
    }
    head.append(dm);
  }
  controls.append(head);

  const groups = {};
  for (const p of tpl.params) (groups[p.group || 'Dimensions'] ||= []).push(p);
  for (const [g, ps] of Object.entries(groups)) controls.append(section(g, ps.map(field), { open: g !== 'Advanced' && g !== 'Seals' }));

  // material
  const matNodes = [];
  if (usesCaliper(tpl)) {
    const sel = el('select', { id: 'f-material' });
    let matched = false;
    for (const o of material.options) {
      const on = Math.abs(o.value - state.t) < 1e-6;
      matched ||= on;
      sel.append(el('option', { value: String(o.value), selected: on, text: o.label }));
    }
    sel.append(el('option', { value: 'custom', selected: !matched, text: 'Custom caliper…' }));
    const custom = el('input', { id: 'f-caliper', type: 'text', inputmode: 'decimal', value: toUnit(state.t, 'mm'), 'aria-label': 'Custom caliper in mm' });
    const customWrap = el('div', { class: 'input-unit', hidden: matched }, custom, el('span', { class: 'unit', text: 'mm' }));
    sel.addEventListener('change', () => {
      if (sel.value === 'custom') {
        customWrap.hidden = false;
        custom.focus();
        return;
      }
      customWrap.hidden = true;
      state.t = parseFloat(sel.value);
      changed(true);
    });
    custom.addEventListener('input', () => {
      const v = parseFloat(custom.value.replace(',', '.'));
      if (Number.isFinite(v) && v >= 0 && v <= 15) {
        state.t = v;
        changed(true);
      }
    });
    matNodes.push(el('div', { class: 'field' }, el('label', { for: 'f-material', text: material.label }), sel, customWrap));
    matNodes.push(el('div', { class: 'hint', text: 'Panel sizes are compensated for board thickness so the finished box matches your dimensions.' }));
    controls.append(section('Material', matNodes));
  }

  // print settings
  const num = (key, label, unitLabel, min, max, help) => {
    const id = `g-${key}`;
    const isLen = unitLabel === 'len';
    const input = el('input', { id, type: 'text', inputmode: 'decimal', value: isLen ? toUnit(state[key], state.unit) : String(state[key]) });
    input.addEventListener('input', () => {
      const v = isLen ? fromUnit(input.value, state.unit) : parseFloat(input.value);
      if (!Number.isFinite(v) || v < min || v > max) return input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-invalid', 'false');
      state[key] = v;
      prefs[key] = v;
      storage.set('df:prefs', prefs);
      changed(true);
    });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), el('div', { class: 'input-unit' }, input, el('span', { class: 'unit', text: isLen ? state.unit : unitLabel })), help ? el('div', { class: 'hint', text: help }) : null);
  };
  const lw = el('select', { id: 'g-lw' });
  for (const v of [0.25, 0.5, 1]) lw.append(el('option', { value: String(v), selected: state.lineWidth === v, text: `${v} pt${v === 0.25 ? ' (hairline)' : ''}` }));
  lw.addEventListener('change', () => {
    state.lineWidth = parseFloat(lw.value);
    prefs.lineWidth = state.lineWidth;
    storage.set('df:prefs', prefs);
    changed(true);
  });
  const chk = (key, label) => {
    const id = `g-${key}`;
    const input = el('input', { type: 'checkbox', id, checked: state[key] });
    input.addEventListener('change', () => {
      state[key] = input.checked;
      prefs[key] = input.checked;
      storage.set('df:prefs', prefs);
      changed(true);
    });
    return el('div', { class: 'field field-check' }, el('label', { for: id }, input, el('span', { text: label })));
  };
  controls.append(
    section(
      'Print settings',
      [
        num('bleed', 'Bleed', 'len', 0, 25, 'Industry standard: 3 mm / 0.125 in.'),
        num('safe', 'Safe zone', 'len', 0, 25, 'Keep text and logos inside this margin.'),
        el('div', { class: 'field' }, el('label', { for: 'g-lw', text: 'Line weight' }), lw),
        chk('exportLabels', 'Include panel labels'),
        chk('exportDims', 'Include dimensions'),
        chk('infoBlock', 'Include title block & legend'),
      ],
      { open: false },
    ),
  );
}

function refreshVisibility() {
  for (const p of tpl.params) {
    const n = controls.querySelector(`.field[data-key="${p.key}"]`);
    if (n) n.hidden = !visible(p);
  }
}

// ---------------------------------------------------------------- render
function settings() {
  return { t: state.t, dimMode: state.dimMode, bleed: state.bleed, safe: state.safe };
}

function values() {
  const v = {};
  for (const p of tpl.params) v[p.key] = visible(p) || p.type === 'bool' || p.type === 'select' ? state.values[p.key] : p.auto ? null : state.values[p.key];
  return v;
}

function render() {
  let res;
  try {
    res = generate(tpl, values(), settings());
  } catch (e) {
    showMsg(e.message || 'These dimensions cannot be drawn. Try different values.');
    return;
  }
  showMsg('');
  const sheet = compose(res, { unit: state.unit, labels: true, dims: true, infoBlock: false, lineWidth: state.lineWidth, margin: 6, meta: { title: tpl.name } });
  // keep dimension text legible (~11 px on screen) whatever the drawing size
  const vw = viewport.clientWidth || 600;
  const vh = viewport.clientHeight || 400;
  const pxPerMm = Math.max(0.05, Math.min((vw - 32) / sheet.width, (vh - 32) / sheet.height));
  const minSize = 11 / pxPerMm;
  for (const it of sheet.items) if (it.kind === 'text' && it.role === 'dim') it.size = Math.max(it.size, minSize);
  canvas.innerHTML = toSVG(sheet, { preview: true, hidden: [...state.hidden] });
  current = { res, st: stats(res) };
  renderLegend(res);
  renderStats();
  if (view3d) view3d.update(tpl.preview3d(state.values), state.unit);
}

function showMsg(text) {
  msg.textContent = text;
  msg.hidden = !text;
  exportBox.classList.toggle('disabled', !!text);
}

function renderLegend(res) {
  legend.textContent = '';
  for (const key of LAYER_ORDER) {
    if (key === 'info') continue;
    if (!(res.layers[key] || []).length) continue;
    const L = LAYERS[key];
    const on = !state.hidden.has(key);
    const b = el('button', { type: 'button', class: `chip ${on ? '' : 'off'}`, 'aria-pressed': String(on), title: `${on ? 'Hide' : 'Show'} ${L.name} (also excluded from downloads when hidden)` });
    b.append(el('span', { class: `sw sw-${key}`, 'aria-hidden': 'true' }), L.name);
    b.addEventListener('click', () => {
      state.hidden.has(key) ? state.hidden.delete(key) : state.hidden.add(key);
      render();
    });
    legend.append(b);
  }
  const lab = !state.hidden.has('info');
  const b = el('button', { type: 'button', class: `chip ${lab ? '' : 'off'}`, 'aria-pressed': String(lab) }, el('span', { class: 'sw sw-info', 'aria-hidden': 'true' }), 'Labels');
  b.addEventListener('click', () => {
    state.hidden.has('info') ? state.hidden.delete('info') : state.hidden.add('info');
    render();
  });
  legend.append(b);
}

function renderStats() {
  const s = current.st;
  const b = current.res.bounds;
  const u = state.unit;
  const knife = u === 'in' ? `${(s.cutLen / 25.4).toFixed(1)} in` : `${(s.cutLen / 1000).toFixed(2)} m`;
  const crease = u === 'in' ? `${(s.creaseLen / 25.4).toFixed(1)} in` : `${(s.creaseLen / 1000).toFixed(2)} m`;
  exportBox.querySelector('[data-stat="flat"]').textContent = `${fmtLen(s.flatW, u).replace(/ \w+$/, '')} × ${fmtLen(s.flatH, u)}`;
  exportBox.querySelector('[data-stat="bleed"]').textContent = `${fmtLen(b.width, u).replace(/ \w+$/, '')} × ${fmtLen(b.height, u)}`;
  exportBox.querySelector('[data-stat="knife"]').textContent = knife;
  exportBox.querySelector('[data-stat="crease"]').textContent = s.creaseLen ? crease : '—';
  exportBox.querySelector('[data-stat="sheet"]').textContent = fitSheet(b.width, b.height);
}

// ---------------------------------------------------------------- export
function dimsLabel() {
  const parts = [];
  for (const p of tpl.params) {
    if (p.type !== 'length' || p.group || state.values[p.key] === null) continue;
    parts.push(toUnit(state.values[p.key], state.unit));
  }
  return parts.slice(0, 3).join('x') + state.unit;
}

function buildSheet() {
  const res = current.res;
  const u = state.unit;
  const dimsTxt = tpl.params
    .filter((p) => p.type === 'length' && !p.group && state.values[p.key] !== null)
    .slice(0, 4)
    .map((p) => `${p.label} ${fmtLen(state.values[p.key], u)}`)
    .join(' · ');
  const matTxt = !usesCaliper(tpl) ? '' : `Caliper ${fmtLen(state.t, 'mm')} · ${state.dimMode === 'outer' ? 'outside' : 'inside'} dimensions · `;
  const s = current.st;
  const sheet = compose(res, {
    unit: u,
    labels: state.exportLabels,
    dims: state.exportDims,
    infoBlock: state.infoBlock,
    lineWidth: state.lineWidth,
    hidden: [...state.hidden],
    meta: {
      title: `${tpl.name}`,
      subject: `${tpl.name} dieline – ${dimsTxt}`,
      generator: SITE,
      lines: [dimsTxt, `${matTxt}Bleed ${fmtLen(state.bleed, u)} · Safe zone ${fmtLen(state.safe, u)}`, `Flat size ${fmtLen(s.flatW, u)} × ${fmtLen(s.flatH, u)} · Print at 100% scale`, `Generated with ${SITE} · ${location.host || 'dielineforge'} · Verify with a physical sample before production.`],
    },
  });
  return sheet;
}

const EXPORTERS = {
  pdf: { ext: 'pdf', type: 'application/pdf', make: (s) => toPDF(s) },
  ai: { ext: 'ai', type: 'application/pdf', make: (s) => toPDF(s) },
  svg: { ext: 'svg', type: 'image/svg+xml', make: (s) => toSVG(s) },
  dxf: { ext: 'dxf', type: 'application/dxf', make: (s) => toDXF(s) },
  eps: { ext: 'eps', type: 'application/postscript', make: (s) => toEPS(s) },
};

function doExport(fmt) {
  if (!current || exportBox.classList.contains('disabled')) return;
  const ex = EXPORTERS[fmt];
  const data = ex.make(buildSheet());
  const name = `${tpl.id}-${dimsLabel()}-dieline.${ex.ext}`.replace(/[^a-z0-9.\-]+/gi, '-').toLowerCase();
  download(data, name, ex.type);
  track('dieline_download', { template: tpl.id, format: fmt });
  toast(`${fmt.toUpperCase()} downloaded`);
}

function toast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

exportBox.addEventListener('click', (e) => {
  const b = e.target.closest('[data-export]');
  if (b) doExport(b.dataset.export);
});
document.querySelectorAll('[data-export-global]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.exportGlobal)));

const shareBtn = document.getElementById('share');
shareBtn?.addEventListener('click', async () => {
  const url = shareURL();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `${tpl.name} dieline`, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    }
    track('share', { template: tpl.id });
  } catch {
    /* user cancelled */
  }
});

document.getElementById('reset')?.addEventListener('click', () => {
  state.values = defaults(tpl);
  state.preset = '';
  state.dimMode = 'inner';
  state.t = material.default;
  buildControls();
  changed(true);
});

// ---------------------------------------------------------------- zoom/pan
const zoom = { k: 1, x: 0, y: 0 };
function applyZoom() {
  canvas.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})`;
  const z = root.querySelector('#zoom-level');
  if (z) z.textContent = `${Math.round(zoom.k * 100)}%`;
}
function zoomAt(f, cx, cy) {
  const nk = Math.min(20, Math.max(0.3, zoom.k * f));
  const r = viewport.getBoundingClientRect();
  const px = (cx ?? r.width / 2) - zoom.x;
  const py = (cy ?? r.height / 2) - zoom.y;
  zoom.x -= px * (nk / zoom.k - 1);
  zoom.y -= py * (nk / zoom.k - 1);
  zoom.k = nk;
  applyZoom();
}
function fit() {
  zoom.k = 1;
  zoom.x = 0;
  zoom.y = 0;
  applyZoom();
}
viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
const pointers = new Map();
let pinch = null;
viewport.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  viewport.classList.add('grabbing');
});
viewport.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = viewport.getBoundingClientRect();
    if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    pinch = d;
    return;
  }
  zoom.x += e.clientX - prev.x;
  zoom.y += e.clientY - prev.y;
  applyZoom();
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) viewport.classList.remove('grabbing');
};
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('dblclick', fit);
root.querySelector('#zoom-in')?.addEventListener('click', () => zoomAt(1.25));
root.querySelector('#zoom-out')?.addEventListener('click', () => zoomAt(0.8));
root.querySelector('#zoom-fit')?.addEventListener('click', fit);

// ---------------------------------------------------------------- 2D / 3D
let view3d = null;
const tab2d = root.querySelector('#view-2d');
const tab3d = root.querySelector('#view-3d');
const stage3d = root.querySelector('#stage3d');
if (tpl.preview3d && tab3d && stage3d) {
  tab3d.hidden = false;
  const setView = (is3d) => {
    tab2d.setAttribute('aria-selected', String(!is3d));
    tab3d.setAttribute('aria-selected', String(is3d));
    viewport.hidden = is3d;
    stage3d.hidden = !is3d;
    root.classList.toggle('is-3d', is3d);
    if (is3d) {
      if (!view3d) view3d = mount3D(stage3d);
      view3d.update(tpl.preview3d(state.values), state.unit);
      track('view_3d', { template: tpl.id });
    }
  };
  tab2d.addEventListener('click', () => setView(false));
  tab3d.addEventListener('click', () => setView(true));
}

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === '+' || e.key === '=') zoomAt(1.25);
  else if (e.key === '-') zoomAt(0.8);
  else if (e.key === '0') fit();
});

// ---------------------------------------------------------------- boot
const renderSoon = debounce(render, 50);
function changed(immediate) {
  refreshVisibility();
  syncURL();
  immediate ? render() : renderSoon();
}

buildControls();
render();
root.classList.add('ready');
if ('ResizeObserver' in window) {
  let last = viewport.clientWidth;
  new ResizeObserver(
    debounce(() => {
      if (Math.abs(viewport.clientWidth - last) < 40 || viewport.hidden) return;
      last = viewport.clientWidth;
      render();
    }, 200),
  ).observe(viewport);
}
