/**
 * Cylindrical and conical wrap labels: cans, jars, bottles, tubes, cups.
 */
import { rect, roundRect, fillet, arcPoints, circle } from '../geometry.js';
import { newDieline, pick, clamp, outerDims } from './helpers.js';

/** Straight cylinder wrap label. */
export function wrapLabel(p) {
  const d = newDieline();
  const C = Math.PI * p.dia;
  const cov = clamp(pick(p.coverage, 100), 5, 100) / 100;
  const full = cov >= 0.999;
  const o = full ? pick(p.overlap, 6) : 0;
  const W = C * cov + o;
  const H = p.H;
  const r = Math.min(pick(p.corner, 0), H / 4, W / 4);
  d.piece(r ? roundRect(0, 0, W, H, r) : rect(0, 0, W, H));
  if (full) {
    if (o > 0) {
      d.glueArea(rect(W - o, 0, o, H));
      d.guide([C, 0], [C, H]);
    }
    // quarter guides: the front of the container is centred on the label
    for (const q of [0.25, 0.75]) d.guide([C * q, 0], [C * q, H]);
    d.panel(rect(C * 0.25, 0, C * 0.5, H), 'FRONT');
    d.panel(rect(0, 0, C * 0.25, H), 'BACK', { safe: true });
    d.panel(rect(C * 0.75, 0, C * 0.25, H), 'BACK', { safe: true });
  } else {
    d.panel(rect(0, 0, W, H), 'FRONT');
  }
  outerDims(d, 0, 0, W, H);
  d.info.note = `Circumference ${C.toFixed(1)} mm`;
  return d;
}

/**
 * Conical (frustum) development: cup sleeves, cup wraps, tapered tubs.
 * Dt / Db are the diameters at the top and bottom edge of the label and h
 * the vertical height. rim / base add curl or fold-under allowances.
 */
export function conical(p) {
  const d = newDieline();
  let Dt = p.Dt;
  let Db = p.Db;
  const h = p.h;
  const o = pick(p.overlap, 12);
  const rim = pick(p.rim, 0);
  const base = pick(p.base, 0);
  const flip = Dt < Db;
  if (flip) [Dt, Db] = [Db, Dt];
  if (Math.abs(Dt - Db) < 0.05) {
    return wrapLabel({ dia: Dt, H: h + rim + base, overlap: o, coverage: 100, corner: p.corner });
  }
  const s = Math.hypot(h, (Dt - Db) / 2);
  const R2 = (s * Dt) / (Dt - Db);
  const R1 = R2 - s;
  const theta = (Math.PI * Dt) / R2;
  const Rm = (R1 + R2) / 2;
  const phi = o / Rm;
  const total = theta + phi;
  if (total >= Math.PI * 2 * 0.98) throw new Error('This taper is too steep to unroll as a single piece. Reduce the diameter difference or increase the height.');
  const Ro = R2 + rim;
  const Ri = Math.max(R1 - base, 1);
  const a0 = -Math.PI / 2 - total / 2;
  const a1 = -Math.PI / 2 + total / 2;
  const cx = 0;
  const cy = Ro; // centre below so the wide (top) edge is on top
  const outer = arcPoints(cx, cy, Ro, a0, a1);
  const inner = arcPoints(cx, cy, Ri, a1, a0);
  const poly = [...outer, ...inner];
  const cr = pick(p.corner, 0);
  d.piece(cr ? fillet(poly, poly.map((_, i) => (i === 0 || i === outer.length - 1 || i === outer.length || i === poly.length - 1 ? cr : 0))) : poly);
  // overlap / glue zone on the trailing end
  const g0 = a1 - phi;
  const glue = [...arcPoints(cx, cy, Ro - 0.01, g0, a1), ...arcPoints(cx, cy, Ri + 0.01, a1, g0)];
  d.glueArea(glue);
  // true edges when curl / fold allowances are present
  if (rim > 0) d.guides.push(arcPoints(cx, cy, R2, a0, a1));
  if (base > 0) d.guides.push(arcPoints(cx, cy, R1, a0, a1));
  // seam & front centre guides
  const am = a0 + theta / 2;
  d.guide([cx + Ri * Math.cos(am), cy + Ri * Math.sin(am)], [cx + Ro * Math.cos(am), cy + Ro * Math.sin(am)]);
  const front = [...arcPoints(cx, cy, R2, am - theta / 4, am + theta / 4), ...arcPoints(cx, cy, R1, am + theta / 4, am - theta / 4)];
  d.panel([...arcPoints(cx, cy, R2, a0, g0), ...arcPoints(cx, cy, R1, g0, a0)], '', { safe: true });
  d.panel(front, 'FRONT', { angle: ((am + Math.PI / 2) * 180) / Math.PI, safe: false });
  d.dim([cx + Ri * Math.cos(a0), cy + Ri * Math.sin(a0)], [cx + Ro * Math.cos(a0), cy + Ro * Math.sin(a0)]);
  d.info.note = `Slant height ${s.toFixed(1)} mm · radii ${R1.toFixed(1)} / ${R2.toFixed(1)} mm · arc ${((theta * 180) / Math.PI).toFixed(1)}°`;
  if (flip) {
    // label narrower at the top (e.g. bottle shoulder): mirror vertically
    const fy = (pt) => [pt[0], -pt[1]];
    const mirror = (list) => list.map((pl) => pl.map(fy));
    d.pieces = mirror(d.pieces);
    d.glue = mirror(d.glue);
    d.guides = mirror(d.guides);
    d.panels = d.panels.map((pn) => ({ ...pn, poly: pn.poly.map(fy), angle: -pn.angle }));
    d.dims = d.dims.map((dm) => ({ ...dm, a: fy(dm.a), b: fy(dm.b) }));
  }
  return d;
}

