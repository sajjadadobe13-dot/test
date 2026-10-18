/**
 * AutoCAD R12 ASCII DXF – the most widely accepted dialect for cutting
 * tables, plotters, ArtiosCAD, Esko, LightBurn and CAD tools.
 * Units: millimetres, y axis up. One layer per die element.
 */
import { LAYERS, LAYER_ORDER } from './compose.js';

const f = (v) => (Math.round(v * 10000) / 10000).toString();
const DXF_LAYER = { cut: 'CUT', crease: 'CREASE', perf: 'PERFORATION', bleed: 'BLEED', safe: 'SAFE_ZONE', glue: 'GLUE', guide: 'GUIDES', info: 'ANNOTATION' };
const LTYPE = { crease: 'DASHED', perf: 'DOT', safe: 'DASHED', guide: 'DOT', glue: 'DASHED' };
const ascii = (s) => String(s).replace(/×/g, 'x').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/Ø/g, '%%c').replace(/[^\x20-\x7e]/g, '?');

export function toDXF(sheet, { includeInfo = true } = {}) {
  const H = sheet.height;
  const Y = (y) => H - y;
  const out = [];
  const g = (code, val) => out.push(String(code), String(val));
  const used = LAYER_ORDER.filter((k) => sheet.items.some((i) => i.layer === k) && (includeInfo || k !== 'info'));

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSBASE');
  g(10, 0);
  g(20, 0);
  g(30, 0);
  g(9, '$EXTMIN');
  g(10, 0);
  g(20, 0);
  g(30, 0);
  g(9, '$EXTMAX');
  g(10, f(sheet.width));
  g(20, f(sheet.height));
  g(30, 0);
  g(9, '$LIMMIN');
  g(10, 0);
  g(20, 0);
  g(9, '$LIMMAX');
  g(10, f(sheet.width));
  g(20, f(sheet.height));
  g(9, '$LTSCALE');
  g(40, 1);
  g(9, '$MEASUREMENT');
  g(70, 1);
  g(9, '$INSUNITS');
  g(70, 4);
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 3);
  const ltypes = [
    ['CONTINUOUS', 'Solid line', []],
    ['DASHED', 'Dashed __ __ __', [3, -2]],
    ['DOT', 'Dotted . . . .', [0.5, -1]],
  ];
  for (const [name, desc, pat] of ltypes) {
    g(0, 'LTYPE');
    g(2, name);
    g(70, 0);
    g(3, desc);
    g(72, 65);
    g(73, pat.length);
    g(40, f(pat.reduce((a, b) => a + Math.abs(b), 0)));
    for (const p of pat) g(49, f(p));
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, used.length);
  for (const k of used) {
    g(0, 'LAYER');
    g(2, DXF_LAYER[k]);
    g(70, 0);
    g(62, LAYERS[k].aci);
    g(6, LTYPE[k] || 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (const it of sheet.items) {
    if (!used.includes(it.layer)) continue;
    const layer = DXF_LAYER[it.layer];
    if (it.kind === 'path') {
      if (it.pts.length === 2 && !it.closed) {
        g(0, 'LINE');
        g(8, layer);
        g(10, f(it.pts[0][0]));
        g(20, f(Y(it.pts[0][1])));
        g(30, 0);
        g(11, f(it.pts[1][0]));
        g(21, f(Y(it.pts[1][1])));
        g(31, 0);
        continue;
      }
      g(0, 'POLYLINE');
      g(8, layer);
      g(66, 1);
      g(10, 0);
      g(20, 0);
      g(30, 0);
      g(70, it.closed ? 1 : 0);
      for (const [x, y] of it.pts) {
        g(0, 'VERTEX');
        g(8, layer);
        g(10, f(x));
        g(20, f(Y(y)));
        g(30, 0);
      }
      g(0, 'SEQEND');
      g(8, layer);
    } else if (it.kind === 'text') {
      const h = it.size * 0.72; // cap height ≈ 0.72 em
      const ha = it.anchor === 'middle' ? 1 : it.anchor === 'end' ? 2 : 0;
      g(0, 'TEXT');
      g(8, layer);
      g(10, f(it.x));
      g(20, f(Y(it.y)));
      g(30, 0);
      g(40, f(h));
      g(1, ascii(it.text));
      if (it.angle) g(50, f(-it.angle));
      if (ha) {
        g(72, ha);
        g(11, f(it.x));
        g(21, f(Y(it.y)));
        g(31, 0);
      }
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}
