import { rect, roundRect, rectFlap, tuckFlap, dustFlap, taper, bulgeArc, circle, offset, onEdge, fillet } from '../geometry.js';
import { newDieline, strip, glueFlapLeft, hangHole, pick, clamp } from './helpers.js';

/** Panel allowance: inside dims grow by one caliper per panel, outside dims shrink. */
const allow = (p) => (p.dimMode === 'outer' ? -p.t : p.t);

const LWD = (L, W, D, labels = {}) => [
  { key: 'L', label: labels.L || 'Length', type: 'length', default: L, min: 10, max: 2000, help: 'Front panel width (left to right).' },
  { key: 'W', label: labels.W || 'Width', type: 'length', default: W, min: 5, max: 2000, help: 'Side panel width (front to back).' },
  { key: 'D', label: labels.D || 'Depth', type: 'length', default: D, min: 5, max: 2000, help: 'Height of the box body.' },
];

const tuckParams = [
  { key: 'tuck', label: 'Tuck flap', type: 'length', auto: true, min: 3, max: 200, group: 'Advanced', help: 'Depth of the tuck-in flap. Leave empty for automatic.' },
  { key: 'dust', label: 'Dust flap', type: 'length', auto: true, min: 3, max: 400, group: 'Advanced', help: 'Height of the side dust flaps.' },
  { key: 'glue', label: 'Glue flap', type: 'length', auto: true, min: 5, max: 60, group: 'Advanced', help: 'Width of the side-seam glue flap.' },
];

const optionParams = [
  { key: 'hangTab', label: 'Hang tab (euro slot header)', type: 'bool', default: false, group: 'Options' },
  { key: 'hangStyle', label: 'Hang hole', type: 'select', default: 'euro', options: [{ value: 'euro', label: 'Euro slot' }, { value: 'round', label: 'Round Ø7' }], group: 'Options', showIf: 'hangTab' },
  { key: 'header', label: 'Header height', type: 'length', default: 35, min: 15, max: 150, group: 'Options', showIf: 'hangTab' },
  { key: 'window', label: 'Front window cut-out', type: 'bool', default: false, group: 'Options' },
  { key: 'windowMargin', label: 'Window margin', type: 'length', auto: true, min: 3, max: 200, group: 'Options', showIf: 'window' },
];

/** Relief side for a dust flap given whether its start / end neighbour has a flap standing beside it. */
const reliefSide = (s, e) => (s && e ? 'both' : s ? 'start' : e ? 'end' : 'both');

function tuckEnd(p, mode) {
  const d = newDieline();
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + a;
  const g = Math.min(pick(p.glue, clamp(Wp * 0.3, 8, 18)), Wp - 2);
  const T = Math.min(pick(p.tuck, clamp(Wp * 0.55, 8, 40)), Dp * 0.8);
  const dh = pick(p.dust, Math.min(Lp * 0.45, Wp));
  const r = Math.min(T * 0.45, 8);
  const xs = strip(d, [Lp, Wp, Lp, Wp], Dp, ['FRONT', 'SIDE', 'BACK', 'SIDE']);
  glueFlapLeft(d, 0, Dp, g);

  const hang = !!p.hangTab;
  const topP = hang ? 0 : 2;
  const botP = mode === 'straight' ? topP : topP === 0 ? 2 : 0;

  // top closure + tuck
  const t0 = xs[topP];
  d.flap([t0.x0, 0], [t0.x1, 0], rectFlap(Lp, Wp));
  d.flap([t0.x0, -Wp], [t0.x1, -Wp], tuckFlap(Lp, T, r, 1));
  d.panel(rect(t0.x0, -Wp, Lp, Wp), 'TOP', { angle: 180 });

  // bottom closure + tuck (edges run right→left so flaps point down)
  const b0 = xs[botP];
  d.flap([b0.x1, Dp], [b0.x0, Dp], rectFlap(Lp, Wp));
  d.flap([b0.x1, Dp + Wp], [b0.x0, Dp + Wp], tuckFlap(Lp, T, r, 1));
  d.panel(rect(b0.x0, Dp, Lp, Wp), 'BOTTOM');

  const topOcc = [topP === 0, false, topP === 2 || hang, false];
  const botOcc = [botP === 0, false, botP === 2, false];
  for (const i of [1, 3]) {
    const { x0, x1 } = xs[i];
    const sTop = topOcc[i - 1];
    const eTop = i + 1 < 4 ? topOcc[i + 1] : false;
    d.flap([x0, 0], [x1, 0], dustFlap(Wp, dh, reliefSide(sTop, eTop)));
    const sBot = i + 1 < 4 ? botOcc[i + 1] : false;
    const eBot = botOcc[i - 1];
    d.flap([x1, Dp], [x0, Dp], dustFlap(Wp, dh, reliefSide(sBot, eBot)));
  }

  if (hang) {
    const h = xs[2];
    const H = pick(p.header, 35);
    d.flap([h.x0, 0], [h.x1, 0], rectFlap(Lp, H, Math.min(6, H / 3)));
    d.panel(rect(h.x0, -H, Lp, H), 'HEADER', { safe: false });
    d.hole(hangHole(h.x0 + Lp / 2, -H + clamp(H * 0.35, 8, 16), p.hangStyle));
  }
  if (p.window) {
    const m = pick(p.windowMargin, clamp(Math.min(Lp, Dp) * 0.2, 5, 40));
    if (Lp - 2 * m > 4 && Dp - 2 * m > 4) d.hole(roundRect(xs[0].x0 + m, m, Lp - 2 * m, Dp - 2 * m, 4));
  }
  d.dim([xs[0].x0, Dp * 0.85], [xs[0].x1, Dp * 0.85]);
  d.dim([xs[1].x0, Dp * 0.85], [xs[1].x1, Dp * 0.85]);
  d.dim([xs[2].x0 + Lp * 0.12, 0], [xs[2].x0 + Lp * 0.12, Dp]);
  return d;
}