const wrapParams = (dia, H, o, extra = []) => [
  { key: 'dia', label: 'Diameter', type: 'length', default: dia, min: 5, max: 500, help: 'Outside diameter of the container where the label sits.' },
  { key: 'H', label: 'Label height', type: 'length', default: H, min: 5, max: 600 },
  { key: 'overlap', label: 'Overlap / glue', type: 'length', default: o, min: 0, max: 50, help: 'Extra length that overlaps the start of the label.' },
  { key: 'coverage', label: 'Coverage (%)', type: 'number', default: 100, min: 5, max: 100, step: 1, group: 'Options', help: '100% = full wrap-around. Lower values make a front/back panel label.' },
  { key: 'corner', label: 'Corner radius', type: 'length', default: 0, min: 0, max: 20, group: 'Options' },
  ...extra,
];

const conicalParams = (Dt, Db, h, o, rim, base) => [
  { key: 'Dt', label: 'Top diameter', type: 'length', default: Dt, min: 10, max: 600, help: 'Diameter at the top edge of the label / sleeve.' },
  { key: 'Db', label: 'Bottom diameter', type: 'length', default: Db, min: 10, max: 600, help: 'Diameter at the bottom edge of the label / sleeve.' },
  { key: 'h', label: 'Height', type: 'length', default: h, min: 5, max: 600, help: 'Vertical height of the label (not the slant).' },
  { key: 'overlap', label: 'Overlap / glue', type: 'length', default: o, min: 0, max: 50 },
  { key: 'rim', label: 'Top rim curl allowance', type: 'length', default: rim, min: 0, max: 20, group: 'Advanced' },
  { key: 'base', label: 'Bottom fold allowance', type: 'length', default: base, min: 0, max: 30, group: 'Advanced' },
  { key: 'corner', label: 'Corner radius', type: 'length', default: 0, min: 0, max: 10, group: 'Advanced' },
];

