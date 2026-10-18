/**
 * Minimal, dependency-free PDF 1.6 writer for dielines.
 *
 * - Each die element is a /Separation spot colour (CutContour, Crease, …)
 *   with a CMYK alternate, stroked with overprint on (/OP /op /OPM 1).
 * - Each element lives on its own Optional Content Group, so Acrobat and
 *   Illustrator show real layers.
 * - TrimBox = knife outline bounding box; MediaBox = full sheet.
 * The same bytes are used for the PDF-compatible .ai download.
 */
import { LAYERS, LAYER_ORDER, PT } from './compose.js';

const MM2PT = 72 / 25.4;
const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : r.toString();
};

// Helvetica glyph widths (1/1000 em) for ASCII 32–126.
const HW = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
export function helveticaWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HW[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.05 : 1);
}

const WIN = { '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, '€': 0x80 };
/** Encode to WinAnsi bytes as a PDF literal string. */
function pdfString(s) {
  let out = '(';
  for (const ch of s) {
    let c = WIN[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 63; // '?'
    if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCharCode(c);
  }
  return out + ')';
}

/** Text string for metadata / layer names: UTF-16BE with BOM. */
function pdfText(s) {
  let hex = 'FEFF';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += cp.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

function pdfDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function toPDF(sheet, { date = new Date() } = {}) {
  const W = sheet.width * MM2PT;
  const H = sheet.height * MM2PT;
  const X = (x) => f(x * MM2PT);
  const Y = (y) => f(H - y * MM2PT);
  const lw = sheet.lineWidth;
  const used = LAYER_ORDER.filter((k) => sheet.items.some((i) => i.layer === k));

  // ------------------------------------------------------------ content
  const c = [];
  c.push('/GS0 gs 1 J 1 j');
  used.forEach((key, li) => {
    const L = LAYERS[key];
    const items = sheet.items.filter((i) => i.layer === key);
    c.push(`/OC /OC${li} BDC`);
    c.push(`/CS${li} CS 1 SCN /CS${li} cs 1 scn`);
    const w = key === 'info' ? lw * 0.6 : key === 'bleed' || key === 'safe' || key === 'guide' ? lw * 0.8 : lw;
    c.push(`${f(w)} w`);
    const setDash = (on) => c.push(on && L.dash ? `[${L.dash.map((v) => f(v * MM2PT)).join(' ')}] 0 d` : '[] 0 d');
    for (const it of items) {
      if (it.kind !== 'path') continue;
      const solid = it.role === 'dim' || it.role === 'block';
      setDash(!solid);
      let s = `${X(it.pts[0][0])} ${Y(it.pts[0][1])} m`;
      for (let i = 1; i < it.pts.length; i++) s += `\n${X(it.pts[i][0])} ${Y(it.pts[i][1])} l`;
      if (it.closed) {
        s += '\nh';
        if (L.fill) c.push(`${s}\nq /CS${li} cs ${f(L.fill)} scn f Q`);
        c.push(`${s}\nS`);
      } else c.push(`${s}\nS`);
    }
    const texts = items.filter((i) => i.kind === 'text');
    if (texts.length) {
      for (const t of texts) {
        const size = t.size * MM2PT;
        const bold = t.weight === 'bold';
        const tw = helveticaWidth(t.text, size, bold);
        const shift = t.anchor === 'middle' ? -tw / 2 : t.anchor === 'end' ? -tw : 0;
        const a = (-(t.angle || 0) * Math.PI) / 180; // PDF y is up
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const x = t.x * MM2PT + cos * shift;
        const y = H - t.y * MM2PT + sin * shift;
        const tint = t.role === 'label' ? 0.45 : 1;
        c.push(`BT /CS${li} cs ${f(tint)} scn /${bold ? 'F2' : 'F1'} ${f(size)} Tf ${f(cos)} ${f(sin)} ${f(-sin)} ${f(cos)} ${f(x)} ${f(y)} Tm ${pdfString(t.text)} Tj ET`);
      }
    }
    c.push('EMC');
  });
  const content = c.join('\n');

  // ------------------------------------------------------------ objects
  const objs = [];
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };
  const catalogId = add(null);
  const pagesId = add(null);
  const pageId = add(null);
  const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const gs = add('<< /Type /ExtGState /OP true /op true /OPM 1 >>');
  const csRefs = [];
  const ocRefs = [];
  used.forEach((key) => {
    const L = LAYERS[key];
    const fn = add(`<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${L.cmyk.map(f).join(' ')}] /N 1 >>`);
    csRefs.push(add(`[/Separation /${L.spot.replace(/ /g, '#20')} /DeviceCMYK ${fn} 0 R]`));
    ocRefs.push(add(`<< /Type /OCG /Name ${pdfText(L.name)} /Usage << /Print << /PrintState /ON >> /View << /ViewState /ON >> >> >>`));
  });
  const meta = sheet.meta || {};
  const infoId = add(
    `<< /Title ${pdfText(meta.title || 'Dieline')} /Subject ${pdfText(meta.subject || 'Packaging dieline')} /Creator ${pdfText(meta.generator || 'DielineForge')} /Producer ${pdfText(
      (meta.generator || 'DielineForge') + ' PDF writer',
    )} /CreationDate (${pdfDate(date)}) /ModDate (${pdfDate(date)}) /Trapped /False >>`,
  );
  const ocList = ocRefs.map((r) => `${r} 0 R`).join(' ');
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /OCProperties << /OCGs [${ocList}] /D << /Name (Layers) /Order [${ocList}] /ON [${ocList}] /BaseState /ON >> >> /ViewerPreferences << /DisplayDocTitle true >> >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;
  const t = sheet.trim;
  const trim = t ? `[${f(t.x * MM2PT)} ${f(H - (t.y + t.h) * MM2PT)} ${f((t.x + t.w) * MM2PT)} ${f(H - t.y * MM2PT)}]` : `[0 0 ${f(W)} ${f(H)}]`;
  const csDict = csRefs.map((r, i) => `/CS${i} ${r} 0 R`).join(' ');
  const ocDict = ocRefs.map((r, i) => `/OC${i} ${r} 0 R`).join(' ');
  objs[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /CropBox [0 0 ${f(W)} ${f(H)}] /TrimBox ${trim} /Contents ${contentId} 0 R /Resources << /ProcSet [/PDF /Text] /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ExtGState << /GS0 ${gs} 0 R >> /ColorSpace << ${csDict} >> /Properties << ${ocDict} >> >> >>`;

  // ------------------------------------------------------------ serialise
  let out = '%PDF-1.6\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  const id = simpleHash(content + pdfDate(date));
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

function simpleHash(s) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2).toUpperCase();
}

export { PT };