function sealEnd(p) {
  const d = newDieline();
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + a;
  const g = Math.min(pick(p.glue, clamp(Wp * 0.3, 8, 18)), Wp - 2);
  const o = pick(p.overlap, clamp(Wp * 0.12, 3, 15));
  const hm = Wp / 2 + o;
  const hn = pick(p.dust, Math.min(Lp * 0.42, Wp * 0.8));
  const xs = strip(d, [Lp, Wp, Lp, Wp], Dp, ['FRONT', 'SIDE', 'BACK', 'SIDE']);
  glueFlapLeft(d, 0, Dp, g);
  for (const i of [0, 2]) {
    const { x0, x1 } = xs[i];
    d.flap([x0, 0], [x1, 0], rectFlap(Lp, hm));
    d.flap([x1, Dp], [x0, Dp], rectFlap(Lp, hm));
    if (i === 0) {
      d.glueArea(rect(x0 + 3, -hm + 1.5, Lp - 6, 2 * o));
      d.glueArea(rect(x0 + 3, Dp + hm - 1.5 - 2 * o, Lp - 6, 2 * o));
    }
  }
  for (const i of [1, 3]) {
    const { x0, x1 } = xs[i];
    d.flap([x0, 0], [x1, 0], dustFlap(Wp, hn, i === 1 ? 'both' : 'start'));
    d.flap([x1, Dp], [x0, Dp], dustFlap(Wp, hn, i === 1 ? 'both' : 'end'));
  }
  d.dim([xs[0].x0, Dp * 0.85], [xs[0].x1, Dp * 0.85]);
  d.dim([xs[1].x0, Dp * 0.85], [xs[1].x1, Dp * 0.85]);
  d.dim([xs[2].x0 + Lp * 0.12, 0], [xs[2].x0 + Lp * 0.12, Dp]);
  return d;
}

function sleeve(p) {
  const d = newDieline();
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D;
  const g = Math.min(pick(p.glue, clamp(Wp * 0.3, 8, 18)), Math.max(Wp - 1, 4));
  const xs = strip(d, [Lp, Wp, Lp, Wp], Dp, ['FRONT', 'SIDE', 'BACK', 'SIDE']);
  glueFlapLeft(d, 0, Dp, g);
  if (p.thumb) {
    const r = clamp(Math.min(Lp, Dp) * 0.12, 6, 18);
    for (const i of [0, 2]) {
      const cx = (xs[i].x0 + xs[i].x1) / 2;
      d.notch(circle(cx, 0, r));
      d.notch(circle(cx, Dp, r));
    }
  }
  d.dim([xs[0].x0, Dp * 0.8], [xs[0].x1, Dp * 0.8]);
  d.dim([xs[1].x0, Dp * 0.8], [xs[1].x1, Dp * 0.8]);
  d.dim([xs[2].x0 + Lp * 0.12, 0], [xs[2].x0 + Lp * 0.12, Dp]);
  return d;
}

