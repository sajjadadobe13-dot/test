/** Encapsulated PostScript (Level 2) with named spot colours and overprint. */
import { LAYERS, LAYER_ORDER } from './compose.js';

const MM2PT = 72 / 25.4;
const f = (v) => (Math.round(v * 1000) / 1000).toString();
const ascii = (s) =>
  String(s)
    .replace(/[×]/g, 'x')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/Ø/g, 'O')
    .replace(/[·•]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([()\\])/g, '\\$1');

export function toEPS(sheet) {
  const W = sheet.width * MM2PT;
  const H = sheet.height * MM2PT;
  const X = (x) => f(x * MM2PT);
  const Y = (y) => f(H - y * MM2PT);
  const used = LAYER_ORDER.filter((k) => sheet.items.some((i) => i.layer === k));
  const lw = sheet.lineWidth;
  const o = [];
  o.push('%!PS-Adobe-3.0 EPSF-3.0');
  o.push(`%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`);
  o.push(`%%HiResBoundingBox: 0 0 ${f(W)} ${f(H)}`);
  o.push(`%%Title: (${ascii(sheet.meta.title || 'Dieline')})`);
  o.push(`%%Creator: (${ascii(sheet.meta.generator || 'DielineForge')})`);
  o.push('%%LanguageLevel: 2');
  o.push('%%DocumentNeededResources: font Helvetica Helvetica-Bold');
  o.push(`%%DocumentCustomColors: ${used.map((k) => `(${LAYERS[k].spot})`).join(' ')}`);
  for (const k of used) o.push(`%%CMYKCustomColor: ${LAYERS[k].cmyk.map(f).join(' ')} (${LAYERS[k].spot})`);
  o.push('%%Pages: 1');
  o.push('%%EndComments');
  o.push('%%BeginProlog');
  o.push('/m {moveto} bind def /l {lineto} bind def');
  o.push('%%EndProlog');
  o.push('%%Page: 1 1');
  o.push('gsave 1 setlinecap 1 setlinejoin true setoverprint');
  for (const key of used) {
    const L = LAYERS[key];
    const [c, m, y, k] = L.cmyk;
    o.push(`% ---- layer: ${L.name}`);
    o.push(`[/Separation (${L.spot}) /DeviceCMYK {dup ${f(c)} mul exch dup ${f(m)} mul exch dup ${f(y)} mul exch ${f(k)} mul}] setcolorspace 1 setcolor`);
    const w = key === 'info' ? lw * 0.6 : key === 'bleed' || key === 'safe' || key === 'guide' ? lw * 0.8 : lw;
    o.push(`${f(w)} setlinewidth`);
    for (const it of sheet.items) {
      if (it.layer !== key) continue;
      if (it.kind === 'path') {
        const solid = it.role === 'dim' || it.role === 'block' || !L.dash;
        o.push(solid ? '[] 0 setdash' : `[${L.dash.map((v) => f(v * MM2PT)).join(' ')}] 0 setdash`);
        let s = `newpath ${X(it.pts[0][0])} ${Y(it.pts[0][1])} m`;
        for (let i = 1; i < it.pts.length; i++) s += ` ${X(it.pts[i][0])} ${Y(it.pts[i][1])} l`;
        if (it.closed) {
          s += ' closepath';
          if (L.fill) s += ` gsave ${f(L.fill)} setcolor fill grestore`;
        }
        o.push(s + ' stroke');
      } else if (it.kind === 'text') {
        const font = it.weight === 'bold' ? 'Helvetica-Bold' : 'Helvetica';
        const align = it.anchor === 'middle' ? 'dup stringwidth pop -0.5 mul 0 moveto' : it.anchor === 'end' ? 'dup stringwidth pop neg 0 moveto' : '0 0 moveto';
        const tint = it.role === 'label' ? 0.45 : 1;
        o.push(`gsave ${f(tint)} setcolor /${font} findfont ${f(it.size * MM2PT)} scalefont setfont ${X(it.x)} ${Y(it.y)} translate ${f(-(it.angle || 0))} rotate (${ascii(it.text)}) ${align} show grestore`);
      }
    }
  }
  o.push('grestore');
  o.push('showpage');
  o.push('%%Trailer');
  o.push('%%EOF');
  return o.join('\n') + '\n';
}
