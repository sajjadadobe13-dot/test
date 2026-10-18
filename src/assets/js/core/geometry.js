/**
 * Geometry core for DielineForge.
 *
 * All coordinates are millimetres, origin top-left, y axis pointing down.
 * Every curve is flattened to polylines at build time (0.02 mm tolerance),
 * which keeps every exporter (SVG, PDF/AI, EPS, DXF) simple and identical.
 *
 * A template builds a `Dieline`: a set of solid "pieces" (panels and flaps)
 * whose union is the knife outline, plus explicit crease / cut / perforation
 * / guide lines, glue & seal areas, labelled panels and dimension callouts.
 */

const TOL = 0.02; // mm flattening tolerance
const SCALE = 1000; // clipper integer scale (1 unit = 1 µm)

function clipper() {
  const lib = globalThis.ClipperLib;
  if (!lib) throw new Error('ClipperLib is not loaded');
  return lib;
}

// ---------------------------------------------------------------- vectors
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const unit = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ------------------------------------------------------------------ curves
function segCount(r, sweep) {
  if (r <= TOL) return 1;
  const step = 2 * Math.acos(Math.max(-1, 1 - TOL / r));
  return Math.max(2, Math.ceil(Math.abs(sweep) / step));
}

/** Points along a circular arc (angles in radians, y-down screen space). */
export function arcPoints(cx, cy, r, a0, a1, includeStart = true) {
  const n = segCount(r, a1 - a0);
  const pts = [];
  for (let i = includeStart ? 0 : 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Full circle polygon (closed implicitly). */
export function circle(cx, cy, r) {
  const pts = arcPoints(cx, cy, r, 0, Math.PI * 2);
  pts.pop();
  return pts;
}

/** Ellipse polygon. */
export function ellipse(cx, cy, rx, ry) {
  const n = segCount(Math.max(rx, ry), Math.PI * 2);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** Arc through two end points with a given sagitta (bulge, + bulges left of p1→p2). */
export function bulgeArc(p1, p2, sagitta, includeStart = true) {
  const c = dist(p1, p2);
  if (Math.abs(sagitta) < 1e-6 || c < 1e-6) return includeStart ? [p1, p2] : [p2];
  const s = Math.abs(sagitta);
  const r = (c * c) / (8 * s) + s / 2;
  const mid = lerp(p1, p2, 0.5);
  const d = unit(sub(p2, p1));
  // left normal in y-down space (for left→right travel this points up)
  const nl = [d[1], -d[0]];
  const sign = sagitta > 0 ? 1 : -1;
  const centre = add(mid, mul(nl, -sign * (r - s)));
  let a0 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
  let a1 = Math.atan2(p2[1] - centre[1], p2[0] - centre[0]);
  // choose the sweep direction that passes through the bulge apex
  const apex = add(mid, mul(nl, sign * s));
  const aa = Math.atan2(apex[1] - centre[1], apex[0] - centre[0]);
  const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccwSweep = norm(a1 - a0);
  const apexOnCcw = norm(aa - a0) < ccwSweep;
  if (apexOnCcw) a1 = a0 + ccwSweep;
  else a1 = a0 - norm(a0 - a1);
  const pts = arcPoints(centre[0], centre[1], r, a0, a1, includeStart);
  pts[pts.length - 1] = p2.slice();
  if (includeStart) pts[0] = p1.slice();
  return pts;
}

/**
 * Round the corners of a polygon / polyline.
 * radii: number (all vertices) or array aligned with vertices (0 = sharp).
 */
export function fillet(points, radii, closed = true) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Array.isArray(radii) ? radii[i] || 0 : radii;
    const p = points[i];
    if (!r || (!closed && (i === 0 || i === n - 1))) {
      out.push(p);
      continue;
    }
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const v1 = unit(sub(prev, p));
    const v2 = unit(sub(next, p));
    const cosA = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1]));
    const ang = Math.acos(cosA);
    if (ang < 1e-3 || Math.PI - ang < 1e-3) {
      out.push(p);
      continue;
    }
    let t = r / Math.tan(ang / 2);
    const maxT = Math.min(dist(prev, p), dist(next, p)) * 0.5;
    let rr = r;
    if (t > maxT) {
      t = maxT;
      rr = t * Math.tan(ang / 2);
    }
    const s = add(p, mul(v1, t));
    const e = add(p, mul(v2, t));
    const bis = unit(add(v1, v2));
    const cd = rr / Math.sin(ang / 2);
    const c = add(p, mul(bis, cd));
    let a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    let a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    out.push(...arcPoints(c[0], c[1], rr, a0, a0 + sweep));
  }
  return out;
}

export function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function roundRect(x, y, w, h, r) {
  return r > 0 ? fillet(rect(x, y, w, h), Math.min(r, w / 2, h / 2)) : rect(x, y, w, h);
}

