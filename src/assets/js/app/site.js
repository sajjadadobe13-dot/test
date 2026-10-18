// Site-wide behaviour: mobile navigation and template search / filtering.

const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
      toggle.focus();
    }
  });
}

const gallery = document.querySelector('[data-gallery]');
if (gallery) {
  const input = document.getElementById('tpl-search');
  const chips = [...document.querySelectorAll('[data-filter]')];
  const cards = [...gallery.querySelectorAll('[data-cat]')];
  const empty = document.getElementById('tpl-empty');
  const count = document.getElementById('tpl-count');
  let cat = new URLSearchParams(location.search).get('cat') || 'all';
  const apply = () => {
    const q = (input?.value || '').trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    let n = 0;
    for (const c of cards) {
      const hay = c.dataset.search;
      const ok = (cat === 'all' || c.dataset.cat === cat) && words.every((w) => hay.includes(w));
      c.hidden = !ok;
      if (ok) n++;
    }
    chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.filter === cat)));
    if (empty) empty.hidden = n > 0;
    if (count) count.textContent = `${n} template${n === 1 ? '' : 's'}`;
  };
  chips.forEach((ch) =>
    ch.addEventListener('click', () => {
      cat = ch.dataset.filter;
      const u = new URL(location.href);
      cat === 'all' ? u.searchParams.delete('cat') : u.searchParams.set('cat', cat);
      history.replaceState(null, '', u);
      apply();
    }),
  );
  input?.addEventListener('input', apply);
  const q = new URLSearchParams(location.search).get('q');
  if (q && input) input.value = q;
  apply();
}