function mailer(p) {
  const d = newDieline();
  const t = p.t;
  const a = allow(p);
  const Lp = p.L + 2 * a;
  const Wp = p.W + 2 * a;
  const Dp = p.D + a;
  const Wl = Wp + t;
  const tabW = Math.min(Lp * 0.2, 40);
  const tabH = 2 * t + 2;
  const ear = Math.max(5, Math.min(Wp * 0.45 - t, Dp * 1.2));

  d.piece(rect(0, 0, Lp, Wp));
  d.panel(rect(0, 0, Lp, Wp), 'BASE');
  // back wall, lid, lid front tuck
  d.flap([0, 0], [Lp, 0], rectFlap(Lp, Dp));
  d.panel(rect(0, -Dp, Lp, Dp), 'BACK', { angle: 180 });
  d.flap([0, -Dp], [Lp, -Dp], rectFlap(Lp, Wl));
  d.panel(rect(0, -Dp - Wl, Lp, Wl), 'LID', { angle: 180 });
  const lf = Math.max(Dp - 2 * t - 2, 5);
  d.flap([0, -Dp - Wl], [Lp, -Dp - Wl], tuckFlap(Lp, lf, Math.min(8, lf / 2), 2 * t + 1));
  d.panel(rect(0, -Dp - Wl - lf, Lp, lf), 'LID FRONT', { angle: 180, safe: false });
  // lid dust flaps
  const ld = Math.max(Dp - 2 * t - 1, 4);
  d.flap([0, -Dp], [0, -Dp - Wl], dustFlap(Wl, ld, 'both', 2 * t + 1));
  d.flap([Lp, -Dp - Wl], [Lp, -Dp], dustFlap(Wl, ld, 'both', 2 * t + 1));
  // front wall + inner fold with locking tabs
  d.flap([Lp, Wp], [0, Wp], rectFlap(Lp, Dp));
  d.panel(rect(0, Wp, Lp, Dp), 'FRONT');
  const inset = 2 * t + 1;
  d.flap([Lp, Wp + Dp], [0, Wp + Dp], taper(Lp, Dp - t, inset, inset));
  const yf = Wp + 2 * Dp - t;
  for (const cx of [Lp * 0.25, Lp * 0.75]) {
    d.piece(rect(cx - tabW / 2, yf - 0.01, tabW, tabH));
    d.hole(rect(cx - tabW / 2 - 0.5, Wp - t - 1.5, tabW + 1, t + 2));
  }
  // side walls + inner folds with locking tabs
  const sideTabW = Math.min(Wp * 0.3, 35);
  for (const side of ['L', 'R']) {
    const x = side === 'L' ? 0 : Lp;
    const dir = side === 'L' ? -1 : 1;
    if (side === 'L') {
      d.flap([0, Wp], [0, 0], rectFlap(Wp, Dp));
      d.flap([-Dp, Wp], [-Dp, 0], taper(Wp, Dp - t, inset + t, inset + t));
    } else {
      d.flap([Lp, 0], [Lp, Wp], rectFlap(Wp, Dp));
      d.flap([Lp + Dp, 0], [Lp + Dp, Wp], taper(Wp, Dp - t, inset + t, inset + t));
    }
    d.panel(rect(side === 'L' ? -Dp : Lp, 0, Dp, Wp), 'SIDE', { angle: side === 'L' ? 90 : -90 });
    const xt = x + dir * (2 * Dp - t);
    d.piece(rect(side === 'L' ? xt - tabH : xt - 0.01, Wp / 2 - sideTabW / 2, tabH + 0.01, sideTabW));
    d.hole(rect(side === 'L' ? -0.5 : Lp - t - 1.5, Wp / 2 - sideTabW / 2 - 0.5, t + 2, sideTabW + 1));
    // ears on back and front walls
    if (side === 'L') {
      d.flap([0, 0], [0, -Dp], dustFlap(Dp, ear, 'both', 2 * t + 1));
      d.flap([0, Wp + Dp], [0, Wp], dustFlap(Dp, ear, 'both', 2 * t + 1));
    } else {
      d.flap([Lp, -Dp], [Lp, 0], dustFlap(Dp, ear, 'both', 2 * t + 1));
      d.flap([Lp, Wp], [Lp, Wp + Dp], dustFlap(Dp, ear, 'both', 2 * t + 1));
    }
  }
  d.dim([0, Wp * 0.8], [Lp, Wp * 0.8]);
  d.dim([Lp * 0.85, 0], [Lp * 0.85, Wp]);
  d.dim([Lp * 0.15, Wp], [Lp * 0.15, Wp + Dp]);
  return d;
}