/**
 * Map a flap profile onto an edge. Profile coordinates are (u, v):
 * u runs along the edge from p1 (0) to p2 (edge length), v is the distance
 * away from the edge. Travelling a panel clockwise on screen (top edge
 * left→right, right edge top→bottom …) makes +v point outward.
 */
export function onEdge(p1, p2, profile) {
  const t = unit(sub(p2, p1));
  const n = [t[1], -t[0]];
  return profile.map(([u, v]) => [p1[0] + t[0] * u + n[0] * v, p1[1] + t[1] * u + n[1] * v]);
}

// ----------------------------------------------------------- flap profiles
/** Trapezoid flap: insets a (start) and b (end) at the far edge. */
export function taper(L, h, a, b = a, r = 0) {
  a = Math.min(a, L / 2 - 0.01);
  b = Math.min(b, L / 2 - 0.01);
  const pts = [
    [0, 0],
    [a, h],
    [L - b, h],
    [L, 0],
  ];
  return r ? fillet(pts, [0, r, r, 0]) : pts;
}

/** Rectangular flap with optional rounded outer corners. */
export function rectFlap(L, h, r = 0) {
  const pts = [
    [0, 0],
    [0, h],
    [L, h],
    [L, 0],
  ];
  return r ? fillet(pts, [0, r, r, 0]) : pts;
}

/** Tuck flap: 45° shoulder relief at the base, rounded tip corners. */
export function tuckFlap(L, h, r, relief = 1) {
  relief = Math.min(relief, L / 4, h / 4);
  r = Math.min(r, (L - 2 * relief) / 2 - 0.01, h - relief - 0.01);
  const pts = [
    [0, 0],
    [relief, relief],
    [relief, h],
    [L - relief, h],
    [L - relief, relief],
    [L, 0],
  ];
  return fillet(pts, [0, 0, r, r, 0, 0]);
}

/**
 * Dust flap: relief gap g on the start side, tapered free side.
 * `side` = 'start' | 'end' tells which end faces the closure panel.
 */
export function dustFlap(L, h, side = 'start', g = 1.5, r = 3) {
  const tf = Math.min(L * 0.3, h * 0.6);
  g = Math.min(g, h / 3);
  const pts =
    side === 'start'
      ? [[0, 0], [g, g], [g, h], [L - tf, h], [L, 0]]
      : side === 'end'
        ? [[0, 0], [tf, h], [L - g, h], [L - g, g], [L, 0]]
        : [[0, 0], [g, g], [g, h], [L - g, h], [L - g, g], [L, 0]];
  // round the far corners only
  const radii = pts.map((p) => (Math.abs(p[1] - h) < 1e-9 ? r : 0));
  return fillet(pts, radii);
}

// ------------------------------------------------------------ the dieline
export class Dieline {
  constructor() {
    this.pieces = []; // closed polygons, unioned into the knife outline
    this.cuts = []; // extra knife lines (open or closed) e.g. slits, holes
    this.holes = []; // closed internal cut-outs (windows, hang holes)
    this.creases = []; // fold / score lines
    this.perfs = []; // perforations / tear lines
    this.guides = []; // non-cutting guides: seal edges, zipper, eyemark
    this.glue = []; // closed polygons: glue / seal zones
    this.panels = []; // { poly, label, angle, safe }
    this.dims = []; // { a, b, offset }  (label = measured length)
    this.subtracts = []; // closed polygons removed from the outline (notches)
    this.info = {}; // free-form metadata
  }
  notch(poly) {
    this.subtracts.push(poly);
    return this;
  }
  piece(poly) {
    this.pieces.push(poly);
    return this;
  }
  /** Attach a flap profile to an edge and crease the base. */
  flap(p1, p2, profile, { crease = true } = {}) {
    this.pieces.push(onEdge(p1, p2, profile));
    if (crease) this.creases.push([p1.slice(), p2.slice()]);
    return this;
  }
  crease(...pts) {
    this.creases.push(pts);
    return this;
  }
  cut(...pts) {
    this.cuts.push(pts);
    return this;
  }
  perf(...pts) {
    this.perfs.push(pts);
    return this;
  }
  guide(...pts) {
    this.guides.push(pts);
    return this;
  }
  hole(poly) {
    this.holes.push(poly);
    return this;
  }
  glueArea(poly) {
    this.glue.push(poly);
    return this;
  }
  panel(poly, label, { angle = 0, safe = true } = {}) {
    this.panels.push({ poly, label, angle, safe });
    return this;
  }
  dim(a, b, offset = 0) {
    this.dims.push({ a, b, offset });
    return this;
  }
}

// ------------------------------------------------------------ clipper ops
const toC = (poly) => poly.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const fromC = (path) => path.map((p) => [p.X / SCALE, p.Y / SCALE]);

