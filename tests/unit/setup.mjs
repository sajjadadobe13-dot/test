import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.ClipperLib = require('clipper-lib');

export const registry = await import('../../src/assets/js/core/registry.js');
export const geometry = await import('../../src/assets/js/core/geometry.js');
export const compose = await import('../../src/assets/js/core/export/compose.js');
export const svg = await import('../../src/assets/js/core/export/svg.js');
export const pdf = await import('../../src/assets/js/core/export/pdf.js');
export const dxf = await import('../../src/assets/js/core/export/dxf.js');
export const eps = await import('../../src/assets/js/core/export/eps.js');

/** Deterministic PRNG so failures are reproducible. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
