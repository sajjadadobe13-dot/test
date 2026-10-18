import { rect, roundRect, fillet, bulgeArc, circle } from '../geometry.js';
import { newDieline, pick, clamp, hangHole } from './helpers.js';

const pouchOptions = [
  { key: 'zipper', label: 'Reclosable zipper', type: 'bool', default: true, group: 'Options' },
  { key: 'zipperPos', label: 'Zipper from top', type: 'length', default: 30, min: 10, max: 200, group: 'Options', showIf: 'zipper' },
  { key: 'tearNotch', label: 'Tear notches', type: 'bool', default: true, group: 'Options' },
  { key: 'hang', label: 'Hang hole', type: 'select', default: 'none', options: [{ value: 'none', label: 'None' }, { value: 'round', label: 'Round' }, { value: 'euro', label: 'Euro slot' }], group: 'Options' },
  { key: 'corner', label: 'Corner radius', type: 'length', default: 5, min: 0, max: 30, group: 'Options' },
  { key: 'seal', label: 'Side seal width', type: 'length', default: 8, min: 2, max: 30, group: 'Seals' },
  { key: 'topSeal', label: 'Top seal width', type: 'length', auto: true, min: 3, max: 60, group: 'Seals' },
];

/** Front/back pouch panel with seals, zipper, notches and hang hole. */
function pouchPanel(d, x, y, W, H, p, { label, bottomSeal = 0, bottomFold = false, angle = 0, top = true } = {}) {
  const s = p.seal;
  const hang = p.hang && p.hang !== 'none';
  const ts = pick(p.topSeal, hang ? 22 : 10);
  const r = Math.min(p.corner || 0, W / 4, H / 4);
  const radii = top ? [r, r, bottomFold ? 0 : r, bottomFold ? 0 : r] : [0, 0, r, r];
  d.piece(r ? fillet(rect(x, y, W, H), radii) : rect(x, y, W, H));
  // seals
  d.glueArea(rect(x, y, s, H));
  d.glueArea(rect(x + W - s, y, s, H));
  if (top) d.glueArea(rect(x + s, y, W - 2 * s, ts));
  if (bottomSeal) d.glueArea(rect(x + s, y + H - bottomSeal, W - 2 * s, bottomSeal));
  const zy = y + pick(p.zipperPos, 30);
  if (top && p.zipper) {
    d.guide([x, zy], [x + W, zy]);
    d.guide([x, zy + 6], [x + W, zy + 6]);
  }
  if (top && p.tearNotch) {
    const ty = y + Math.min(ts + 6, (p.zipper ? pick(p.zipperPos, 30) : ts + 12) - 4);
    d.notch([[x - 0.1, ty - 2], [x + 3, ty], [x - 0.1, ty + 2]]);
    d.notch([[x + W + 0.1, ty - 2], [x + W - 3, ty], [x + W + 0.1, ty + 2]]);
    d.perf([x + 3, ty], [x + W - 3, ty]);
  }
  if (top && hang) d.hole(hangHole(x + W / 2, y + ts / 2 + (p.hang === 'euro' ? 1.5 : 0), p.hang));
  const innerTop = top ? Math.max(ts, p.zipper ? pick(p.zipperPos, 30) + 6 : ts) : 0;
  const inner = rect(x + s, y + innerTop, W - 2 * s, H - innerTop - bottomSeal);
  if (label) d.panel(inner, label, { angle });
  return { ts };
}

function standUp(p) {
  const d = newDieline();
  const { W, H, G } = p;
  const gap = 10;
  const s = p.seal;
  for (const [i, label] of [
    [0, 'FRONT'],
    [1, 'BACK'],
  ]) {
    const x = i * (W + gap);
    pouchPanel(d, x, 0, W, H, p, { label, bottomFold: true });
    // Doyen (round-bottom) seal: high at the sides, narrow in the middle
    const yb = H - G / 2;
    const curve = bulgeArc([x + W, yb], [x, yb], G / 2 - s);
    d.glueArea([[x, H], [x + W, H], ...curve]);
  }
  // bottom gusset (folded in half, W-fold)
  const gx = (2 * W + gap) / 2 - W / 2;
  const gy = H + gap;
  d.piece(rect(gx, gy, W, G));
  d.guide([gx, gy + G / 2], [gx + W, gy + G / 2]);
  const c1 = bulgeArc([gx, gy + G / 2], [gx + W, gy + G / 2], G / 2 - s);
  d.glueArea([[gx, gy], ...c1, [gx + W, gy]]);
  const c2 = bulgeArc([gx + W, gy + G / 2], [gx, gy + G / 2], G / 2 - s);
  d.glueArea([[gx, gy + G], [gx + W, gy + G], ...c2]);
  d.panel(rect(gx, gy, W, G), 'BOTTOM GUSSET', { safe: false });
  d.dim([0, H * 0.7], [W, H * 0.7]);
  d.dim([W * 0.88, 0], [W * 0.88, H]);
  d.dim([gx + W * 0.1, gy], [gx + W * 0.1, gy + G]);
  return d;
}