export function union(polys) {
  const C = clipper();
  const c = new C.Clipper();
  // consistent orientation so touching pieces merge along shared edges
  const oriented = polys.map((p) => (polyArea(p) < 0 ? p.slice().reverse() : p));
  c.AddPaths(oriented.map(toC), C.PolyType.ptSubject, true);
  const sol = new C.Paths();
  c.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const cleaned = C.Clipper.CleanPolygons(sol, 2);
  return cleaned.filter((p) => p.length > 2).map(fromC);
}

export function difference(subject, clip) {
  if (!clip.length) return subject;
  const C = clipper();
  const c = new C.Clipper();
  c.AddPaths(subject.map(toC), C.PolyType.ptSubject, true);
  c.AddPaths(clip.map(toC), C.PolyType.ptClip, true);
  const sol = new C.Paths();
  c.Execute(C.ClipType.ctDifference, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.Clipper.CleanPolygons(sol, 2)
    .filter((p) => p.length > 2)
    .map(fromC);
}

export function intersect(subject, clip) {
  const C = clipper();
  const c = new C.Clipper();
  c.AddPaths(subject.map(toC), C.PolyType.ptSubject, true);
  c.AddPaths(clip.map(toC), C.PolyType.ptClip, true);
  const sol = new C.Paths();
  c.Execute(C.ClipType.ctIntersection, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.Clipper.CleanPolygons(sol, 2)
    .filter((p) => p.length > 2)
    .map(fromC);
}

export function offset(polys, delta, join = 'miter') {
  const C = clipper();
  const jt = join === 'round' ? C.JoinType.jtRound : join === 'square' ? C.JoinType.jtSquare : C.JoinType.jtMiter;
  const co = new C.ClipperOffset(2, TOL * SCALE);
  co.AddPaths(polys.map(toC), jt, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return C.Clipper.CleanPolygons(out, 2)
    .filter((p) => p.length > 2)
    .map(fromC);
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(poly) {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * f;
    y += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = boundsOf([poly]);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  return [x / (3 * a), y / (3 * a)];
}

export function boundsOf(lists) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of lists)
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Resolve a Dieline into final, export-ready layers.
 * opts: { bleed, safe }  (mm)
 */
export function resolve(d, { bleed = 3, safe = 3 } = {}) {
  // grow → merge → shrink by a few microns: welds pieces that touch along
  // edges (Clipper does not always merge T-junction contacts on its own)
  const EPS = 0.005;
  const outline = difference(offset(offset(d.pieces, EPS), -EPS), d.subtracts);
  const bleedLines = bleed > 0 ? offset(outline, bleed, 'miter') : [];
  const safeLines = [];
  if (safe > 0)
    for (const p of d.panels) if (p.safe) safeLines.push(...offset([p.poly], -safe, 'miter'));
  const all = [...outline, ...bleedLines, ...d.cuts, ...d.holes, ...d.creases, ...d.perfs, ...d.guides];
  // dimension lines placed outside the outline must fit on the sheet too
  const dimPts = [];
  for (const dm of d.dims) {
    if (!dm.offset) continue;
    const L = dist(dm.a, dm.b) || 1;
    const n = [(dm.b[1] - dm.a[1]) / L, -(dm.b[0] - dm.a[0]) / L];
    const k = dm.offset + Math.sign(dm.offset) * 4;
    dimPts.push([add(dm.a, mul(n, k)), add(dm.b, mul(n, k))]);
  }
  const bounds = boundsOf(all.length ? [...all, ...dimPts] : [[[0, 0]]]);
  const cutBounds = boundsOf(outline.length ? outline : [[[0, 0]]]);
  return {
    layers: {
      cut: [...outline.map((p) => ({ pts: p, closed: true })), ...d.holes.map((p) => ({ pts: p, closed: true })), ...d.cuts.map((p) => ({ pts: p, closed: false }))],
      crease: d.creases.map((p) => ({ pts: p, closed: false })),
      perf: d.perfs.map((p) => ({ pts: p, closed: false })),
      bleed: bleedLines.map((p) => ({ pts: p, closed: true })),
      safe: safeLines.map((p) => ({ pts: p, closed: true })),
      guide: d.guides.map((p) => ({ pts: p, closed: false })),
      glue: d.glue.map((p) => ({ pts: p, closed: true })),
    },
    panels: d.panels.map((p) => ({ ...p, c: centroid(p.poly), b: boundsOf([p.poly]) })),
    dims: d.dims,
    bounds,
    cutBounds,
    info: d.info,
  };
}

/** Length of all knife lines (useful for die-board quotes). */
export function totalLength(lines) {
  let L = 0;
  for (const { pts, closed } of lines) {
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
  }
  return L;
}
