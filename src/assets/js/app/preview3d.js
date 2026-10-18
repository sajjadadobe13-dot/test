/**
 * Lightweight CSS-3D preview (no WebGL): folded cuboid for boxes, faceted
 * cylinder for cans, tubes and bottles. Drag to rotate; idles with a slow spin.
 */
import { fmtLen } from '../core/export/compose.js';

export function mount3D(host) {
  host.innerHTML = '<div class="s3d" aria-hidden="true"><div class="s3d-obj"></div></div><p class="s3d-cap"></p><p class="s3d-hint">Drag to rotate</p>';
  const scene = host.querySelector('.s3d');
  const obj = host.querySelector('.s3d-obj');
  const cap = host.querySelector('.s3d-cap');
  const rot = { x: -22, y: -35 };
  let spin = true;
  let raf = 0;
  const apply = () => (obj.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`);
  const tick = () => {
    if (spin && host.isConnected && !host.hidden) {
      rot.y += 0.25;
      apply();
    }
    raf = requestAnimationFrame(tick);
  };
  let drag = null;
  scene.addEventListener('pointerdown', (e) => {
    spin = false;
    drag = { x: e.clientX, y: e.clientY };
    scene.setPointerCapture(e.pointerId);
  });
  scene.addEventListener('pointermove', (e) => {
    if (!drag) return;
    rot.y += (e.clientX - drag.x) * 0.5;
    rot.x = Math.max(-89, Math.min(89, rot.x - (e.clientY - drag.y) * 0.5));
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });
  const end = () => (drag = null);
  scene.addEventListener('pointerup', end);
  scene.addEventListener('pointercancel', end);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(tick);
  apply();

  function face(cls, w, h, transform, label) {
    const f = document.createElement('div');
    f.className = `s3d-face ${cls}`;
    f.style.width = `${w}px`;
    f.style.height = `${h}px`;
    f.style.marginLeft = `${-w / 2}px`;
    f.style.marginTop = `${-h / 2}px`;
    f.style.transform = transform;
    if (label) f.innerHTML = `<span>${label}</span>`;
    obj.append(f);
  }

  function update(spec, unit = 'mm') {
    obj.textContent = '';
    if (!spec) return;
    const size = Math.min(host.clientWidth || 360, (host.clientHeight || 360) - 70, 560) * 0.62;
    if (spec.kind === 'box') {
      const { L, W, D } = spec;
      const s = size / Math.max(L, W, D);
      const l = L * s;
      const w = W * s;
      const d = D * s;
      face('f-front', l, d, `translateZ(${w / 2}px)`, 'FRONT');
      face('f-back', l, d, `rotateY(180deg) translateZ(${w / 2}px)`, 'BACK');
      face('f-side', w, d, `rotateY(90deg) translateZ(${l / 2}px)`, 'SIDE');
      face('f-side', w, d, `rotateY(-90deg) translateZ(${l / 2}px)`, 'SIDE');
      if (!spec.open) face('f-top', l, w, `rotateX(90deg) translateZ(${d / 2}px)`, 'TOP');
      face('f-bottom', l, w, `rotateX(-90deg) translateZ(${d / 2}px)`, '');
      cap.textContent = `${fmtLen(L, unit)} × ${fmtLen(W, unit)} × ${fmtLen(D, unit)}`;
    } else if (spec.kind === 'cyl') {
      const { dia, H } = spec;
      const s = size / Math.max(dia, H);
      const r = (dia * s) / 2;
      const h = H * s;
      const n = 28;
      const fw = 2 * r * Math.tan(Math.PI / n) + 0.6;
      for (let i = 0; i < n; i++) {
        const shade = 0.55 + 0.45 * Math.abs(Math.cos(((i / n) * 2 - 0.25) * Math.PI));
        face('f-strip', fw, h, `rotateY(${(i * 360) / n}deg) translateZ(${r}px)`);
        obj.lastChild.style.filter = `brightness(${shade.toFixed(3)})`;
      }
      face('f-cap', 2 * r, 2 * r, `rotateX(90deg) translateZ(${h / 2}px)`);
      face('f-cap', 2 * r, 2 * r, `rotateX(-90deg) translateZ(${h / 2}px)`);
      cap.textContent = `Ø ${fmtLen(dia, unit)} × ${fmtLen(H, unit)}`;
    }
  }
  return { update, destroy: () => cancelAnimationFrame(raf) };
}
