import { Dieline, rect, roundRect, circle, union, offset, onEdge, taper } from '../geometry.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Resolve "auto" params: value null/undefined/'' -> computed fallback. */
export function pick(v, fallback) {
  return v === null || v === undefined || v === '' || Number.isNaN(v) ? fallback : Number(v);
}

/**
 * Lay out a horizontal strip of panels (body of a carton / sleeve).
 * Adds one solid piece, vertical creases between panels and labelled panels.
 * Returns panel x-ranges.
 */
export function strip(d, widths, H, labels, { y = 0, safe = true } = {}) {
  const xs = [];
  let x = 0;
  for (const w of widths) {
    xs.push({ x0: x, x1: x + w, w });
    x += w;
  }
  d.piece(rect(0, y, x, H));
  for (let i = 1; i < xs.length; i++) d.crease([xs[i].x0, y], [xs[i].x0, y + H]);
  xs.forEach((p, i) => labels[i] && d.panel(rect(p.x0, y, p.w, H), labels[i], { safe }));
  return xs;
}

/** Tapered glue flap on the left edge of the strip (x = 0). */
export function glueFlapLeft(d, y0, y1, g, { glue = true } = {}) {
  const H = y1 - y0;
  const inset = Math.min(g * 0.6, H * 0.18);
  const poly = onEdge([0, y1], [0, y0], taper(H, g, inset, inset));
  d.flap([0, y1], [0, y0], taper(H, g, inset, inset));
  if (glue && g > 4) {
    const zone = offset([poly], -1.5)[0];
    if (zone) d.glueArea(zone);
  }
}

/** Euro (sombrero) hang slot or round hole, centred at (cx, cy). */
export function hangHole(cx, cy, style = 'euro') {
  if (style === 'round') return circle(cx, cy, 3.5);
  const slot = roundRect(cx - 15, cy - 2.25, 30, 4.5, 2.25);
  const top = circle(cx, cy - 2.6, 4.5);
  return union([slot, top])[0];
}

export function newDieline() {
  return new Dieline();
}

export const fmt = (v) => (Math.round(v * 10) / 10).toString();

/** Overall width (below) and height (right) dimensions outside the bleed. */
export function outerDims(d, x0, y0, x1, y1, gap = 9) {
  d.dim([x0, y1], [x1, y1], -gap);
  d.dim([x1, y0], [x1, y1], gap);
}