export default [
  {
    id: 'beverage-can-label',
    name: 'Beverage Can Wrap Label',
    short: '12 oz, 16 oz, sleek and slim can labels with overlap.',
    category: 'cans',
    group: 'Can labels',
    standard: 'Wrap-around pressure-sensitive label',
    material: 'label',
    keywords: ['can label template', '12 oz can label dieline', '16 oz can label template', 'beer can label template', 'soda can wrap template'],
    description:
      'Wrap-around labels for aluminium beverage cans used by craft breweries, coffee roasters and drink brands. Width is calculated from the can circumference plus overlap, and the front, back and seam positions are marked.',
    params: wrapParams(66.2, 114, 6),
    presets: [
      { name: '12 oz / 355 ml standard (Ø 66 mm)', values: { dia: 66.2, H: 114 } },
      { name: '16 oz / 473 ml tall (Ø 66 mm)', values: { dia: 66.2, H: 140 } },
      { name: '12 oz sleek (Ø 58 mm)', values: { dia: 58, H: 125 } },
      { name: '250 ml slim (Ø 53 mm)', values: { dia: 53, H: 115 } },
      { name: '19.2 oz stovepipe (Ø 66 mm)', values: { dia: 66.2, H: 165 } },
    ],
    build: wrapLabel,
    preview3d: (p) => ({ kind: 'cyl', dia: p.dia, H: p.H }),
  },
  {
    id: 'jar-tin-label',
    name: 'Jar & Food Tin Label',
    short: 'Wrap labels for jars, tins, candles and food cans.',
    category: 'cans',
    group: 'Can labels',
    standard: 'Cylinder wrap label',
    material: 'label',
    keywords: ['jar label template', 'tin can label template', 'candle jar label dieline', 'mason jar label template', 'food can label'],
    description: 'Labels for glass jars, candle vessels, food tins and paint cans. Enter the diameter and label height – circumference, overlap and front centre are calculated for you. Reduce coverage for a front-only label.',
    params: wrapParams(76, 90, 8),
    presets: [
      { name: 'Soup can 300 × 407 (Ø 76 mm)', values: { dia: 76.2, H: 95 } },
      { name: '#10 food can (Ø 157 mm)', values: { dia: 157, H: 160 } },
      { name: 'Mason jar regular mouth (Ø 70 mm)', values: { dia: 70, H: 65 } },
      { name: 'Candle tumbler (Ø 80 mm)', values: { dia: 80, H: 70 } },
      { name: '8 oz jar front label 60%', values: { dia: 68, H: 60, coverage: 60, corner: 3 } },
    ],
    build: wrapLabel,
    preview3d: (p) => ({ kind: 'cyl', dia: p.dia, H: p.H }),
  },
  {
    id: 'bottle-label',
    name: 'Bottle Label',
    short: 'Wine, beer, sauce and supplement bottle labels – straight or tapered.',
    category: 'cans',
    group: 'Bottle labels',
    standard: 'Straight or conical wrap',
    material: 'label',
    keywords: ['bottle label template', 'wine label dieline', 'beer bottle label template', 'supplement bottle label', 'tapered bottle label'],
    description: 'Bottle labels for straight walls or tapered shoulders. Set different top and bottom diameters to unroll a conical label that sits flat on tapered bottles and tubs.',
    params: conicalParams(70, 70, 90, 6, 0, 0),
    presets: [
      { name: 'Wine bottle 750 ml (Ø 74 mm)', values: { Dt: 74, Db: 74, h: 100, overlap: 0 } },
      { name: 'Beer longneck 330 ml (Ø 60 mm)', values: { Dt: 60, Db: 60, h: 80 } },
      { name: 'Supplement 150 cc (Ø 55 mm)', values: { Dt: 55, Db: 55, h: 55 } },
      { name: 'Tapered sauce bottle', values: { Dt: 52, Db: 60, h: 70 } },
    ],
    build: conical,
    preview3d: (p) => ({ kind: 'cyl', dia: Math.max(p.Dt, p.Db), H: p.h }),
  },
  {
    id: 'cup-sleeve',
    name: 'Coffee Cup Sleeve',
    short: 'Arc-shaped sleeve for 8, 12, 16 and 20 oz hot cups.',
    category: 'containers',
    group: 'Cups',
    standard: 'Conical frustum development',
    material: 'carton',
    keywords: ['coffee sleeve template', 'cup sleeve dieline', 'coffee cup sleeve template', 'cup jacket template'],
    description: 'A precise arc-shaped coffee cup sleeve calculated from the cup diameter at the top and bottom of the sleeve. Includes the glue overlap and centre-front marker. Always measure your own cup – sizes vary between manufacturers.',
    params: conicalParams(88, 70, 60, 15, 0, 0),
    presets: [
      { name: '8 oz cup', values: { Dt: 78, Db: 64, h: 52 } },
      { name: '12 oz cup', values: { Dt: 88, Db: 70, h: 60 } },
      { name: '16 oz cup', values: { Dt: 89, Db: 68, h: 66 } },
      { name: '20 oz cup', values: { Dt: 90, Db: 66, h: 72 } },
    ],
    build: conical,
  },
  {
    id: 'paper-cup-wrap',
    name: 'Paper Cup Wrap (Cup Fan)',
    short: 'Printable cup blank with rim curl and bottom fold allowances.',
    category: 'containers',
    group: 'Cups',
    standard: 'Cup fan with rim curl & bottom knurl allowances',
    material: 'carton',
    keywords: ['paper cup template', 'cup fan dieline', 'paper cup printing template', 'disposable cup template'],
    description: 'The flat “fan” for a printed paper cup. Top rim curl and bottom fold-under allowances are added beyond the visible area and marked with guides, so artwork wraps cleanly.',
    params: conicalParams(80, 56, 93, 8, 5, 8),
    presets: [
      { name: '4 oz espresso (Ø 62/45, h 60)', values: { Dt: 62, Db: 45, h: 60 } },
      { name: '8 oz (Ø 80/56, h 93)', values: { Dt: 80, Db: 56, h: 93 } },
      { name: '12 oz (Ø 90/60, h 112)', values: { Dt: 90, Db: 60, h: 112 } },
      { name: '16 oz (Ø 90/60, h 136)', values: { Dt: 90, Db: 60, h: 136 } },
    ],
    build: conical,
  },
  {
    id: 'tapered-tub-label',
    name: 'Tapered Tub & Container Label',
    short: 'Ice-cream tubs, yoghurt pots and tapered food containers.',
    category: 'containers',
    group: 'Tubs',
    standard: 'Conical wrap label',
    material: 'label',
    keywords: ['tapered label template', 'ice cream tub label template', 'cone label dieline', 'yogurt cup label'],
    description: 'Labels and IML sleeves for tapered containers like pint ice-cream tubs, yoghurt pots, deli containers and plant pots. Enter the diameters at the top and bottom of the label area.',
    params: conicalParams(92, 76, 80, 8, 0, 0),
    presets: [
      { name: 'Pint ice cream tub', values: { Dt: 92, Db: 76, h: 80 } },
      { name: 'Yoghurt pot 150 g', values: { Dt: 75, Db: 60, h: 60 } },
      { name: 'Deli container 16 oz', values: { Dt: 115, Db: 100, h: 55 } },
      { name: 'Plant pot 12 cm', values: { Dt: 120, Db: 90, h: 80 } },
    ],
    build: conical,
  },
  {
    id: 'squeeze-tube',
    name: 'Cosmetic Squeeze Tube',
    short: 'Print layout for laminate & plastic tubes with crimp and eyemark.',
    category: 'tubes',
    group: 'Squeeze tubes',
    standard: 'Laminate / extruded tube print area',
    material: 'film',
    keywords: ['cosmetic tube template', 'squeeze tube dieline', 'lotion tube template', 'tube packaging artwork template'],
    description: 'Flat artwork layout for squeeze tubes used for creams, lotions, toothpaste and hand care. The print area width is the tube circumference; the crimp seal, eyemark position, shoulder clearance and laminate side seam are marked.',
    params: [
      { key: 'dia', label: 'Tube diameter', type: 'length', default: 35, min: 10, max: 80 },
      { key: 'L', label: 'Tube length (shoulder to end)', type: 'length', default: 130, min: 30, max: 300 },
      { key: 'crimp', label: 'End seal (crimp)', type: 'length', default: 5, min: 2, max: 15, group: 'Advanced' },
      { key: 'shoulder', label: 'Shoulder clearance', type: 'length', default: 3, min: 0, max: 15, group: 'Advanced' },
      { key: 'seam', label: 'Side seam (laminate)', type: 'length', default: 2, min: 0, max: 6, group: 'Advanced' },
      { key: 'eyemark', label: 'Eyemark', type: 'bool', default: true, group: 'Options' },
    ],
    presets: [
      { name: 'Lip gloss Ø 16 × 90 mm', values: { dia: 16, L: 90 } },
      { name: 'Hand cream Ø 25 × 100 mm', values: { dia: 25, L: 100 } },
      { name: 'Lotion Ø 35 × 130 mm', values: { dia: 35, L: 130 } },
      { name: 'Body wash Ø 50 × 170 mm', values: { dia: 50, L: 170 } },
    ],
    build: squeezeTube,
    preview3d: (p) => ({ kind: 'cyl', dia: p.dia, H: p.L }),
  },
  {
    id: 'paper-tube-label',
    name: 'Paper Tube / Cylinder Box Wrap',
    short: 'Body & lid wraps plus top and bottom discs for paper tubes.',
    category: 'tubes',
    group: 'Paper tubes',
    standard: 'Two-piece telescoping paper tube',
    material: 'rigid',
    caliper: true,
    keywords: ['paper tube template', 'cylinder box dieline', 'tube packaging template', 'kraft tube label', 'round box template'],
    description: 'Everything needed to wrap a two-piece paper tube (cylinder box): body wrap, lid wrap sized for the wall thickness, plus top and bottom disc labels. Add turn-in allowances to fold the wrap inside the tube.',
    params: [
      { key: 'D', label: 'Inside diameter', type: 'length', default: 70, min: 15, max: 400 },
      { key: 'H', label: 'Body height', type: 'length', default: 150, min: 20, max: 800 },
      { key: 'lidH', label: 'Lid height', type: 'length', default: 40, min: 5, max: 400 },
      { key: 'overlap', label: 'Wrap overlap', type: 'length', default: 10, min: 0, max: 40, group: 'Advanced' },
      { key: 'turnIn', label: 'Turn-in allowance', type: 'length', default: 0, min: 0, max: 30, group: 'Advanced', help: 'Extra material folded over the tube edge.' },
      { key: 'discs', label: 'Top & bottom discs', type: 'bool', default: true, group: 'Options' },
    ],
    presets: [
      { name: 'Tea tube Ø 70 × 150 mm', values: { D: 70, H: 150, lidH: 40 } },
      { name: 'Wine / spirits Ø 95 × 340 mm', values: { D: 95, H: 340, lidH: 80 } },
      { name: 'Candle tube Ø 85 × 100 mm', values: { D: 85, H: 100, lidH: 35 } },
      { name: 'Lip balm Ø 18 × 70 mm', values: { D: 18, H: 70, lidH: 25 } },
    ],
    build: paperTube,
    preview3d: (p) => ({ kind: 'cyl', dia: p.D, H: p.H }),
  },
  {
    id: 'lip-balm-label',
    name: 'Lip Balm Tube Label',
    short: 'Standard 0.15 oz lip balm and stick labels.',
    category: 'tubes',
    group: 'Squeeze tubes',
    standard: 'Cylinder wrap label',
    material: 'label',
    keywords: ['lip balm label template', 'chapstick label dieline', 'lip balm tube label size', 'deodorant stick label'],
    description: 'Wrap labels for 0.15 oz (4.25 g) lip balm tubes, solid perfume and deodorant sticks. Leave a small gap (coverage under 100%) if you want the label edges not to meet.',
    params: wrapParams(15.7, 45, 3),
    presets: [
      { name: '0.15 oz lip balm (Ø 15.7 × 45 mm)', values: { dia: 15.7, H: 45 } },
      { name: '0.3 oz jumbo (Ø 20 × 55 mm)', values: { dia: 20, H: 55 } },
      { name: 'Deodorant stick oval (≈ Ø 45 × 70 mm)', values: { dia: 45, H: 70 } },
    ],
    build: wrapLabel,
    preview3d: (p) => ({ kind: 'cyl', dia: p.dia, H: p.H }),
  },
];

