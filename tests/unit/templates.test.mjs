import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, geometry as G, compose as C, rng } from './setup.mjs';

const { TEMPLATES, CATEGORIES, MATERIALS, generate, defaults } = registry;

function check(t, res, label) {
  const closed = res.layers.cut.filter((c) => c.closed);
  assert.ok(closed.length >= 1, `${label}: has a knife outline`);
  for (const key of Object.keys(res.layers))
    for (const l of res.layers[key])
      for (const [x, y] of l.pts) assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label}: finite ${key} coords`);
  for (const c of closed) assert.ok(Math.abs(G.polyArea(c.pts)) > 0.5, `${label}: no sliver polygons in cut layer`);
  // every crease must sit within the knife outline's bounds
  const cb = res.cutBounds;
  for (const cr of res.layers.crease)
    for (const [x, y] of cr.pts) assert.ok(x >= cb.minX - 0.01 && x <= cb.maxX + 0.01 && y >= cb.minY - 0.01 && y <= cb.maxY + 0.01, `${label}: crease inside outline bounds`);
  assert.ok(res.bounds.width >= cb.width && res.bounds.height >= cb.height, `${label}: sheet contains outline`);
  const st = C.stats(res);
  assert.ok(st.cutLen > 0, `${label}: knife length`);
}

test('registry: unique ids, every category populated, valid metadata', () => {
  const ids = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.match(t.id, /^[a-z0-9-]+$/);
    assert.ok(CATEGORIES.some((c) => c.id === t.category), `${t.id} category`);
    assert.ok(MATERIALS[t.material], `${t.id} material`);
    assert.ok(t.name && t.short && t.description && t.standard && t.keywords?.length, `${t.id} copy`);
    for (const p of t.params) {
      assert.ok(['length', 'number', 'bool', 'select'].includes(p.type), `${t.id}.${p.key} type`);
      if (p.type === 'select') assert.ok(p.options.some((o) => o.value === p.default), `${t.id}.${p.key} default option`);
      if (p.type === 'length' && !p.auto) assert.ok(p.default >= p.min && p.default <= p.max, `${t.id}.${p.key} default in range`);
    }
  }
  for (const c of CATEGORIES) assert.ok(TEMPLATES.some((t) => t.category === c.id), `${c.id} has templates`);
  assert.ok(TEMPLATES.length >= 30);
});

for (const t of TEMPLATES) {
  test(`${t.id}: defaults, presets and options generate valid dielines`, () => {
    check(t, generate(t, {}), 'default');
    for (const pr of t.presets || []) check(t, generate(t, pr.values), `preset ${pr.name}`);
    for (const p of t.params) {
      if (p.type === 'bool') check(t, generate(t, { [p.key]: !p.default }), `${p.key} toggled`);
      if (p.type === 'select') for (const o of p.options) check(t, generate(t, { [p.key]: o.value }), `${p.key}=${o.value}`);
    }
    const mat = MATERIALS[t.material];
    for (const o of mat.options) check(t, generate(t, {}, { t: o.value }), `caliper ${o.value}`);
    if (t.dimMode) check(t, generate(t, {}, { dimMode: 'outer' }), 'outside dims');
    check(t, generate(t, {}, { bleed: 0, safe: 0 }), 'no bleed/safe');
  });

  test(`${t.id}: randomised dimensions (fuzz)`, () => {
    const r = rng(t.id.length * 7919);
    for (let i = 0; i < 25; i++) {
      const v = defaults(t);
      for (const p of t.params) {
        if (p.type === 'length') {
          if (p.auto && r() < 0.5) continue;
          const lo = p.min ?? 1;
          const hi = Math.min(p.max ?? lo * 10, Math.max(lo * 2, (p.default ?? lo) * 3));
          v[p.key] = lo + (hi - lo) * r();
        } else if (p.type === 'number') v[p.key] = (p.min ?? 0) + ((p.max ?? 100) - (p.min ?? 0)) * r();
        else if (p.type === 'bool') v[p.key] = r() < 0.5;
        else if (p.type === 'select') v[p.key] = p.options[Math.floor(r() * p.options.length)].value;
      }
      let res;
      try {
        res = generate(t, v, { t: MATERIALS[t.material].options[Math.floor(r() * MATERIALS[t.material].options.length)].value });
      } catch (e) {
        // the only allowed failure is a clear, user-facing validation message
        assert.match(e.message, /too steep|valid dieline/, `${t.id} unexpected error for ${JSON.stringify(v)}: ${e.stack}`);
        continue;
      }
      check(t, res, `fuzz ${JSON.stringify(v)}`);
    }
  });
}

const byId = (id) => TEMPLATES.find((t) => t.id === id);
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('reverse tuck end: flat width = 2L + 2W + glue flap (inside dims + caliper)', () => {
  const res = generate(byId('reverse-tuck-end-box'), { L: 70, W: 40, D: 120, glue: 15 }, { t: 0.4 });
  near(res.cutBounds.width, 2 * 70.4 + 2 * 40.4 + 15);
  // body + 2 × (closure W + tuck)
  const T = Math.min(Math.max(40.4 * 0.55, 8), 40);
  near(res.cutBounds.height, 120.4 + 2 * (40.4 + T));
});

test('outside dimensions shrink panels by the caliper', () => {
  const inner = generate(byId('straight-tuck-end-box'), { L: 70, W: 40, D: 120, glue: 15 }, { t: 0.5 });
  const outer = generate(byId('straight-tuck-end-box'), { L: 70, W: 40, D: 120, glue: 15 }, { t: 0.5, dimMode: 'outer' });
  near(inner.cutBounds.width - outer.cutBounds.width, 4 * 1.0);
});

test('RSC: flaps are half the width so they meet in the middle', () => {
  const t = 3;
  const res = generate(byId('shipping-box-rsc'), { L: 300, W: 200, D: 200 }, { t });
  const Wp = 203;
  near(res.cutBounds.height, 200 + 2 * t + 2 * ((Wp + t) / 2));
  near(res.cutBounds.width, 2 * 303 + 2 * 203 + 30);
});

test('wrap label width = π × diameter + overlap', () => {
  const res = generate(byId('beverage-can-label'), { dia: 66.2, H: 114, overlap: 6 });
  near(res.cutBounds.width, Math.PI * 66.2 + 6, 0.01);
  near(res.cutBounds.height, 114, 0.01);
});

test('cup sleeve: top and bottom arcs unroll to the cup circumferences', () => {
  const Dt = 88;
  const Db = 70;
  const h = 60;
  const res = generate(byId('cup-sleeve'), { Dt, Db, h, overlap: 0 }, { bleed: 0, safe: 0 });
  const poly = res.layers.cut[0].pts;
  // perimeter = top arc + bottom arc + 2 × slant height
  let per = 0;
  for (let i = 0; i < poly.length; i++) per += G.dist(poly[i], poly[(i + 1) % poly.length]);
  const s = Math.hypot(h, (Dt - Db) / 2);
  near(per, Math.PI * Dt + Math.PI * Db + 2 * s, 0.5);
});

test('envelope: front panel equals the finished size', () => {
  const t = byId('invitation-envelope');
  const d = t.build({ ...defaults(t), W: 184.2, H: 133.4, t: 0 });
  const front = d.panels.find((p) => p.label === 'FRONT');
  const b = G.boundsOf([front.poly]);
  near(b.width, 184.2);
  near(b.height, 133.4);
});

test('steep conical labels fail with a clear message', () => {
  assert.throws(() => generate(byId('tapered-tub-label'), { Dt: 200, Db: 20, h: 10 }), /too steep/);
});
