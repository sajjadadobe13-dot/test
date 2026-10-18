import { rect, roundRect, fillet, circle, ellipse, taper, onEdge, offset } from '../geometry.js';
import { newDieline, pick, clamp, outerDims } from './helpers.js';

const IN = 25.4;

function hangTag(p) {
  const d = newDieline();
  const { W, H } = p;
  const r = Math.min(p.corner, W / 2, H / 2);
  let shape;
  if (p.shape === 'notched') {
    const c = Math.min(W * 0.22, H * 0.15);
    shape = fillet(
      [
        [c, 0],
        [W - c, 0],
        [W, c],
        [W, H],
        [0, H],
        [0, c],
      ],
      [0, 0, 0, r, r, 0],
    );
  } else if (p.shape === 'arch') {
    shape = fillet(rect(0, 0, W, H), [W / 2, W / 2, r, r]);
  } else shape = roundRect(0, 0, W, H, r);
  d.piece(shape);
  if (p.hole > 0) d.hole(circle(W / 2, pick(p.holeOffset, Math.max(p.hole, 8)), p.hole / 2));
  d.panel(rect(0, 0, W, H), 'FRONT');
  outerDims(d, 0, 0, W, H);
  return d;
}

function businessCard(p) {
  const d = newDieline();
  d.piece(roundRect(0, 0, p.W, p.H, Math.min(p.corner, p.W / 2, p.H / 2)));
  d.panel(rect(0, 0, p.W, p.H), 'FRONT');
  outerDims(d, 0, 0, p.W, p.H);
  return d;
}

function sticker(p) {
  const d = newDieline();
  const { W } = p;
  const H = p.shape === 'circle' ? W : p.H;
  let poly;
  if (p.shape === 'circle') poly = circle(W / 2, W / 2, W / 2);
  else if (p.shape === 'oval') poly = ellipse(W / 2, H / 2, W / 2, H / 2);
  else poly = roundRect(0, 0, W, H, p.shape === 'rounded' ? Math.min(pick(p.corner, 4), W / 2, H / 2) : 0);
  d.piece(poly);
  d.panel(p.shape === 'circle' || p.shape === 'oval' ? rect(W * 0.15, H * 0.15, W * 0.7, H * 0.7) : rect(0, 0, W, H), 'LABEL');
  outerDims(d, 0, 0, W, H);
  return d;
}

function folder(p) {
  const d = newDieline();
  const { W, H } = p;
  const ph = p.pocket;
  const sp = p.spine || 0;
  const tw = 12;
  const g = 3;
  const total = 2 * W + sp;
  d.piece(rect(0, 0, total, H));
  d.panel(rect(0, 0, W, H), 'BACK COVER');
  d.panel(rect(W + sp, 0, W, H), 'FRONT COVER');
  d.crease([W, 0], [W, H]);
  if (sp) d.crease([W + sp, 0], [W + sp, H]);
  const ch = Math.min(ph * 0.4, 40);
  const pockets = p.pockets === 'right' ? ['R'] : ['L', 'R'];
  for (const side of pockets) {
    if (side === 'L') {
      // edge runs right→left so the pocket hangs below; u = 0 at the spine
      const L = W;
      const prof = [
        [0, 0],
        [g, g],
        [g, ph - ch],
        [g + ch, ph],
        [L, ph],
        [L, 0],
      ];
      d.flap([W, H], [0, H], prof);
      d.flap([0, H + ph], [0, H], taper(ph, tw, 3, 3 + tw * 0.5));
      const tab = onEdge([0, H + ph], [0, H], taper(ph, tw, 3, 3 + tw * 0.5));
      const z = offset([tab], -1.5)[0];
      if (z) d.glueArea(z);
      d.panel(rect(W * 0.2, H, W * 0.6, ph), 'POCKET (INSIDE)', { angle: 180, safe: false });
    } else {
      const L = W;
      const x0 = W + sp;
      const prof = [
        [0, 0],
        [0, ph],
        [L - g - ch, ph],
        [L - g, ph - ch],
        [L - g, g],
        [L, 0],
      ];
      d.flap([x0 + W, H], [x0, H], prof);
      d.flap([x0 + W, H], [x0 + W, H + ph], taper(ph, tw, 3 + tw * 0.5, 3));
      const tab = onEdge([x0 + W, H], [x0 + W, H + ph], taper(ph, tw, 3 + tw * 0.5, 3));
      const z = offset([tab], -1.5)[0];
      if (z) d.glueArea(z);
      d.panel(rect(x0 + W * 0.2, H, W * 0.6, ph), 'POCKET (INSIDE)', { angle: 180, safe: false });
      if (p.cardSlits) {
        // 3.5 × 2 in business card held by four diagonal corner slits
        const cw = 3.5 * IN;
        const chh = 2 * IN;
        const cx = x0 + W / 2;
        const cy = H + ph * 0.5;
        const s = 7;
        const corners = [
          [cx - cw / 2, cy - chh / 2, 1, 1],
          [cx + cw / 2, cy - chh / 2, -1, 1],
          [cx - cw / 2, cy + chh / 2, 1, -1],
          [cx + cw / 2, cy + chh / 2, -1, -1],
        ];
        if (chh + 10 < ph && cw + 10 < W)
          for (const [x, y, sx, sy] of corners) d.cut([x - sx * 2, y + sy * (s + 2)], [x + sx * (s + 2), y - sy * 2]);
      }
    }
  }
  d.dim([0, H * 0.85], [W, H * 0.85]);
  d.dim([W * 0.1, 0], [W * 0.1, H]);
  d.dim([total - W * 0.1, H], [total - W * 0.1, H + ph]);
  return d;
}