function squeezeTube(p) {
  const d = newDieline();
  const C = Math.PI * p.dia;
  const L = p.L;
  d.piece(rect(0, 0, C, L));
  d.glueArea(rect(0, L - p.crimp, C, p.crimp));
  if (p.shoulder > 0) d.guide([0, p.shoulder], [C, p.shoulder]);
  if (p.seam > 0) {
    d.glueArea(rect(0, 0, p.seam, L));
    d.glueArea(rect(C - p.seam, 0, p.seam, L));
  }
  for (const q of [0.25, 0.75]) d.guide([C * q, 0], [C * q, L]);
  d.panel(rect(C * 0.25, p.shoulder, C * 0.5, L - p.shoulder - p.crimp), 'FRONT');
  d.panel(rect(0, p.shoulder, C * 0.25, L - p.shoulder - p.crimp), 'BACK');
  d.panel(rect(C * 0.75, p.shoulder, C * 0.25, L - p.shoulder - p.crimp), 'BACK');
  if (p.eyemark) {
    // eyemark sits at the open (crimp) end on the back seam for orientation
    const em = rect(C - p.seam - 5 - 1, L - p.crimp - 12, 5, 10);
    d.guide(...em, em[0]);
  }
  outerDims(d, 0, 0, C, L);
  return d;
}