function rsc(p) {
  const d = newDieline();
  const t = p.t;
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + 2 * a;
  const j = pick(p.glue, clamp(t * 10, 25, 40));
  const s = pick(p.slot, clamp(t * 2, 3, 10));
  const fh = (Wp + t) / 2;
  const xs = strip(d, [Lp, Wp, Lp, Wp], Dp, ['FRONT', 'SIDE', 'BACK', 'SIDE']);
  glueFlapLeft(d, 0, Dp, Math.min(j, Wp));
  xs.forEach((pn, i) => {
    const x0 = pn.x0 + (i > 0 ? s / 2 : 0);
    const x1 = pn.x1 - (i < 3 ? s / 2 : 0);
    if (p.topFlaps !== false) d.flap([x0, 0], [x1, 0], rectFlap(x1 - x0, fh));
    d.flap([x1, Dp], [x0, Dp], rectFlap(x1 - x0, fh));
  });
  d.dim([xs[0].x0, Dp * 0.85], [xs[0].x1, Dp * 0.85]);
  d.dim([xs[1].x0, Dp * 0.85], [xs[1].x1, Dp * 0.85]);
  d.dim([xs[2].x0 + Lp * 0.12, 0], [xs[2].x0 + Lp * 0.12, Dp]);
  return d;
}

/** Four-wall tray with glue tabs, base top-left at (x, y). */
function trayInto(d, x, y, Lp, Wp, Dp, tw, t, label = 'BASE') {
  d.piece(rect(x, y, Lp, Wp));
  d.panel(rect(x, y, Lp, Wp), label);
  d.flap([x, y], [x + Lp, y], rectFlap(Lp, Dp));
  d.flap([x + Lp, y + Wp], [x, y + Wp], rectFlap(Lp, Dp));
  d.flap([x, y + Wp], [x, y], rectFlap(Wp, Dp));
  d.flap([x + Lp, y], [x + Lp, y + Wp], rectFlap(Wp, Dp));
  d.panel(rect(x, y - Dp, Lp, Dp), 'WALL', { angle: 180, safe: false });
  d.panel(rect(x, y + Wp, Lp, Dp), 'WALL', { safe: false });
  const aa = Math.min(tw * 0.5 + t + 1, Dp * 0.3);
  const bb = Math.min(tw * 0.4, Dp * 0.3);
  const tabs = [
    [[x, y], [x, y - Dp], aa, bb],
    [[x + Lp, y - Dp], [x + Lp, y], bb, aa],
    [[x, y + Wp + Dp], [x, y + Wp], bb, aa],
    [[x + Lp, y + Wp], [x + Lp, y + Wp + Dp], aa, bb],
  ];
  for (const [p1, p2, s, e] of tabs) {
    const prof = taper(Dp, tw, s, e);
    d.flap(p1, p2, prof);
    if (tw > 5) {
      const z = offset([onEdge(p1, p2, prof)], -1.5)[0];
      if (z) d.glueArea(z);
    }
  }
}

function tray(p) {
  const d = newDieline();
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + a / 2;
  const tw = Math.min(pick(p.glue, clamp(Dp * 0.6, 8, 25)), Wp * 0.45);
  trayInto(d, 0, 0, Lp, Wp, Dp, tw, p.t);
  d.dim([0, Wp * 0.8], [Lp, Wp * 0.8]);
  d.dim([Lp * 0.85, 0], [Lp * 0.85, Wp]);
  d.dim([Lp * 0.15, Wp], [Lp * 0.15, Wp + Dp]);
  return d;
}

function twoPiece(p) {
  const d = newDieline();
  const t = p.t;
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + a / 2;
  const clr = pick(p.clearance, 1);
  const Ll = Lp + 2 * t + 2 * clr;
  const Wl = Wp + 2 * t + 2 * clr;
  const Dl = pick(p.lidDepth, Dp);
  const tw = Math.min(clamp(Dp * 0.6, 8, 25), Wp * 0.45);
  const twl = Math.min(clamp(Dl * 0.6, 8, 25), Wl * 0.45);
  trayInto(d, 0, 0, Lp, Wp, Dp, tw, t, 'BASE');
  const gap = 15;
  const lx = Lp + Math.max(Dp, tw) + gap + Math.max(Dl, twl);
  const ly = (Wp - Wl) / 2;
  trayInto(d, lx, ly, Ll, Wl, Dl, twl, t, 'LID');
  d.dim([0, Wp * 0.8], [Lp, Wp * 0.8]);
  d.dim([lx, ly + Wl * 0.8], [lx + Ll, ly + Wl * 0.8]);
  d.dim([Lp * 0.15, Wp], [Lp * 0.15, Wp + Dp]);
  d.dim([lx + Ll * 0.15, ly + Wl], [lx + Ll * 0.15, ly + Wl + Dl]);
  return d;
}

