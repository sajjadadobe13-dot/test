/**
 * Turns a resolved dieline into a page of drawing primitives shared by every
 * exporter and by the on-screen preview. Page space: mm, origin top-left.
 */
import { dist, totalLength } from '../geometry.js';

export const PT = 25.4 / 72; // 1 pt in mm

/**
 * Layer definitions follow common printer specs: every die element is a
 * separate named spot colour on its own non-printing layer, set to overprint.
 */
export const LAYERS = {
  glue: { name: 'Glue & Seal', spot: 'Glue', cmyk: [0, 0.1, 1, 0], color: '#f5c400', aci: 2, fill: 0.25, dash: [1.5, 1] },
  bleed: { name: 'Bleed', spot: 'Bleed', cmyk: [0.75, 0, 1, 0], color: '#00a651', aci: 3 },
  safe: { name: 'Safe Zone', spot: 'Safe Zone', cmyk: [0, 0.45, 1, 0], color: '#f7941d', aci: 30, dash: [2, 1.5] },
  guide: { name: 'Guides', spot: 'Guide', cmyk: [0, 0, 0, 0.5], color: '#8a8f98', aci: 8, dash: [1, 1] },
  crease: { name: 'Crease', spot: 'Crease', cmyk: [1, 0, 0, 0], color: '#00aeef', aci: 5, dash: [3, 2] },
  perf: { name: 'Perforation', spot: 'Perforation', cmyk: [0, 1, 0, 0], color: '#ec008c', aci: 6, dash: [1, 1] },
  cut: { name: 'Cut', spot: 'CutContour', cmyk: [0, 1, 0, 0], color: '#ec008c', aci: 1 },
  info: { name: 'Annotations', spot: 'Dieline Info', cmyk: [0, 0, 0, 0.7], color: '#4b5563', aci: 7 },
};
export const LAYER_ORDER = ['glue', 'bleed', 'safe', 'guide', 'crease', 'perf', 'cut', 'info'];

export const UNITS = {
  mm: { f: 1, label: 'mm', dp: 1 },
  cm: { f: 10, label: 'cm', dp: 2 },
  in: { f: 25.4, label: 'in', dp: 3 },
};

export function fmtLen(mm, unit = 'mm') {
  const u = UNITS[unit] || UNITS.mm;
  const v = mm / u.f;
  const s = v.toFixed(u.dp).replace(/\.?0+$/, '');
  return `${s} ${u.label}`;
}

/**
 * opts: { unit, margin, labels, dims, infoBlock, meta: { title, lines: [] }, lineWidth (pt) }
 */
