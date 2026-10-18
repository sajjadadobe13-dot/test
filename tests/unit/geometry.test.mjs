import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometry as G } from './setup.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('rect area and orientation', () => {
  close(Math.abs(G.polyArea(G.rect(0, 0, 10, 20))), 200);
});

test('union welds pieces that share an edge, including T-junctions', () => {
  const body = G.rect(0, 0, 100, 50);
  const flap = G.rect(30, -20, 20, 20); // base sits in the middle of the body top edge
  const d = new G.Dieline();
  d.piece(body).piece(flap);
  const res = G.resolve(d, { bleed: 0, safe: 0 });
  const closed = res.layers.cut.filter((c) => c.closed);
  assert.equal(closed.length, 1);
  close(Math.abs(G.polyArea(closed[0].pts)), 5000 + 400, 0.05);
});

test('bleed offsets the knife outline outward', () => {
  const d = new G.Dieline().piece(G.rect(0, 0, 100, 50));
  const res = G.resolve(d, { bleed: 3, safe: 0 });
  const b = G.boundsOf(res.layers.bleed.map((l) => l.pts));
  close(b.minX, -3, 1e-3);
  close(b.maxY, 53, 1e-3);
});

test('safe zone insets each panel', () => {
  const d = new G.Dieline().piece(G.rect(0, 0, 100, 50)).panel(G.rect(0, 0, 100, 50), 'A');
  const res = G.resolve(d, { bleed: 0, safe: 5 });
  const b = G.boundsOf(res.layers.safe.map((l) => l.pts));
  close(b.minX, 5, 1e-3);
  close(b.width, 90, 1e-3);
});

test('notches are subtracted from the outline', () => {
  const d = new G.Dieline().piece(G.rect(0, 0, 100, 50)).notch(G.circle(50, 0, 10));
  const res = G.resolve(d, { bleed: 0, safe: 0 });
  const area = Math.abs(G.polyArea(res.layers.cut[0].pts));
  close(area, 5000 - (Math.PI * 100) / 2, 1);
});

test('bulgeArc passes through both ends with the requested sagitta', () => {
  const pts = G.bulgeArc([0, 0], [100, 0], 10);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[pts.length - 1], [100, 0]);
  const minY = Math.min(...pts.map((p) => p[1]));
  close(minY, -10, 0.05); // positive sagitta bulges to the left of travel (up)
});

test('fillet keeps arcs tangent and within the corner', () => {
  const pts = G.fillet(G.rect(0, 0, 50, 50), 10);
  const b = G.boundsOf([pts]);
  close(b.width, 50, 1e-6);
  close(b.height, 50, 1e-6);
  const area = Math.abs(G.polyArea(pts));
  close(area, 2500 - (4 - Math.PI) * 100, 1);
});

test('onEdge maps flap profiles outward for clockwise edges', () => {
  const top = G.onEdge([0, 0], [10, 0], [[0, 0], [0, 5], [10, 5], [10, 0]]);
  assert.ok(top.every(([, y]) => y <= 0));
  const right = G.onEdge([10, 0], [10, 10], [[0, 0], [0, 5], [10, 5], [10, 0]]);
  assert.ok(right.every(([x]) => x >= 10));
});