function tableTent(p) {
  const d = newDieline();
  const { W, H, B } = p;
  const G = 15;
  const total = 2 * H + B + G;
  d.piece(rect(0, 0, W, 2 * H + B));
  d.flap([W, 2 * H + B], [0, 2 * H + B], taper(W, G, 3, 3));
  d.crease([0, H], [W, H]);
  d.crease([0, 2 * H], [W, 2 * H]);
  d.panel(rect(0, 0, W, H), 'SIDE A', { angle: 180 });
  d.panel(rect(0, H, W, H), 'SIDE B');
  d.panel(rect(0, 2 * H, W, B), 'BASE', { safe: false });
  const gz = offset([onEdge([W, 2 * H + B], [0, 2 * H + B], taper(W, G, 3, 3))], -1.5)[0];
  if (gz) d.glueArea(gz);
  d.dim([0, H * 0.8], [W, H * 0.8]);
  d.dim([W * 0.9, H], [W * 0.9, 2 * H]);
  d.info.note = `Flat height ${total.toFixed(1)} mm`;
  return d;
}

function trifold(p) {
  const d = newDieline();
  const { W, H } = p;
  const a = p.fold === 'z' ? 0 : pick(p.foldIn, 1.6);
  const x = (W + a) / 3;
  const y = x - a;
  d.piece(rect(0, 0, W, H));
  const widths = p.fold === 'z' ? [W / 3, W / 3, W / 3] : [y, x, x];
  const labels = p.fold === 'z' ? ['PANEL 1', 'PANEL 2', 'PANEL 3'] : ['INSIDE FLAP', 'BACK COVER', 'FRONT COVER'];
  let cx = 0;
  widths.forEach((w, i) => {
    if (i) d.crease([cx, 0], [cx, H]);
    d.panel(rect(cx, 0, w, H), labels[i]);
    cx += w;
  });
  d.dim([0, H], [widths[0], H], -9);
  d.dim([widths[0], H], [widths[0] + widths[1], H], -9);
  d.dim([widths[0] + widths[1], H], [W, H], -9);
  d.dim([W, 0], [W, H], 9);
  return d;
}

function greetingCard(p) {
  const d = newDieline();
  const { W, H } = p;
  if (p.fold === 'top') {
    d.piece(rect(0, 0, W, 2 * H));
    d.crease([0, H], [W, H]);
    d.panel(rect(0, 0, W, H), 'BACK', { angle: 180 });
    d.panel(rect(0, H, W, H), 'FRONT');
  } else {
    d.piece(rect(0, 0, 2 * W, H));
    d.crease([W, 0], [W, H]);
    d.panel(rect(0, 0, W, H), 'BACK');
    d.panel(rect(W, 0, W, H), 'FRONT');
  }
  outerDims(d, 0, 0, p.fold === 'top' ? W : 2 * W, p.fold === 'top' ? 2 * H : H);
  return d;
}

function neckHanger(p) {
  const d = newDieline();
  const { W, H } = p;
  const hr = p.neck / 2;
  d.piece(fillet(rect(0, 0, W, H), [W / 2, W / 2, 4, 4]));
  const cy = Math.max(hr + 8, W / 2);
  d.hole(circle(W / 2, cy, hr));
  // radial grip slits let the hole stretch over the bottle neck
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 8;
    const r2 = hr + Math.min(5, hr * 0.35);
    d.cut([W / 2 + hr * Math.cos(a), cy + hr * Math.sin(a)], [W / 2 + r2 * Math.cos(a), cy + r2 * Math.sin(a)]);
  }
  d.panel(rect(0, cy + hr + 6, W, H - cy - hr - 6), 'FRONT');
  outerDims(d, 0, 0, W, H);
  return d;
}

