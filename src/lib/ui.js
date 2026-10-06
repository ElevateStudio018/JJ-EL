import { gsap } from './scroll.js';
import { stopScroll, startScroll } from './scroll.js';
import { finePointer, reducedMotion } from './env.js';
import { px } from '../data/images.js';

let lastFocus = null;

function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const f = [...container.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ---------- Mobile menu ---------- */
export function initMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!toggle || !menu) return;
  const items = menu.querySelectorAll('li, .btn, .mobile-menu__foot');
  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    menu.hidden = true;
    startScroll();
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    if (!open) return close();
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    menu.hidden = false;
    stopScroll();
    if (!reducedMotion) gsap.fromTo(items, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: 'expo.out' });
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) close();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !menu.hidden && close());
}

/* ---------- Offert drawer ---------- */
export function initDrawer() {
  const drawer = document.querySelector('[data-drawer]');
  if (!drawer) return;
  const panel = drawer.querySelector('.drawer__panel');
  const form = drawer.querySelector('[data-offert-form]');
  const status = drawer.querySelector('[data-form-status]');

  const open = () => {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    stopScroll();
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    setTimeout(() => panel.querySelector('input:not([type=radio])')?.focus(), 350);
  };
  const close = () => {
    drawer.classList.remove('is-open');
    startScroll();
    setTimeout(() => (drawer.hidden = true), 700);
    lastFocus?.focus?.();
  };
  document.querySelectorAll('[data-open-offert]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    }),
  );
  drawer.querySelectorAll('[data-close-drawer]').forEach((b) => b.addEventListener('click', close));
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    trapFocus(panel, e);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll('[required]').forEach((f) => {
      const valid = f.value.trim() && (f.type !== 'email' || /^\S+@\S+\.\S+$/.test(f.value));
      f.setAttribute('aria-invalid', valid ? 'false' : 'true');
      if (!valid) ok = false;
    });
    if (!ok) {
      status.textContent = 'Fyll i namn och en giltig e-postadress.';
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const d = new FormData(form);
    const body = [
      `Typ av projekt: ${d.get('typ')}`,
      `Namn: ${d.get('namn')}`,
      `Företag: ${d.get('foretag') || '—'}`,
      `E-post: ${d.get('epost')}`,
      '',
      d.get('meddelande') || '',
    ].join('\n');
    window.location.href = `mailto:offert@bygguppsala.se?subject=${encodeURIComponent(`Offertförfrågan — ${d.get('typ')}`)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Ditt e-postprogram öppnas med förfrågan ifylld. Vi svarar inom två arbetsdagar.';
  });
}

/* ---------- Film (cinematic sequence of the campaign stills) ---------- */
const FILM = [
  { id: 29174068, text: ['Vi bygger', 'det som räknas.'] },
  { id: 29299826, text: ['Varje projekt börjar', 'med en ritning.'] },
  { id: 1188532, text: ['Och med marken', 'det ska vila på.'] },
  { id: 2323080, text: ['Stomme för stomme.'] },
  { id: 8961159, text: ['Byggt av människor.'] },
  { id: 31122123, text: ['För människor.'] },
  { id: 19660456, text: ['Byggt för', 'att hålla.'] },
];

export function initFilm() {
  const film = document.querySelector('[data-film]');
  if (!film) return;
  const frames = film.querySelector('[data-film-frames]');
  const caption = film.querySelector('[data-film-caption]');
  const bar = film.querySelector('[data-film-bar]');
  const closeBtn = film.querySelector('[data-close-film]');
  const DUR = 5200;
  let idx = 0;
  let timer = 0;
  let barTween = null;

  const show = (i) => {
    idx = i % FILM.length;
    [...frames.children].forEach((im, k) => im.classList.toggle('is-active', k === idx));
    caption.innerHTML = FILM[idx].text.map((t, k) => `<span style="animation-delay:${0.25 + k * 0.1}s">${t}</span>`).join('');
    barTween?.kill();
    barTween = gsap.fromTo(bar, { scaleX: idx / FILM.length }, { scaleX: (idx + 1) / FILM.length, duration: DUR / 1000, ease: 'none' });
    timer = setTimeout(() => show(idx + 1), DUR);
  };

  const open = () => {
    lastFocus = document.activeElement;
    if (!frames.children.length) {
      frames.innerHTML = FILM.map((f) => `<img class="ph" src="${px(f.id, 1920, 1080)}" alt="" />`).join('');
    }
    film.hidden = false;
    stopScroll();
    requestAnimationFrame(() => film.classList.add('is-open'));
    closeBtn.focus();
    show(0);
  };
  const close = () => {
    clearTimeout(timer);
    barTween?.kill();
    film.classList.remove('is-open');
    startScroll();
    setTimeout(() => (film.hidden = true), 700);
    lastFocus?.focus?.();
  };
  document.querySelectorAll('[data-open-film]').forEach((b) => b.addEventListener('click', open));
  closeBtn.addEventListener('click', close);
  film.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      e.preventDefault();
      closeBtn.focus();
    }
  });
}

/* ---------- Contextual cursor (large imagery only) ---------- */
export function initCursor() {
  const el = document.querySelector('[data-cursor-el]');
  if (!el || !finePointer) return;
  const label = el.querySelector('[data-cursor-label]');
  const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
  window.addEventListener('mousemove', (e) => {
    xTo(e.clientX);
    yTo(e.clientY);
  });
  document.querySelectorAll('[data-cursor]').forEach((t) => {
    t.addEventListener('mouseenter', () => {
      label.textContent = t.dataset.cursor;
      el.classList.add('is-visible');
    });
    t.addEventListener('mouseleave', () => el.classList.remove('is-visible'));
  });
}
