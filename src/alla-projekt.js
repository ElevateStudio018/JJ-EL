import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/services.css';
import './styles/vh.css';

import { initSmoothScroll, gsap, ScrollTrigger } from './lib/scroll.js';
import { genericReveals } from './lib/motion.js';
import { initHeader } from './lib/header.js';
import { initMenu, initDrawer, initCursor } from './lib/ui.js';
import { initProjectTransitions } from './lib/transition.js';
import { splitLines } from './lib/split.js';
import { reducedMotion } from './lib/env.js';
import { PROJECTS } from './data/projects.js';
import { px, pxSet } from './data/images.js';

document.documentElement.classList.add('js');

const grid = document.querySelector('[data-project-grid]');
const empty = document.querySelector('[data-filter-empty]');
const tabs = document.querySelectorAll('[data-filter-tabs] button');

const cardHtml = (p) => `
  <a class="pcard" href="projekt.html?p=${p.slug}" data-project-link data-cursor="Se projekt ↗" data-status="${p.status}">
    <figure class="pcard__media img-zoom" data-shared>
      <img class="ph" src="${px(p.img, 800, 1000)}" srcset="${pxSet(p.img, 5 / 4)}" sizes="(min-width: 900px) 25vw, 50vw" alt="${p.title}, ${p.place}" loading="lazy" decoding="async" />
      <span class="pcard__tag mono">${p.status}</span>
    </figure>
    <div class="pcard__meta">
      <h3>${p.title}</h3>
      <span>${p.category} | ${p.place.split(',').pop().trim()}</span>
    </div>
  </a>`;

grid.innerHTML = PROJECTS.map(cardHtml).join('');

function applyFilter(filter) {
  let shown = 0;
  grid.querySelectorAll('.pcard').forEach((card) => {
    const match = filter === 'Alla' || card.dataset.status === filter;
    card.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  empty.hidden = shown > 0;
}

tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    applyFilter(btn.dataset.filter);
  });
});

initSmoothScroll();
genericReveals();
initHeader();
initMenu();
initDrawer();
initCursor();
initProjectTransitions();

if (reducedMotion) {
  document.body.classList.remove('is-loading');
} else {
  const heroLines = splitLines(document.querySelector('.shero__title'));
  gsap
    .timeline()
    .fromTo('[data-hero-media-s]', { scale: 1.05 }, { scale: 1, duration: 1.8, ease: 'power2.out' }, 0)
    .fromTo(heroLines, { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.2)
    .fromTo('.shero .eyebrow, .breadcrumb', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.55);
  document.body.classList.remove('is-loading');
}

document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());
