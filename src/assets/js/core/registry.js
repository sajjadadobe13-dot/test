import boxes from './templates/boxes.js';
import envelopes from './templates/envelopes.js';
import bags from './templates/bags.js';
import labels from './templates/labels.js';
import prints from './templates/prints.js';
import { resolve } from './geometry.js';

export const CATEGORIES = [
  { id: 'boxes', name: 'Boxes & Cartons', short: 'Boxes', blurb: 'Tuck end, mailer, RSC shipping, trays, pillow and gable boxes.' },
  { id: 'envelopes', name: 'Envelopes', short: 'Envelopes', blurb: 'Invitation, A-style, #10, DL and C-series envelopes.' },
  { id: 'pouches', name: 'Pouches & Bags', short: 'Pouches', blurb: 'Stand-up pouches, sachets, flow wraps, coffee and paper bags.' },
  { id: 'cans', name: 'Cans & Bottles', short: 'Cans', blurb: 'Beverage can, jar, tin and bottle wrap labels.' },
  { id: 'tubes', name: 'Tubes', short: 'Tubes', blurb: 'Squeeze tubes, paper tubes and lip balm labels.' },
  { id: 'containers', name: 'Containers & Cups', short: 'Containers', blurb: 'Cup sleeves, cup fans, tapered tubs and neck hangers.' },
  { id: 'prints', name: 'Other Prints', short: 'Prints', blurb: 'Hang tags, stickers, cards, folders, brochures and more.' },
];

const all = [...boxes, ...envelopes, ...bags, ...labels, ...prints];
const order = CATEGORIES.map((c) => c.id);
export const TEMPLATES = all.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

export const byId = (id) => TEMPLATES.find((t) => t.id === id);

/** Whether a template's geometry depends on material thickness. */
export const usesCaliper = (t) => !!(t.dimMode || t.caliper);

/** Board / substrate presets per material family (caliper in mm). */
export const MATERIALS = {
  carton: { label: 'Paperboard', default: 0.4, options: [
    { value: 0.3, label: 'SBS 12 pt (0.30 mm)' }, { value: 0.36, label: 'SBS 14 pt (0.36 mm)' }, { value: 0.4, label: 'SBS 16 pt (0.40 mm)' },
    { value: 0.46, label: 'SBS 18 pt (0.46 mm)' }, { value: 0.61, label: 'SBS 24 pt (0.61 mm)' }, { value: 0.5, label: 'Kraft CUK 0.50 mm' } ] },
  corrugated: { label: 'Corrugated board', default: 1.5, options: [
    { value: 0.8, label: 'F-flute (0.8 mm)' }, { value: 1.5, label: 'E-flute (1.5 mm)' }, { value: 3, label: 'B-flute (3 mm)' },
    { value: 4, label: 'C-flute (4 mm)' }, { value: 4.5, label: 'EB double wall (4.5 mm)' }, { value: 6.5, label: 'BC double wall (6.5 mm)' } ] },
  rigid: { label: 'Rigid board', default: 1.5, options: [
    { value: 1, label: 'Greyboard 1.0 mm' }, { value: 1.5, label: 'Greyboard 1.5 mm' }, { value: 2, label: 'Greyboard 2.0 mm' }, { value: 2.5, label: 'Greyboard 2.5 mm' } ] },
  paper: { label: 'Paper', default: 0.1, options: [
    { value: 0.1, label: '80–100 gsm (0.10 mm)' }, { value: 0.15, label: '120–150 gsm (0.15 mm)' }, { value: 0.2, label: '170–200 gsm (0.20 mm)' } ] },
  film: { label: 'Flexible film', default: 0, options: [{ value: 0, label: 'Laminate film (thickness ignored)' }] },
  label: { label: 'Label stock', default: 0, options: [{ value: 0, label: 'Label stock (thickness ignored)' }] },
};

/** Default parameter values for a template. */
export function defaults(tpl) {
  const v = {};
  for (const p of tpl.params) v[p.key] = p.auto ? null : p.default;
  return v;
}

/** Build + resolve a template with global settings. */
export function generate(tpl, values, settings = {}) {
  const { t = MATERIALS[tpl.material]?.default ?? 0, dimMode = 'inner', bleed = 3, safe = 3 } = settings;
  const p = { ...defaults(tpl), ...values, t, dimMode };
  const d = tpl.build(p);
  const res = resolve(d, { bleed, safe });
  if (!res.layers.cut.length) throw new Error('These dimensions do not produce a valid dieline.');
  return res;
}