function pillow(p) {
  const d = newDieline();
  const W = p.W + allow(p);
  const H = p.H;
  const s = pick(p.bulge, clamp(p.D / 2, 3, W * 0.3));
  const g = Math.min(pick(p.glue, clamp(W * 0.15, 8, 18)), W * 0.4);
  const xs = strip(d, [W, W], H, ['FRONT', 'BACK']);
  glueFlapLeft(d, 0, H, g);
  for (const { x0, x1 } of xs) {
    for (const [p1, p2] of [
      [[x0, 0], [x1, 0]],
      [[x1, H], [x0, H]],
    ]) {
      const cutArc = bulgeArc(p1, p2, s);
      const creaseArc = bulgeArc(p1, p2, -s);
      d.piece([...cutArc, ...creaseArc.slice(1, -1).reverse()]);
      d.creases.push(creaseArc);
    }
  }
  d.dim([0, H * 0.75], [W, H * 0.75]);
  d.dim([W * 0.12, 0], [W * 0.12, H]);
  return d;
}

function gable(p) {
  const d = newDieline();
  const a = allow(p);
  const Lp = p.L + a;
  const Wp = p.W + a;
  const Dp = p.D + a;
  const total = 2 * Lp + 2 * Wp;
  const rs = (Wp / 2) * Math.SQRT2;
  const hf = pick(p.handle, clamp(Wp * 0.6, 25, 60));
  const top = -rs - hf;
  const g = Math.min(pick(p.glue, clamp(Wp * 0.3, 8, 18)), Wp - 2);
  const T = clamp(Wp * 0.55, 8, 40);
  const xs = [];
  let x = 0;
  for (const w of [Lp, Wp, Lp, Wp]) {
    xs.push({ x0: x, x1: x + w });
    x += w;
  }
  d.piece(fillet(rect(0, top, total, Dp - top), [5, 5, 0, 0]));
  glueFlapLeft(d, top, Dp, g);
  for (let i = 1; i < 4; i++) d.crease([xs[i].x0, top], [xs[i].x0, Dp]);
  d.crease([0, 0], [total, 0]);
  d.crease([0, -rs], [total, -rs]);
  ['FRONT', 'SIDE', 'BACK', 'SIDE'].forEach((lab, i) => d.panel(rect(xs[i].x0, 0, xs[i].x1 - xs[i].x0, Dp), lab));
  for (const i of [0, 2]) {
    const { x0, x1 } = xs[i];
    d.panel(rect(x0, -rs, Lp, rs), 'ROOF', { safe: false });
    const hw = Math.min(Lp * 0.5, 90);
    const hh = Math.min(22, hf * 0.45);
    d.hole(roundRect((x0 + x1) / 2 - hw / 2, top + hf * 0.3, hw, hh, hh / 2));
  }
  for (const i of [1, 3]) {
    const { x0, x1 } = xs[i];
    const xc = (x0 + x1) / 2;
    d.crease([x0, 0], [xc, -Wp / 2], [x1, 0]);
    d.crease([xc, -Wp / 2], [xc, top]);
  }
  // bottom: tuck closure on the front, dust flaps on the sides
  const b0 = xs[0];
  d.flap([b0.x1, Dp], [b0.x0, Dp], rectFlap(Lp, Wp));
  d.flap([b0.x1, Dp + Wp], [b0.x0, Dp + Wp], tuckFlap(Lp, T, Math.min(T * 0.45, 8), 1));
  d.panel(rect(b0.x0, Dp, Lp, Wp), 'BOTTOM');
  const dh = Math.min(Lp * 0.45, Wp);
  d.flap([xs[1].x1, Dp], [xs[1].x0, Dp], dustFlap(Wp, dh, 'end'));
  d.flap([xs[3].x1, Dp], [xs[3].x0, Dp], dustFlap(Wp, dh, 'both'));
  d.dim([xs[0].x0, Dp * 0.85], [xs[0].x1, Dp * 0.85]);
  d.dim([xs[1].x0, Dp * 0.85], [xs[1].x1, Dp * 0.85]);
  d.dim([xs[2].x0 + Lp * 0.12, 0], [xs[2].x0 + Lp * 0.12, Dp]);
  return d;
}