function paperTube(p) {
  const d = newDieline();
  const t = p.t || 1.5;
  const Db = p.D + 2 * t; // body outside
  const Dl = Db + 2 * t + 0.6; // lid outside (wall + clearance)
  const o = p.overlap;
  const ti = p.turnIn || 0;
  const Wb = Math.PI * Db + o;
  const Wl = Math.PI * Dl + o;
  const yb = 0;
  const Hb = p.H + 2 * ti;
  d.piece(rect(0, yb, Wb, Hb));
  d.glueArea(rect(Wb - o, yb, o, Hb));
  if (ti) {
    d.crease([0, yb + ti], [Wb, yb + ti]);
    d.crease([0, yb + Hb - ti], [Wb, yb + Hb - ti]);
  }
  d.panel(rect(0, yb + ti, Wb - o, p.H), 'BODY WRAP');
  const yl = Hb + 12;
  const Hl = p.lidH + 2 * ti;
  d.piece(rect(0, yl, Wl, Hl));
  d.glueArea(rect(Wl - o, yl, o, Hl));
  if (ti) {
    d.crease([0, yl + ti], [Wl, yl + ti]);
    d.crease([0, yl + Hl - ti], [Wl, yl + Hl - ti]);
  }
  d.panel(rect(0, yl + ti, Wl - o, p.lidH), 'LID WRAP');
  if (p.discs) {
    const x0 = Math.max(Wb, Wl) + 15;
    const rt = Dl / 2 - 1;
    const rb = Db / 2 - 1;
    d.piece(circle(x0 + rt, rt, rt));
    d.panel(rect(x0 + rt * 0.3, rt * 0.3, rt * 1.4, rt * 1.4), 'TOP', { safe: true });
    d.piece(circle(x0 + rt, 2 * rt + 12 + rb, rb));
    d.panel(rect(x0 + rt - rb * 0.7, 2 * rt + 12 + rb * 0.3, rb * 1.4, rb * 1.4), 'BOTTOM', { safe: true });
  }
  d.dim([0, yb], [Wb, yb], 8);
  d.dim([0, yb], [0, yb + Hb], -8);
  d.dim([0, yl + Hl], [Wl, yl + Hl], -9);
  return d;
}