export function compose(res, opts = {}) {
  const { unit = 'mm', margin = 10, labels = true, dims = true, infoBlock = true, lineWidth = 0.5, meta = {}, hidden = [] } = opts;
  const b = res.bounds;
  const blockH = infoBlock ? 34 : 0;
  const drawW = b.width;
  const width = Math.max(drawW + margin * 2, infoBlock ? 190 : 0);
  const height = b.height + margin * 2 + blockH;
  const ox = (width - drawW) / 2 - b.minX;
  const oy = margin - b.minY;
  const tp = (pts) => pts.map(([x, y]) => [x + ox, y + oy]);
  const items = [];
  for (const key of LAYER_ORDER) {
    if (key === 'info') continue;
    for (const l of res.layers[key] || []) items.push({ layer: key, kind: 'path', pts: tp(l.pts), closed: l.closed });
  }
  const textSize = (mm) => Math.max(2, Math.min(mm, 14));
  if (labels) {
    for (const p of res.panels) {
      if (!p.label) continue;
      const w = p.b.width;
      const h = p.b.height;
      const vertical = Math.abs(p.angle) === 90;
      const span = vertical ? h : w;
      const other = vertical ? w : h;
      const size = textSize(Math.min(span / (p.label.length * 0.75), other * 0.22));
      if (size < 2.2) continue;
      const ar = (p.angle * Math.PI) / 180;
      // place the baseline so the text is optically centred in the panel
      const bx = p.c[0] + ox - Math.sin(ar) * size * 0.35;
      const by = p.c[1] + oy + Math.cos(ar) * size * 0.35;
      items.push({ layer: 'info', kind: 'text', x: bx, y: by, size, text: p.label, angle: p.angle, anchor: 'middle', role: 'label' });
    }
  }
  if (dims) {
    for (const d of res.dims) {
      const a = [d.a[0] + ox, d.a[1] + oy];
      const c = [d.b[0] + ox, d.b[1] + oy];
      const L = dist(a, c);
      if (L < 4) continue;
      const ux = (c[0] - a[0]) / L;
      const uy = (c[1] - a[1]) / L;
      const nx = uy;
      const ny = -ux;
      const off = d.offset || 0;
      const A = [a[0] + nx * off, a[1] + ny * off];
      const B = [c[0] + nx * off, c[1] + ny * off];
      const tick = 1.6;
      items.push({ layer: 'info', kind: 'path', pts: [A, B], closed: false, role: 'dim' });
      for (const P of [A, B]) items.push({ layer: 'info', kind: 'path', pts: [[P[0] + nx * tick, P[1] + ny * tick], [P[0] - nx * tick, P[1] - ny * tick]], closed: false, role: 'dim' });
      // arrow heads
      const ah = Math.min(2, L / 6);
      items.push({ layer: 'info', kind: 'path', pts: [[A[0] + ux * ah + nx * ah * 0.4, A[1] + uy * ah + ny * ah * 0.4], A, [A[0] + ux * ah - nx * ah * 0.4, A[1] + uy * ah - ny * ah * 0.4]], closed: false, role: 'dim' });
      items.push({ layer: 'info', kind: 'path', pts: [[B[0] - ux * ah + nx * ah * 0.4, B[1] - uy * ah + ny * ah * 0.4], B, [B[0] - ux * ah - nx * ah * 0.4, B[1] - uy * ah - ny * ah * 0.4]], closed: false, role: 'dim' });
      let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
      if (ang > 90.01) ang -= 180;
      if (ang <= -90.01) ang += 180;
      const size = Math.max(2, Math.min(3.2, L / 8));
      const ar = (ang * Math.PI) / 180;
      // text "up" vector for a glyph rotated by ang (y-down space)
      const tx = (A[0] + B[0]) / 2 + Math.sin(ar) * 0.9;
      const ty = (A[1] + B[1]) / 2 - Math.cos(ar) * 0.9;
      items.push({ layer: 'info', kind: 'text', x: tx, y: ty, size, text: fmtLen(L, unit), angle: ang, anchor: 'middle', role: 'dim' });
    }
  }
  if (infoBlock) {
    const y0 = height - blockH + 4;
    const x0 = margin;
    const right = width - margin;
    items.push({ layer: 'info', kind: 'path', pts: [[x0, y0 - 2], [right, y0 - 2]], closed: false, role: 'block' });
    items.push({ layer: 'info', kind: 'text', x: x0, y: y0 + 4.5, size: 4.2, text: meta.title || 'Dieline', anchor: 'start', weight: 'bold', role: 'block' });
    (meta.lines || []).slice(0, 4).forEach((ln, i) => items.push({ layer: 'info', kind: 'text', x: x0, y: y0 + 10.5 + i * 4.6, size: 2.9, text: ln, anchor: 'start', role: 'block' }));
    // legend
    const legend = ['cut', 'crease', 'perf', 'bleed', 'safe', 'glue', 'guide'].filter((k) => (res.layers[k] || []).length && !hidden.includes(k));
    const colW = 34;
    const lx0 = Math.max(x0 + 95, right - colW * 2);
    legend.forEach((k, i) => {
      const col = Math.floor(i / 4);
      const row = i % 4;
      const lx = lx0 + col * colW;
      const ly = y0 + 3 + row * 5;
      items.push({ layer: k, kind: 'path', pts: [[lx, ly], [lx + 8, ly]], closed: false, role: 'legend' });
      items.push({ layer: 'info', kind: 'text', x: lx + 10, y: ly + 1.1, size: 2.8, text: `${LAYERS[k].name}`, anchor: 'start', role: 'block' });
    });
  }
  return {
    width,
    height,
    items: hidden.length ? items.filter((i) => !hidden.includes(i.layer)) : items,
    lineWidth,
    meta,
    trim: { x: ox + res.cutBounds.minX, y: oy + res.cutBounds.minY, w: res.cutBounds.width, h: res.cutBounds.height },
  };
}

/** Summary numbers for the UI / info block. */
export function stats(res) {
  return {
    flatW: res.cutBounds.width,
    flatH: res.cutBounds.height,
    cutLen: totalLength([...(res.layers.cut || []), ...(res.layers.perf || [])]),
    creaseLen: totalLength(res.layers.crease || []),
  };
}