function flatPouch(p) {
  const d = newDieline();
  const { W, H } = p;
  const s = p.seal;
  if (p.style === '4side') {
    pouchPanel(d, 0, 0, W, H, p, { label: 'FRONT', bottomSeal: s });
    pouchPanel(d, W + 10, 0, W, H, p, { label: 'BACK', bottomSeal: s });
  } else {
    // 3-side seal: one web folded at the bottom, back panel printed upside down
    const r = Math.min(p.corner || 0, W / 4, H / 4);
    pouchPanel(d, 0, 0, W, H, p, { label: 'FRONT', bottomFold: true });
    d.pieces.pop();
    d.piece(r ? fillet(rect(0, 0, W, 2 * H), [r, r, r, r]) : rect(0, 0, W, 2 * H));
    d.glueArea(rect(0, H, s, H));
    d.glueArea(rect(W - s, H, s, H));
    d.guide([0, H], [W, H]);
    // mirrored top features on the back
    const hang = p.hang && p.hang !== 'none';
    const ts = pick(p.topSeal, hang ? 22 : 10);
    d.glueArea(rect(s, 2 * H - ts, W - 2 * s, ts));
    if (p.zipper) {
      const zy = 2 * H - pick(p.zipperPos, 30);
      d.guide([0, zy], [W, zy]);
      d.guide([0, zy - 6], [W, zy - 6]);
    }
    if (p.tearNotch) {
      const ty = 2 * H - Math.min(ts + 6, (p.zipper ? pick(p.zipperPos, 30) : ts + 12) - 4);
      d.notch([[-0.1, ty - 2], [3, ty], [-0.1, ty + 2]]);
      d.notch([[W + 0.1, ty - 2], [W - 3, ty], [W + 0.1, ty + 2]]);
      d.perf([3, ty], [W - 3, ty]);
    }
    if (hang) d.hole(hangHole(W / 2, 2 * H - ts / 2 + (p.hang === 'euro' ? 1.5 : 0), p.hang));
    const innerTop = Math.max(ts, p.zipper ? pick(p.zipperPos, 30) + 6 : ts);
    d.panel(rect(s, H, W - 2 * s, H - innerTop), 'BACK', { angle: 180 });
  }
  d.dim([0, H * 0.7], [W, H * 0.7]);
  d.dim([W * 0.88, 0], [W * 0.88, H]);
  return d;
}

function flowWrap(p) {
  const d = newDieline();
  const { W, D, L } = p;
  const f = p.fin;
  const c = p.crimp;
  const widths = [f, W / 2, D, W, D, W / 2, f];
  const total = widths.reduce((a, b) => a + b, 0);
  d.piece(rect(0, 0, total, L));
  let x = 0;
  const xs = widths.map((w) => {
    const r = { x0: x, x1: x + w };
    x += w;
    return r;
  });
  for (let i = 1; i < xs.length; i++) d.guide([xs[i].x0, 0], [xs[i].x0, L]);
  d.glueArea(rect(0, 0, f, L));
  d.glueArea(rect(total - f, 0, f, L));
  d.glueArea(rect(0, 0, total, c));
  d.glueArea(rect(0, L - c, total, c));
  d.panel(rect(xs[1].x0, c, W / 2, L - 2 * c), 'BACK');
  d.panel(rect(xs[3].x0, c, W, L - 2 * c), 'FRONT');
  d.panel(rect(xs[5].x0, c, W / 2, L - 2 * c), 'BACK');
  if (p.eyemark) {
    // registration eyemark for the cut-off sensor, in the fin seal area
    const em = rect(f / 2 - Math.min(3, f / 3), L - c - 14, Math.min(6, (f * 2) / 3), 12);
    d.guide(...em, em[0]);
  }
  d.dim([xs[3].x0, L * 0.7], [xs[3].x1, L * 0.7]);
  d.dim([xs[3].x0 + W * 0.1, 0], [xs[3].x0 + W * 0.1, L]);
  d.dim([0, L * 0.25], [total, L * 0.25]);
  return d;
}