const cartonPresets = [
  { name: 'Cosmetic / perfume 50 × 50 × 150 mm', values: { L: 50, W: 50, D: 150 } },
  { name: 'Tea / supplement 70 × 40 × 120 mm', values: { L: 70, W: 40, D: 120 } },
  { name: 'Soap bar 95 × 30 × 65 mm', values: { L: 95, W: 30, D: 65 } },
  { name: 'Candle 80 × 80 × 90 mm', values: { L: 80, W: 80, D: 90 } },
  { name: 'Phone accessory 90 × 25 × 170 mm', values: { L: 90, W: 25, D: 170 } },
  { name: 'Retail 3 × 1 × 5 in', values: { L: 76.2, W: 25.4, D: 127 } },
];

export default [
  {
    id: 'reverse-tuck-end-box',
    name: 'Reverse Tuck End Box',
    short: 'RTE carton – top tuck closes to the back, bottom tuck to the front.',
    category: 'boxes',
    group: 'Folding cartons',
    standard: 'ECMA A20 family (tuck-end, longitudinal glue seam)',
    material: 'carton',
    dimMode: true,
    keywords: ['reverse tuck end dieline', 'RTE box template', 'tuck box dieline', 'cosmetic box template', 'folding carton dieline'],
    description:
      'The most popular folding carton in retail packaging. Top and bottom closures tuck in from opposite sides, which keeps the front panel clean and makes the carton run efficiently on gluing lines. Ideal for cosmetics, supplements, tea, candles and electronics accessories.',
    params: [...LWD(70, 40, 120), ...tuckParams, ...optionParams],
    presets: cartonPresets,
    build: (p) => tuckEnd(p, 'reverse'),
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'straight-tuck-end-box',
    name: 'Straight Tuck End Box',
    short: 'STE carton – both tucks close towards the back panel.',
    category: 'boxes',
    group: 'Folding cartons',
    standard: 'ECMA A20 family (straight tuck end)',
    material: 'carton',
    dimMode: true,
    keywords: ['straight tuck end dieline', 'STE box template', 'tuck end box', 'product box dieline'],
    description:
      'Both closure panels hinge from the same (back) panel, so the front is uninterrupted from top to bottom and the box opens from the front at both ends. A classic for premium retail where the opening experience matters and for window cartons.',
    params: [...LWD(70, 40, 120), ...tuckParams, ...optionParams],
    presets: cartonPresets,
    build: (p) => tuckEnd(p, 'straight'),
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'seal-end-carton',
    name: 'Seal End Carton (Cereal Box)',
    short: 'Glued top and bottom closures – cereal, crackers, frozen food.',
    category: 'boxes',
    group: 'Folding cartons',
    standard: 'Seal end / glued end carton',
    material: 'carton',
    dimMode: true,
    keywords: ['seal end carton dieline', 'cereal box template', 'glued end box', 'food carton dieline'],
    description:
      'A tamper-evident carton where both ends are closed with overlapping glued major flaps over two dust flaps. The standard for dry food, cereal, pasta and frozen products filled on automatic cartoners.',
    params: [
      ...LWD(190, 60, 280),
      { key: 'overlap', label: 'Major flap overlap', type: 'length', auto: true, min: 2, max: 60, group: 'Advanced', help: 'How much each major flap extends past the centre.' },
      { key: 'dust', label: 'Minor (dust) flap', type: 'length', auto: true, min: 3, max: 400, group: 'Advanced' },
      { key: 'glue', label: 'Glue flap', type: 'length', auto: true, min: 5, max: 60, group: 'Advanced' },
    ],
    presets: [
      { name: 'Cereal 190 × 60 × 280 mm', values: { L: 190, W: 60, D: 280 } },
      { name: 'Crackers 150 × 50 × 220 mm', values: { L: 150, W: 50, D: 220 } },
      { name: 'Pasta 130 × 40 × 200 mm', values: { L: 130, W: 40, D: 200 } },
    ],
    build: sealEnd,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'sleeve-box',
    name: 'Box Sleeve / Wrap',
    short: 'Open-ended sleeve that slides over a tray or product.',
    category: 'boxes',
    group: 'Folding cartons',
    standard: 'Four-panel sleeve with side seam',
    material: 'carton',
    dimMode: true,
    keywords: ['box sleeve dieline', 'sleeve packaging template', 'slide sleeve', 'belly band template'],
    description:
      'A four-panel tube with a glued side seam and two open ends. Use it as a printed outer over a plain tray, as a belly band, or for soap and chocolate bars. Optional thumb notches make it easy to slide.',
    params: [
      ...LWD(100, 30, 150, { D: 'Sleeve length' }),
      { key: 'thumb', label: 'Thumb notches', type: 'bool', default: false, group: 'Options' },
      { key: 'glue', label: 'Glue flap', type: 'length', auto: true, min: 5, max: 60, group: 'Advanced' },
    ],
    presets: [
      { name: 'Soap sleeve 90 × 30 × 60 mm', values: { L: 90, W: 30, D: 60 } },
      { name: 'Chocolate bar 160 × 15 × 80 mm', values: { L: 160, W: 15, D: 80 } },
      { name: 'Macaron box sleeve 200 × 50 × 60 mm', values: { L: 200, W: 50, D: 60 } },
    ],
    build: sleeve,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D, open: true }),
  },
  {
    id: 'mailer-box',
    name: 'Mailer Box (Roll End Tuck Front)',
    short: 'E-commerce mailer with double side walls and tuck lid.',
    category: 'boxes',
    group: 'Corrugated',
    standard: 'FEFCO 0427 style',
    material: 'corrugated',
    dimMode: true,
    keywords: ['mailer box dieline', 'FEFCO 0427 template', 'shipping mailer template', 'subscription box dieline', 'e-commerce box'],
    description:
      'The subscription-box favourite: a one-piece corrugated mailer with self-locking double side walls, dust flaps and a tuck-in lid. No glue or tape needed to assemble – perfect for e-commerce, apparel and gift boxes.',
    params: LWD(250, 180, 80),
    presets: [
      { name: 'Small mailer 200 × 150 × 50 mm', values: { L: 200, W: 150, D: 50 } },
      { name: 'Apparel 300 × 230 × 80 mm', values: { L: 300, W: 230, D: 80 } },
      { name: 'Shoe size 330 × 210 × 120 mm', values: { L: 330, W: 210, D: 120 } },
      { name: '9 × 6 × 3 in', values: { L: 228.6, W: 152.4, D: 76.2 } },
      { name: '12 × 9 × 4 in', values: { L: 304.8, W: 228.6, D: 101.6 } },
    ],
    build: mailer,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'shipping-box-rsc',
    name: 'Shipping Box – RSC',
    short: 'Regular slotted container, the standard corrugated carton.',
    category: 'boxes',
    group: 'Corrugated',
    standard: 'FEFCO 0201 (RSC) / 0200 (HSC)',
    material: 'corrugated',
    dimMode: true,
    keywords: ['RSC box dieline', 'FEFCO 0201 template', 'shipping box template', 'corrugated box dieline', 'regular slotted container'],
    description:
      'The regular slotted container is the world’s most used corrugated box: four panels, a manufacturer’s joint and flaps that meet in the middle. Switch off the top flaps for a half slotted container (FEFCO 0200).',
    params: [
      ...LWD(300, 200, 200),
      { key: 'topFlaps', label: 'Top flaps (off = HSC)', type: 'bool', default: true, group: 'Options' },
      { key: 'glue', label: 'Manufacturer’s joint', type: 'length', auto: true, min: 15, max: 60, group: 'Advanced' },
      { key: 'slot', label: 'Slot width', type: 'length', auto: true, min: 2, max: 20, group: 'Advanced' },
    ],
    presets: [
      { name: 'Small 200 × 150 × 100 mm', values: { L: 200, W: 150, D: 100 } },
      { name: 'Medium 400 × 300 × 300 mm', values: { L: 400, W: 300, D: 300 } },
      { name: 'Moving box 18 × 18 × 16 in', values: { L: 457.2, W: 457.2, D: 406.4 } },
      { name: '12 × 12 × 12 in', values: { L: 304.8, W: 304.8, D: 304.8 } },
    ],
    build: rsc,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'tray-box',
    name: 'Tray with Glued Corners',
    short: 'Four-wall tray – bakery, fruit, display base or drawer.',
    category: 'boxes',
    group: 'Trays & rigid',
    standard: 'Four-corner glued tray',
    material: 'carton',
    dimMode: true,
    keywords: ['tray dieline', 'box tray template', 'food tray template', 'display tray dieline'],
    description: 'A base with four walls and corner glue tabs. Use it as a bakery tray, a drawer for a sleeve box, a display base or the bottom of a two-piece box.',
    params: [...LWD(200, 150, 50), { key: 'glue', label: 'Corner tab', type: 'length', auto: true, min: 5, max: 60, group: 'Advanced' }],
    presets: [
      { name: 'Bakery tray 250 × 180 × 50 mm', values: { L: 250, W: 180, D: 50 } },
      { name: 'Drawer 140 × 90 × 40 mm', values: { L: 140, W: 90, D: 40 } },
    ],
    build: tray,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D, open: true }),
  },
  {
    id: 'two-piece-box',
    name: 'Two-Piece Box (Lid & Base)',
    short: 'Telescope gift box – base tray plus a slightly larger lid.',
    category: 'boxes',
    group: 'Trays & rigid',
    standard: 'Telescope style (lid over base)',
    material: 'rigid',
    dimMode: true,
    keywords: ['two piece box dieline', 'lid and base box template', 'telescope box', 'rigid gift box dieline'],
    description: 'Generates both the base and the lid on one sheet. The lid is automatically enlarged by the board thickness plus a clearance so it slides over the base – the classic gift, apparel and rigid set-up box.',
    params: [
      ...LWD(200, 150, 60),
      { key: 'lidDepth', label: 'Lid depth', type: 'length', auto: true, min: 5, max: 500, group: 'Options', help: 'Full telescope = same as depth.' },
      { key: 'clearance', label: 'Lid clearance', type: 'length', default: 1, min: 0, max: 10, group: 'Advanced' },
    ],
    presets: [
      { name: 'Jewellery 90 × 90 × 35 mm', values: { L: 90, W: 90, D: 35, lidDepth: 20 } },
      { name: 'Apparel gift 300 × 220 × 80 mm', values: { L: 300, W: 220, D: 80, lidDepth: 30 } },
    ],
    build: twoPiece,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
  {
    id: 'pillow-box',
    name: 'Pillow Box',
    short: 'Curved-end favour box – gift cards, jewellery, favours.',
    category: 'boxes',
    group: 'Specialty',
    standard: 'Pillow pack with curved scores',
    material: 'carton',
    dimMode: false,
    caliper: true,
    keywords: ['pillow box dieline', 'pillow box template', 'favor box template', 'gift card box'],
    description: 'A glued tube with curved scored ends that fold in to close. Pillow boxes need no glue at the ends and look great for gift cards, jewellery, wedding favours and hair extensions.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 90, min: 20, max: 600 },
      { key: 'H', label: 'Length', type: 'length', default: 160, min: 30, max: 800 },
      { key: 'D', label: 'Thickness', type: 'length', default: 30, min: 5, max: 200 },
      { key: 'bulge', label: 'End curve depth', type: 'length', auto: true, min: 2, max: 100, group: 'Advanced' },
      { key: 'glue', label: 'Glue flap', type: 'length', auto: true, min: 5, max: 40, group: 'Advanced' },
    ],
    presets: [
      { name: 'Gift card 95 × 160 × 25 mm', values: { W: 95, H: 160, D: 25 } },
      { name: 'Favour 70 × 120 × 25 mm', values: { W: 70, H: 120, D: 25 } },
      { name: 'Hair extension 120 × 300 × 40 mm', values: { W: 120, H: 300, D: 40 } },
    ],
    build: pillow,
  },
  {
    id: 'gable-box',
    name: 'Gable Box with Handle',
    short: 'Carry box with gable roof and die-cut handle.',
    category: 'boxes',
    group: 'Specialty',
    standard: 'Gable top carton with tuck bottom',
    material: 'carton',
    dimMode: true,
    keywords: ['gable box dieline', 'gable box template', 'handle box dieline', 'party favor box', 'carry box template'],
    description: 'A gable-top carry box with a die-cut handle and tuck bottom. Popular for bakery, party favours, kids’ meals and gift packaging.',
    params: [
      ...LWD(100, 60, 120),
      { key: 'handle', label: 'Handle height', type: 'length', auto: true, min: 15, max: 150, group: 'Options' },
      { key: 'glue', label: 'Glue flap', type: 'length', auto: true, min: 5, max: 60, group: 'Advanced' },
    ],
    presets: [
      { name: 'Party favour 80 × 50 × 100 mm', values: { L: 80, W: 50, D: 100 } },
      { name: 'Bakery 160 × 100 × 120 mm', values: { L: 160, W: 100, D: 120 } },
    ],
    build: gable,
    preview3d: (p) => ({ kind: 'box', L: p.L, W: p.W, D: p.D }),
  },
];
