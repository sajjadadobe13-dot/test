import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registry, compose as C, svg, pdf, dxf, eps } from './setup.mjs';

const { TEMPLATES, generate } = registry;
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const hasEzdxf = spawnSync('python3', ['-c', 'import ezdxf']).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlf-'));

function sheetFor(t) {
  const res = generate(t, {});
  return C.compose(res, { unit: 'mm', meta: { title: `${t.name} – test “quotes” (x) \\ Ø`, lines: ['Line 1 × 2', 'Line 2'] } });
}

const sample = ['reverse-tuck-end-box', 'mailer-box', 'stand-up-pouch', 'cup-sleeve', 'invitation-envelope', 'presentation-folder', 'door-hanger'];

for (const id of sample) {
  const t = TEMPLATES.find((x) => x.id === id);

  test(`${id}: PDF structure, xref, spot colours, layers`, () => {
    const bytes = pdf.toPDF(sheetFor(t));
    const s = Buffer.from(bytes).toString('latin1');
    assert.ok(s.startsWith('%PDF-1.6'));
    assert.ok(s.trimEnd().endsWith('%%EOF'));
    // xref offsets must point exactly at "n 0 obj"
    const startxref = +s.match(/startxref\n(\d+)/)[1];
    const xref = s.slice(startxref);
    assert.ok(xref.startsWith('xref'));
    const entries = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => +m[1]);
    entries.forEach((off, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, off), `object ${i + 1} offset`));
    assert.match(s, /\/Separation \/CutContour/);
    assert.match(s, /\/Type \/OCG/);
    assert.match(s, /\/OP true \/op true \/OPM 1/);
    assert.match(s, /\/TrimBox \[/);
    if (has('pdfinfo')) {
      const f = path.join(tmp, `${id}.pdf`);
      fs.writeFileSync(f, bytes);
      const r = spawnSync('pdfinfo', [f], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!/error/i.test(r.stderr), r.stderr);
      assert.match(r.stdout, /Pages:\s+1/);
      const txt = execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' });
      assert.ok(txt.includes(t.name), 'title block text extractable');
    }
  });

  test(`${id}: SVG is well-formed with layers in mm`, () => {
    const out = svg.toSVG(sheetFor(t));
    assert.match(out, /<svg[^>]+width="[\d.]+mm"/);
    assert.match(out, /inkscape:groupmode="layer" inkscape:label="Cut"/);
    if (has('xmllint')) {
      const f = path.join(tmp, `${id}.svg`);
      fs.writeFileSync(f, out);
      const r = spawnSync('xmllint', ['--noout', f], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    } else {
      assert.equal((out.match(/<g[\s>]/g) || []).length, (out.match(/<\/g>/g) || []).length);
    }
  });

  test(`${id}: DXF R12 structure and audit`, () => {
    const out = dxf.toDXF(sheetFor(t));
    const lines = out.trimEnd().split('\n');
    assert.equal(lines.length % 2, 0, 'group code / value pairs');
    for (let i = 0; i < lines.length; i += 2) assert.match(lines[i], /^\d+$/, `group code at line ${i + 1}`);
    assert.equal((out.match(/\nPOLYLINE\n/g) || []).length, (out.match(/\nSEQEND\n/g) || []).length);
    assert.match(out, /\nCUT\n/);
    assert.ok(out.endsWith('0\nEOF\n'));
    if (hasEzdxf) {
      const f = path.join(tmp, `${id}.dxf`);
      fs.writeFileSync(f, out);
      const r = spawnSync('python3', ['-I', '-c', 'import sys,ezdxf\nfrom ezdxf import recover\ndoc,a=recover.readfile(sys.argv[1])\nprint(len(a.errors))', f], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), '0', 'ezdxf audit errors');
    }
  });

  test(`${id}: EPS header and balanced graphics state`, () => {
    const out = eps.toEPS(sheetFor(t));
    assert.ok(out.startsWith('%!PS-Adobe-3.0 EPSF-3.0'));
    assert.match(out, /%%BoundingBox: 0 0 \d+ \d+/);
    assert.match(out, /%%CMYKCustomColor: 0 1 0 0 \(CutContour\)/);
    assert.equal((out.match(/\bgsave\b/g) || []).length, (out.match(/\bgrestore\b/g) || []).length);
    assert.ok(!/[^\x09\x0a\x0d\x20-\x7e]/.test(out), 'EPS is 7-bit ASCII');
  });
}

test('every template exports in every format without throwing', () => {
  for (const t of TEMPLATES) {
    const s = sheetFor(t);
    assert.ok(pdf.toPDF(s).length > 1000, t.id);
    assert.ok(svg.toSVG(s).length > 500, t.id);
    assert.ok(dxf.toDXF(s).length > 500, t.id);
    assert.ok(eps.toEPS(s).length > 500, t.id);
  }
});

test('hiding layers removes them from exports', () => {
  const t = TEMPLATES[0];
  const res = generate(t, {});
  const s = C.compose(res, { hidden: ['bleed', 'safe'] });
  assert.ok(!s.items.some((i) => i.layer === 'bleed' || i.layer === 'safe'));
  const out = dxf.toDXF(s);
  assert.ok(!/\nBLEED\n/.test(out) && !/\nSAFE_ZONE\n/.test(out));
  assert.ok(/\nCUT\n/.test(out));
});