function sideGusset(p) {
  const d = newDieline();
  const { W, G, H } = p;
  const f = p.fin;
  const ts = p.topSeal;
  const bs = p.bottomSeal;
  const widths = [f, W / 2, G, W, G, W / 2, f];
  const total = widths.reduce((a, b) => a + b, 0);
  d.piece(rect(0, 0, total, H));
  let x = 0;
  const xs = widths.map((w) => {
    const r = { x0: x, x1: x + w };
    x += w;
    return r;
  });
  for (let i = 1; i < xs.length; i++) d.guide([xs[i].x0, 0], [xs[i].x0, H]);
  for (const i of [2, 4]) d.guide([(xs[i].x0 + xs[i].x1) / 2, 0], [(xs[i].x0 + xs[i].x1) / 2, H]);
  d.glueArea(rect(0, 0, f, H));
  d.glueArea(rect(total - f, 0, f, H));
  d.glueArea(rect(0, 0, total, ts));
  d.glueArea(rect(0, H - bs, total, bs));
  d.panel(rect(xs[1].x0, ts, W / 2, H - ts - bs), 'BACK');
  d.panel(rect(xs[2].x0, ts, G, H - ts - bs), 'GUSSET', { angle: -90 });
  d.panel(rect(xs[3].x0, ts, W, H - ts - bs), 'FRONT');
  d.panel(rect(xs[4].x0, ts, G, H - ts - bs), 'GUSSET', { angle: -90 });
  d.panel(rect(xs[5].x0, ts, W / 2, H - ts - bs), 'BACK');
  if (p.valve) {
    const cx = (xs[3].x0 + xs[3].x1) / 2;
    d.guide(...circle(cx, ts + Math.min(40, H * 0.2), 11), circle(cx, ts + Math.min(40, H * 0.2), 11)[0]);
  }
  d.dim([xs[3].x0, H * 0.75], [xs[3].x1, H * 0.75]);
  d.dim([xs[2].x0, H * 0.6], [xs[2].x1, H * 0.6]);
  d.dim([xs[3].x0 + W * 0.1, 0], [xs[3].x0 + W * 0.1, H]);
  return d;
}

function paperBag(p) {
  const d = newDieline();
  const { W, G, H } = p;
  const g = p.glue;
  const top = p.topFold;
  const bot = G / 2 + pick(p.bottomOverlap, clamp(G * 0.3, 10, 30));
  const widths = [W, G, W, G];
  const total = 2 * W + 2 * G;
  const Ht = top + H + bot;
  d.piece(rect(0, 0, total, Ht));
  d.flap([0, Ht], [0, 0], [[0, 0], [3, g], [Ht - 3, g], [Ht, 0]]);
  d.glueArea(rect(-g + 1.5, 4, g - 3, Ht - 8));
  let x = 0;
  const xs = widths.map((w) => {
    const r = { x0: x, x1: x + w };
    x += w;
    return r;
  });
  for (let i = 1; i < xs.length; i++) d.crease([xs[i].x0, 0], [xs[i].x0, Ht]);
  d.crease([0, top], [total, top]);
  d.crease([0, top + H], [total, top + H]);
  d.crease([0, top + H + G / 2], [total, top + H + G / 2]);
  for (const i of [1, 3]) {
    const { x0, x1 } = xs[i];
    const xc = (x0 + x1) / 2;
    d.crease([xc, top], [xc, top + H]);
    // gusset bottom: 45° creases form the self-opening (SOS) bottom
    d.crease([x0, top + H], [xc, top + H + G / 2], [x1, top + H]);
  }
  d.glueArea(rect(1.5, top + H + G / 2 + 2, total - 3, bot - G / 2 - 4));
  d.panel(rect(xs[0].x0, top, W, H), 'FRONT');
  d.panel(rect(xs[1].x0, top, G, H), 'GUSSET', { angle: -90 });
  d.panel(rect(xs[2].x0, top, W, H), 'BACK');
  d.panel(rect(xs[3].x0, top, G, H), 'GUSSET', { angle: -90 });
  d.panel(rect(0, 0, total, top), 'TOP TURN-OVER (INSIDE)', { safe: false });
  if (p.handleHoles) {
    for (const i of [0, 2]) {
      const cx = (xs[i].x0 + xs[i].x1) / 2;
      const hw = Math.min(W * 0.45, 90);
      d.hole(roundRect(cx - hw / 2, top + 18, hw, 25, 12.5));
    }
  }
  d.dim([0, top + H * 0.8], [W, top + H * 0.8]);
  d.dim([xs[1].x0, top + H * 0.6], [xs[1].x1, top + H * 0.6]);
  d.dim([W * 0.12, top], [W * 0.12, top + H]);
  return d;
}

