import { rect, roundRect, taper, fillet, onEdge, offset, difference, intersect } from '../geometry.js';
import { newDieline, pick, clamp } from './helpers.js';

const IN = 25.4;

/** Band of half-width w centred on segment p0–p1 (clipped to the flap later). */
function seamStrip(p0, p1, n, w) {
  const o = (p, k) => [p[0] + n[0] * w * k, p[1] + n[1] * w * k];
  return [o(p0, -1), o(p1, -1), o(p1, 1), o(p0, 1)];
}

function envelope(p) {
  const d = newDieline();
  const W = p.W;
  const H = p.H;
  const style = p.flap || 'square';
  const ft = pick(p.flapDepth, H * (style === 'pointed' ? 0.5 : style === 'wallet' ? 0.42 : 0.36));
  const sw = pick(p.sideFlap, clamp(W * 0.13, 10, 45));
  const hb = pick(p.bottomFlap, H * (style === 'pointed' ? 0.55 : 0.62));
  const rel = 2;

  d.piece(rect(0, 0, W, H));
  d.panel(rect(0, 0, W, H), 'FRONT');

  // seal flap
  let prof;
  if (style === 'pointed') {
    const pts = [
      [0, 0],
      [rel, rel],
      [W / 2, ft],
      [W - rel, rel],
      [W, 0],
    ];
    prof = fillet(pts, [0, 2, Math.min(10, W * 0.05), 2, 0]);
  } else if (style === 'rounded') {
    prof = taper(W, ft, Math.min(W * 0.06, ft * 0.4) + rel, Math.min(W * 0.06, ft * 0.4) + rel, ft * 0.6);
  } else {
    prof = taper(W, ft, Math.min(W * 0.05, ft * 0.35) + rel, Math.min(W * 0.05, ft * 0.35) + rel, style === 'wallet' ? 3 : 5);
  }
  const flapPoly = onEdge([0, 0], [W, 0], prof);
  d.flap([0, 0], [W, 0], prof);
  d.panel(
    onEdge([0, 0], [W, 0], [
      [W * 0.2, 0],
      [W * 0.2, ft * 0.5],
      [W * 0.8, ft * 0.5],
      [W * 0.8, 0],
    ]),
    'SEAL FLAP',
    { angle: 180, safe: false },
  );
  if (p.gum !== false) {
    const band = rect(-1, -ft - 1, W + 2, ft * 0.55 + 1);
    const inner = offset([flapPoly], -2);
    const gum = difference(intersect(inner, [band]), offset([flapPoly], -11));
    gum.forEach((g) => d.glueArea(g));
  }

  // side flaps
  const ins = Math.min(H * 0.22, sw * 1.6);
  d.flap([0, H], [0, 0], taper(H, sw, ins, ins, 4));
  d.flap([W, 0], [W, H], taper(H, sw, ins, ins, 4));

  // bottom flap, glued to the side flaps along its slanted edges
  const bi = Math.min(sw * 0.95, W * 0.3);
  const bprof = taper(W, hb, bi + rel, bi + rel, 4);
  const bpoly = onEdge([W, H], [0, H], bprof);
  d.flap([W, H], [0, H], bprof);
  d.panel(rect(W * 0.25, H, W * 0.5, hb * 0.8), 'BOTTOM FLAP', { safe: false });
  // glue strips along the two slanted edges
  const s0 = bpoly[0];
  const s1 = bpoly[1];
  const e0 = bpoly[bpoly.length - 1];
  const e1 = bpoly[bpoly.length - 2];
  const gw = Math.min(6, sw * 0.4);
  const n1 = norm([s1[1] - s0[1], -(s1[0] - s0[0])]);
  const n2 = norm([e1[1] - e0[1], -(e1[0] - e0[0])]);
  const strip1 = seamStrip(lerp(s0, s1, 0.08), lerp(s0, s1, 0.85), n1, gw);
  const strip2 = seamStrip(lerp(e0, e1, 0.08), lerp(e0, e1, 0.85), n2, gw);
  for (const s of [strip1, strip2]) {
    const z = intersect(offset([bpoly], -1), [s])[0];
    if (z) d.glueArea(z);
  }

  if (p.window) {
    const ww = pick(p.winW, 4.5 * IN);
    const wh = pick(p.winH, 1.125 * IN);
    const wx = pick(p.winX, 0.875 * IN);
    const wy = pick(p.winY, 0.5 * IN);
    if (wx + ww < W && wy + wh < H) d.hole(roundRect(wx, H - wy - wh, ww, wh, 3));
  }
  d.dim([0, H * 0.82], [W, H * 0.82]);
  d.dim([W * 0.9, 0], [W * 0.9, H]);
  return d;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const flapOpt = {
  key: 'flap',
  label: 'Flap style',
  type: 'select',
  default: 'square',
  options: [
    { value: 'square', label: 'Square' },
    { value: 'pointed', label: 'Pointed (Euro / Baronial)' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'wallet', label: 'Wallet (deep square)' },
  ],
};

const envParams = (W, H, flap) => [
  { key: 'W', label: 'Width', type: 'length', default: W, min: 40, max: 600, help: 'Finished envelope width.' },
  { key: 'H', label: 'Height', type: 'length', default: H, min: 30, max: 600, help: 'Finished envelope height.' },
  { ...flapOpt, default: flap },
  { key: 'gum', label: 'Gum / peel-and-seal strip', type: 'bool', default: true, group: 'Options' },
  { key: 'window', label: 'Address window', type: 'bool', default: false, group: 'Options' },
  { key: 'winW', label: 'Window width', type: 'length', default: 114.3, min: 10, max: 400, group: 'Options', showIf: 'window' },
  { key: 'winH', label: 'Window height', type: 'length', default: 28.6, min: 10, max: 200, group: 'Options', showIf: 'window' },
  { key: 'winX', label: 'Window from left', type: 'length', default: 22.2, min: 5, max: 300, group: 'Options', showIf: 'window' },
  { key: 'winY', label: 'Window from bottom', type: 'length', default: 12.7, min: 5, max: 300, group: 'Options', showIf: 'window' },
  { key: 'flapDepth', label: 'Seal flap depth', type: 'length', auto: true, min: 10, max: 400, group: 'Advanced' },
  { key: 'sideFlap', label: 'Side flap width', type: 'length', auto: true, min: 5, max: 200, group: 'Advanced' },
  { key: 'bottomFlap', label: 'Bottom flap height', type: 'length', auto: true, min: 10, max: 400, group: 'Advanced' },
];

const presets = [
  { name: 'A7 invitation 7¼ × 5¼ in', values: { W: 184.2, H: 133.4 } },
  { name: 'A2 note card 5¾ × 4⅜ in', values: { W: 146.1, H: 111.1 } },
  { name: 'A6 6½ × 4¾ in', values: { W: 165.1, H: 120.7 } },
  { name: 'A9 8¾ × 5¾ in', values: { W: 222.3, H: 146.1 } },
  { name: '#10 business 9½ × 4⅛ in', values: { W: 241.3, H: 104.8 } },
  { name: '#9 return 8⅞ × 3⅞ in', values: { W: 225.4, H: 98.4 } },
  { name: '6 × 9 in booklet', values: { W: 228.6, H: 152.4 } },
  { name: 'Square 5½ in', values: { W: 139.7, H: 139.7 } },
  { name: 'DL 220 × 110 mm', values: { W: 220, H: 110, winW: 90, winH: 45, winX: 20, winY: 15 } },
  { name: 'C6 162 × 114 mm', values: { W: 162, H: 114 } },
  { name: 'C5 229 × 162 mm', values: { W: 229, H: 162 } },
  { name: 'C4 324 × 229 mm', values: { W: 324, H: 229 } },
];

export default [
  {
    id: 'invitation-envelope',
    name: 'Invitation Envelope',
    short: 'A7, A2, square and C-series envelopes with pointed or square flap.',
    category: 'envelopes',
    group: 'Envelopes',
    standard: 'US A-style & ISO C-series sizes',
    material: 'paper',
    keywords: ['envelope template', 'A7 envelope dieline', 'invitation envelope template', 'envelope die line', 'euro flap envelope'],
    description:
      'Make a custom envelope for wedding invitations, greeting cards and announcements. Choose a square, pointed (Euro / baronial), rounded or wallet flap; side flaps and a glued bottom flap are generated automatically with glue zones marked.',
    params: envParams(184.2, 133.4, 'pointed'),
    presets,
    build: envelope,
  },
  {
    id: 'business-envelope',
    name: 'Business Envelope (#10, DL, C5)',
    short: 'Commercial envelopes with optional address window.',
    category: 'envelopes',
    group: 'Envelopes',
    standard: 'US #10 / ISO DL & C-series',
    material: 'paper',
    keywords: ['#10 envelope template', 'DL envelope dieline', 'window envelope template', 'business envelope template', 'C5 envelope'],
    description:
      'Commercial and mailing envelopes in US #9, #10 and ISO DL / C-series sizes. Turn on the address window to get the standard window position (#10: 4½ × 1⅛ in, ⅞ in from the left, ½ in from the bottom) or set your own.',
    params: envParams(241.3, 104.8, 'square'),
    presets: presets.filter((x) => /#|DL|C\d|booklet/.test(x.name)),
    build: envelope,
  },
];
