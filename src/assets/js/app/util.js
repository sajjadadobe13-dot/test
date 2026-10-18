export const UNIT_F = { mm: 1, cm: 10, in: 25.4 };
export const UNIT_DP = { mm: 1, cm: 2, in: 3 };

export function toUnit(mm, unit) {
  if (mm === null || mm === undefined || mm === '') return '';
  const v = mm / UNIT_F[unit];
  return String(Number(v.toFixed(UNIT_DP[unit])));
}

export function fromUnit(str, unit) {
  if (str === '' || str === null || str === undefined) return null;
  const v = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(v) ? v * UNIT_F[unit] : NaN;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Analytics hook: pushes to a dataLayer if the site owner adds one. */
export function track(event, params = {}) {
  try {
    (window.dataLayer = window.dataLayer || []).push({ event, ...params });
    if (typeof window.plausible === 'function') window.plausible(event, { props: params });
  } catch {
    /* analytics must never break the app */
  }
}

export const storage = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

/** Standard sheet sizes (mm) used to suggest a printable sheet. */
export const SHEETS = [
  ['A4', 210, 297],
  ['US Letter', 215.9, 279.4],
  ['US Legal', 215.9, 355.6],
  ['A3', 297, 420],
  ['Tabloid 11×17', 279.4, 431.8],
  ['SRA3', 320, 450],
  ['12×18 in', 304.8, 457.2],
  ['13×19 in', 330.2, 482.6],
  ['A2', 420, 594],
  ['B2', 500, 707],
  ['A1', 594, 841],
  ['B1', 707, 1000],
  ['A0', 841, 1189],
];

export function fitSheet(w, h, margin = 5) {
  const W = w + 2 * margin;
  const H = h + 2 * margin;
  for (const [name, a, b] of SHEETS) if ((W <= a && H <= b) || (W <= b && H <= a)) return name;
  return 'Custom / large format';
}