function doorHanger(p) {
  const d = newDieline();
  const { W, H } = p;
  const hr = p.hole / 2;
  d.piece(roundRect(0, 0, W, H, Math.min(p.corner, W / 4)));
  const cy = hr + clamp(W * 0.12, 8, 25);
  d.hole(circle(W / 2, cy, hr));
  // entry slit from the hole to the side so it can slip over the handle
  const a = Math.PI * 0.15;
  d.cut([W / 2 + hr * Math.cos(a), cy + hr * Math.sin(a)], [W, cy + hr * Math.sin(a) + (W / 2 - hr * Math.cos(a)) * Math.tan(a)]);
  d.panel(rect(0, cy + hr + 8, W, H - cy - hr - 8), 'FRONT');
  outerDims(d, 0, 0, W, H);
  return d;
}

export default [
  {
    id: 'hang-tag',
    name: 'Hang Tag',
    short: 'Clothing & product tags with hole, rounded or notched corners.',
    category: 'prints',
    group: 'Tags & cards',
    standard: 'Swing tag',
    material: 'carton',
    keywords: ['hang tag template', 'clothing tag dieline', 'swing tag template', 'price tag template'],
    description: 'Swing tags for apparel, gifts and products. Choose rectangular, notched or arched shapes, corner radius and string hole size and position.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 50.8, min: 15, max: 300 },
      { key: 'H', label: 'Height', type: 'length', default: 88.9, min: 15, max: 400 },
      { key: 'shape', label: 'Shape', type: 'select', default: 'rect', options: [{ value: 'rect', label: 'Rectangle' }, { value: 'notched', label: 'Notched top' }, { value: 'arch', label: 'Arched top' }] },
      { key: 'corner', label: 'Corner radius', type: 'length', default: 3, min: 0, max: 50 },
      { key: 'hole', label: 'Hole diameter', type: 'length', default: 5, min: 0, max: 20, group: 'Options', help: '0 = no hole.' },
      { key: 'holeOffset', label: 'Hole from top', type: 'length', auto: true, min: 3, max: 100, group: 'Options' },
    ],
    presets: [
      { name: '2 × 3.5 in', values: { W: 50.8, H: 88.9 } },
      { name: '2 × 2 in square', values: { W: 50.8, H: 50.8 } },
      { name: '50 × 90 mm notched', values: { W: 50, H: 90, shape: 'notched' } },
      { name: '1.5 × 3 in arched', values: { W: 38.1, H: 76.2, shape: 'arch' } },
    ],
    build: hangTag,
  },
  {
    id: 'business-card',
    name: 'Business Card',
    short: 'US, EU, Japan and Australia sizes with optional round corners.',
    category: 'prints',
    group: 'Tags & cards',
    standard: 'ISO 7810 / regional card sizes',
    material: 'carton',
    keywords: ['business card template', 'business card dieline', 'business card size bleed', 'rounded corner business card'],
    description: 'Business card print template with bleed and safe zone. Includes US (3.5 × 2 in), European (85 × 55 mm), Japanese (91 × 55 mm), Australian (90 × 55 mm) and credit-card sizes.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 88.9, min: 20, max: 200 },
      { key: 'H', label: 'Height', type: 'length', default: 50.8, min: 20, max: 200 },
      { key: 'corner', label: 'Corner radius', type: 'length', default: 0, min: 0, max: 20 },
    ],
    presets: [
      { name: 'US 3.5 × 2 in', values: { W: 88.9, H: 50.8 } },
      { name: 'Europe 85 × 55 mm', values: { W: 85, H: 55 } },
      { name: 'Japan 91 × 55 mm', values: { W: 91, H: 55 } },
      { name: 'Australia 90 × 55 mm', values: { W: 90, H: 55 } },
      { name: 'Credit card ISO 85.6 × 54 mm', values: { W: 85.6, H: 53.98, corner: 3.18 } },
    ],
    build: businessCard,
  },
  {
    id: 'sticker-label',
    name: 'Sticker & Label',
    short: 'Rectangle, rounded, circle and oval die-cut stickers.',
    category: 'prints',
    group: 'Labels',
    standard: 'Kiss-cut / die-cut label',
    material: 'label',
    keywords: ['sticker template', 'label dieline', 'circle sticker template', 'die cut sticker template', 'product label template'],
    description: 'Die-cut and kiss-cut stickers and product labels in rectangle, rounded rectangle, circle and oval shapes – with bleed and safe zone for print shops and roll-label printers.',
    params: [
      { key: 'shape', label: 'Shape', type: 'select', default: 'rounded', options: [{ value: 'rect', label: 'Rectangle' }, { value: 'rounded', label: 'Rounded rectangle' }, { value: 'circle', label: 'Circle' }, { value: 'oval', label: 'Oval' }] },
      { key: 'W', label: 'Width / diameter', type: 'length', default: 76.2, min: 5, max: 600 },
      { key: 'H', label: 'Height', type: 'length', default: 50.8, min: 5, max: 600 },
      { key: 'corner', label: 'Corner radius', type: 'length', default: 4, min: 0, max: 50, showIf: (v) => v.shape === 'rounded' },
    ],
    presets: [
      { name: 'Circle 2 in', values: { shape: 'circle', W: 50.8 } },
      { name: 'Circle 3 in', values: { shape: 'circle', W: 76.2 } },
      { name: 'Rectangle 3 × 2 in', values: { shape: 'rounded', W: 76.2, H: 50.8 } },
      { name: 'Oval 3 × 2 in', values: { shape: 'oval', W: 76.2, H: 50.8 } },
      { name: 'Shipping label 4 × 6 in', values: { shape: 'rect', W: 101.6, H: 152.4 } },
    ],
    build: sticker,
  },
  {
    id: 'presentation-folder',
    name: 'Presentation Folder',
    short: '9 × 12 in / A4 pocket folder with business-card slits.',
    category: 'prints',
    group: 'Stationery',
    standard: 'Two-pocket folder with glued pocket tabs',
    material: 'carton',
    keywords: ['presentation folder template', 'pocket folder dieline', '9x12 folder template', 'A4 folder template'],
    description: 'Pocket folders for proposals, press kits and corporate stationery. Generates covers, one or two glued pockets, optional spine for capacity and business-card slits.',
    params: [
      { key: 'W', label: 'Cover width', type: 'length', default: 228.6, min: 100, max: 500 },
      { key: 'H', label: 'Cover height', type: 'length', default: 304.8, min: 100, max: 600 },
      { key: 'pocket', label: 'Pocket height', type: 'length', default: 101.6, min: 30, max: 300 },
      { key: 'pockets', label: 'Pockets', type: 'select', default: 'both', options: [{ value: 'both', label: 'Two pockets' }, { value: 'right', label: 'Right pocket only' }] },
      { key: 'spine', label: 'Spine (capacity)', type: 'length', default: 0, min: 0, max: 30, group: 'Options' },
      { key: 'cardSlits', label: 'Business-card slits', type: 'bool', default: true, group: 'Options' },
    ],
    presets: [
      { name: 'US 9 × 12 in', values: { W: 228.6, H: 304.8, pocket: 101.6 } },
      { name: 'A4 (220 × 310 mm)', values: { W: 220, H: 310, pocket: 100 } },
    ],
    build: folder,
  },
  {
    id: 'table-tent',
    name: 'Table Tent',
    short: 'A-frame tent card for menus, events and promotions.',
    category: 'prints',
    group: 'Display',
    standard: 'Triangular tent with glued base',
    material: 'carton',
    keywords: ['table tent template', 'tent card dieline', 'menu tent template', 'table talker template'],
    description: 'A self-standing triangular table tent with two printable sides, a base and glue tab – ideal for restaurant menus, event seating and point-of-sale promotions.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 101.6, min: 40, max: 400 },
      { key: 'H', label: 'Panel height', type: 'length', default: 152.4, min: 40, max: 400 },
      { key: 'B', label: 'Base depth', type: 'length', default: 50, min: 15, max: 200 },
    ],
    presets: [
      { name: '4 × 6 in', values: { W: 101.6, H: 152.4, B: 50 } },
      { name: '5 × 7 in', values: { W: 127, H: 177.8, B: 60 } },
      { name: 'A6 105 × 148 mm', values: { W: 105, H: 148, B: 50 } },
    ],
    build: tableTent,
  },
  {
    id: 'trifold-brochure',
    name: 'Tri-Fold Brochure',
    short: 'Letter & A4 roll-fold with compensated fold-in panel, or Z-fold.',
    category: 'prints',
    group: 'Stationery',
    standard: 'Roll fold with fold-in compensation',
    material: 'paper',
    keywords: ['trifold brochure template', 'tri fold panel sizes', 'brochure dieline', 'z fold template'],
    description: 'Tri-fold brochure guides with the industry-standard narrower fold-in panel (1/16 in / 1.6 mm) so the panel tucks in without buckling. Switch to Z-fold for equal panels.',
    params: [
      { key: 'W', label: 'Flat width', type: 'length', default: 279.4, min: 100, max: 1000 },
      { key: 'H', label: 'Height', type: 'length', default: 215.9, min: 50, max: 1000 },
      { key: 'fold', label: 'Fold', type: 'select', default: 'roll', options: [{ value: 'roll', label: 'Roll / letter fold' }, { value: 'z', label: 'Z-fold' }] },
      { key: 'foldIn', label: 'Fold-in reduction', type: 'length', auto: true, min: 0, max: 10, group: 'Advanced', showIf: (v) => v.fold !== 'z' },
    ],
    presets: [
      { name: 'US Letter 11 × 8.5 in', values: { W: 279.4, H: 215.9 } },
      { name: 'US Legal 14 × 8.5 in', values: { W: 355.6, H: 215.9 } },
      { name: 'A4 297 × 210 mm', values: { W: 297, H: 210 } },
    ],
    build: trifold,
  },
  {
    id: 'greeting-card',
    name: 'Folded Greeting Card',
    short: 'Side- or top-fold cards in A2, A7, 5 × 7 and A6.',
    category: 'prints',
    group: 'Stationery',
    standard: 'Single-fold card',
    material: 'carton',
    keywords: ['greeting card template', 'folded card dieline', 'A7 card template', '5x7 card template'],
    description: 'Single-fold greeting and invitation cards with a centre score. Pair with the matching invitation envelope template.',
    params: [
      { key: 'W', label: 'Folded width', type: 'length', default: 127, min: 30, max: 400 },
      { key: 'H', label: 'Folded height', type: 'length', default: 177.8, min: 30, max: 400 },
      { key: 'fold', label: 'Fold', type: 'select', default: 'side', options: [{ value: 'side', label: 'Side fold' }, { value: 'top', label: 'Top fold' }] },
    ],
    presets: [
      { name: '5 × 7 in (fits A7)', values: { W: 127, H: 177.8 } },
      { name: 'A2 4.25 × 5.5 in', values: { W: 107.95, H: 139.7 } },
      { name: 'A6 105 × 148 mm', values: { W: 105, H: 148 } },
    ],
    build: greetingCard,
  },
  {
    id: 'bottle-neck-hanger',
    name: 'Bottle Neck Hanger',
    short: 'Promotional collar tag for wine, spirits and oil bottles.',
    category: 'containers',
    group: 'Bottles',
    standard: 'Neck collar with grip slits',
    material: 'carton',
    keywords: ['bottle neck hanger template', 'neck tag dieline', 'wine bottle tag template', 'bottle collar template'],
    description: 'A neck hanger (bottle collar) with a stretch hole and radial grip slits that holds firmly on wine, spirits, olive oil and beverage bottles.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 60, min: 30, max: 200 },
      { key: 'H', label: 'Height', type: 'length', default: 140, min: 50, max: 400 },
      { key: 'neck', label: 'Neck hole diameter', type: 'length', default: 30, min: 10, max: 80 },
    ],
    presets: [
      { name: 'Wine bottle (Ø 30 mm neck)', values: { W: 60, H: 140, neck: 30 } },
      { name: 'Beer / soda (Ø 27 mm neck)', values: { W: 55, H: 120, neck: 27 } },
    ],
    build: neckHanger,
  },
  {
    id: 'door-hanger',
    name: 'Door Hanger',
    short: '3.5 × 8.5 in and 4.25 × 11 in hangers with slit.',
    category: 'prints',
    group: 'Display',
    standard: 'Door hanger with handle hole and slit',
    material: 'carton',
    keywords: ['door hanger template', 'door hanger dieline', '4.25 x 11 door hanger', 'hotel door hanger template'],
    description: 'Door hangers for hotels, real estate and local marketing with a handle hole and entry slit.',
    params: [
      { key: 'W', label: 'Width', type: 'length', default: 107.95, min: 60, max: 200 },
      { key: 'H', label: 'Height', type: 'length', default: 279.4, min: 120, max: 500 },
      { key: 'hole', label: 'Hole diameter', type: 'length', default: 85.7, min: 20, max: 150 },
      { key: 'corner', label: 'Corner radius', type: 'length', default: 6, min: 0, max: 40 },
    ],
    presets: [
      { name: '4.25 × 11 in', values: { W: 107.95, H: 279.4, hole: 85.7 } },
      { name: '3.5 × 8.5 in', values: { W: 88.9, H: 215.9, hole: 63.5 } },
    ],
    build: doorHanger,
  },
];