export default [
  {
    id: 'stand-up-pouch',
    name: 'Stand-Up Pouch (Doypack)',
    short: 'Flexible pouch with round-bottom gusset, zipper and tear notch.',
    category: 'pouches',
    group: 'Flexible packaging',
    standard: 'Doyen bottom gusset, 3-side seal',
    material: 'film',
    keywords: ['stand up pouch dieline', 'doypack template', 'pouch packaging template', 'zipper pouch dieline', 'coffee pouch template'],
    description:
      'Artwork template for a stand-up pouch with a Doyen (round-bottom) gusset. Front, back and bottom gusset are laid out with seal zones, zipper track, tear notches and an optional hang hole, so designers keep text and logos out of seals.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 160, min: 60, max: 500 },
      { key: 'H', label: 'Height', type: 'length', default: 230, min: 80, max: 600 },
      { key: 'G', label: 'Bottom gusset (unfolded)', type: 'length', default: 90, min: 20, max: 250 },
      ...pouchOptions,
    ],
    presets: [
      { name: '100 g – 120 × 190 × 70 mm', values: { W: 120, H: 190, G: 70 } },
      { name: '250 g – 160 × 230 × 90 mm', values: { W: 160, H: 230, G: 90 } },
      { name: '500 g – 200 × 300 × 110 mm', values: { W: 200, H: 300, G: 110 } },
      { name: '1 kg – 250 × 350 × 120 mm', values: { W: 250, H: 350, G: 120 } },
    ],
    build: standUp,
  },
  {
    id: 'flat-pouch',
    name: 'Flat Pouch (3 / 4-Side Seal)',
    short: 'Sachet & flat bag with optional zipper and hang hole.',
    category: 'pouches',
    group: 'Flexible packaging',
    standard: '3-side seal (bottom fold) or 4-side seal',
    material: 'film',
    keywords: ['flat pouch dieline', 'sachet template', '3 side seal pouch template', 'mylar bag template', 'zip lock bag dieline'],
    description: 'Flat pouches and sachets for snacks, samples, supplements and cosmetics. Choose a 3-side seal (folded bottom) or 4-side seal layout, with optional zipper, tear notches and hang hole.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 120, min: 30, max: 500 },
      { key: 'H', label: 'Height', type: 'length', default: 180, min: 30, max: 600 },
      { key: 'style', label: 'Seal style', type: 'select', default: '3side', options: [{ value: '3side', label: '3-side seal (bottom fold)' }, { value: '4side', label: '4-side seal' }] },
      ...pouchOptions,
    ],
    presets: [
      { name: 'Sample sachet 60 × 80 mm', values: { W: 60, H: 80, zipper: false, hang: 'none' } },
      { name: 'Mylar 4 × 6 in', values: { W: 101.6, H: 152.4 } },
      { name: 'Snack 150 × 220 mm', values: { W: 150, H: 220 } },
    ],
    build: flatPouch,
  },
  {
    id: 'flow-wrap',
    name: 'Flow Wrap / Pillow Pack',
    short: 'Fin-seal flow wrapper for bars, biscuits and candy.',
    category: 'pouches',
    group: 'Flexible packaging',
    standard: 'HFFS flow wrap with fin seal and end crimps',
    material: 'film',
    keywords: ['flow wrap dieline', 'pillow pack template', 'candy bar wrapper template', 'snack bar wrapper dieline'],
    description: 'Flat artwork layout for a horizontal flow-wrap (pillow pack) – the format used for snack bars, biscuits, chocolate and ice-cream. Includes fin seal, end crimps, fold guides and an optional eyemark for the cut-off sensor.',
    params: [
      { key: 'W', label: 'Pack face width', type: 'length', default: 40, min: 10, max: 400 },
      { key: 'D', label: 'Product thickness', type: 'length', default: 15, min: 2, max: 200 },
      { key: 'L', label: 'Cut-off length', type: 'length', default: 160, min: 30, max: 600 },
      { key: 'fin', label: 'Fin seal', type: 'length', default: 10, min: 4, max: 30, group: 'Seals' },
      { key: 'crimp', label: 'End crimp', type: 'length', default: 12, min: 4, max: 40, group: 'Seals' },
      { key: 'eyemark', label: 'Eyemark', type: 'bool', default: true, group: 'Options' },
    ],
    presets: [
      { name: 'Protein bar 45 × 15 × 150 mm', values: { W: 45, D: 15, L: 150 } },
      { name: 'Chocolate bar 70 × 10 × 180 mm', values: { W: 70, D: 10, L: 180 } },
      { name: 'Biscuit pack 60 × 50 × 220 mm', values: { W: 60, D: 50, L: 220 } },
    ],
    build: flowWrap,
  },
  {
    id: 'side-gusset-bag',
    name: 'Side Gusset Bag (Coffee Bag)',
    short: 'Quad-style coffee bag with fin back seal and valve mark.',
    category: 'pouches',
    group: 'Flexible packaging',
    standard: 'Side gusset with centre fin seal',
    material: 'film',
    keywords: ['side gusset bag dieline', 'coffee bag template', 'gusseted bag template', 'tea bag packaging dieline'],
    description: 'A side-gusseted bag with a centre-back fin seal – the classic coffee and tea bag. Gusset fold lines, top & bottom seals and an optional degassing valve position are marked.',
    params: [
      { key: 'W', label: 'Front width', type: 'length', default: 110, min: 40, max: 400 },
      { key: 'G', label: 'Gusset', type: 'length', default: 60, min: 20, max: 200 },
      { key: 'H', label: 'Height', type: 'length', default: 280, min: 80, max: 700 },
      { key: 'fin', label: 'Fin seal', type: 'length', default: 10, min: 4, max: 30, group: 'Seals' },
      { key: 'topSeal', label: 'Top seal', type: 'length', default: 15, min: 4, max: 60, group: 'Seals' },
      { key: 'bottomSeal', label: 'Bottom seal', type: 'length', default: 10, min: 4, max: 60, group: 'Seals' },
      { key: 'valve', label: 'Degassing valve mark', type: 'bool', default: true, group: 'Options' },
    ],
    presets: [
      { name: '250 g coffee – 90 × 55 × 230 mm', values: { W: 90, G: 55, H: 230 } },
      { name: '500 g coffee – 110 × 60 × 280 mm', values: { W: 110, G: 60, H: 280 } },
      { name: '1 kg coffee – 135 × 80 × 340 mm', values: { W: 135, G: 80, H: 340 } },
    ],
    build: sideGusset,
  },
  {
    id: 'paper-shopping-bag',
    name: 'Paper Shopping Bag',
    short: 'SOS-bottom retail bag with gussets and top turn-over.',
    category: 'pouches',
    group: 'Bags',
    standard: 'SOS (self-opening square) bottom',
    material: 'paper',
    keywords: ['paper bag dieline', 'shopping bag template', 'gift bag template', 'kraft bag dieline', 'carrier bag template'],
    description: 'Retail and gift bag with side gussets, glued side seam, reinforced top turn-over and a self-opening (SOS) bottom with its 45° gusset creases. Optional die-cut handle holes.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 250, min: 60, max: 600 },
      { key: 'G', label: 'Gusset', type: 'length', default: 100, min: 30, max: 300 },
      { key: 'H', label: 'Height', type: 'length', default: 320, min: 80, max: 800 },
      { key: 'topFold', label: 'Top turn-over', type: 'length', default: 40, min: 0, max: 100, group: 'Options' },
      { key: 'handleHoles', label: 'Die-cut handle holes', type: 'bool', default: false, group: 'Options' },
      { key: 'glue', label: 'Side seam flap', type: 'length', default: 20, min: 10, max: 40, group: 'Advanced' },
      { key: 'bottomOverlap', label: 'Bottom overlap', type: 'length', auto: true, min: 5, max: 80, group: 'Advanced' },
    ],
    presets: [
      { name: 'Small gift 180 × 80 × 220 mm', values: { W: 180, G: 80, H: 220 } },
      { name: 'Medium 250 × 100 × 320 mm', values: { W: 250, G: 100, H: 320 } },
      { name: 'Large 320 × 120 × 420 mm', values: { W: 320, G: 120, H: 420 } },
      { name: 'Wine bottle 120 × 90 × 360 mm', values: { W: 120, G: 90, H: 360 } },
    ],
    build: paperBag,
  },
];

