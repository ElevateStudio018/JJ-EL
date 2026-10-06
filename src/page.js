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
import { splitLines } from './lib/split.js';
import { reducedMotion } from './lib/env.js';

document.documentElement.classList.add('js');

initSmoothScroll();
genericReveals();
initHeader();
initMenu();
initDrawer();
initCursor();

const heroTitle = document.querySelector('.shero__title');
if (reducedMotion || !heroTitle) {
  document.body.classList.remove('is-loading');
} else {
  const heroLines = splitLines(heroTitle);
  gsap
    .timeline()
    .fromTo('[data-hero-media-s]', { scale: 1.05 }, { scale: 1, duration: 1.8, ease: 'power2.out' }, 0)
    .fromTo(heroLines, { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.2)
    .fromTo('.shero .eyebrow, .shero__lead, .breadcrumb', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.55);
  document.body.classList.remove('is-loading');

  if (document.querySelector('.cta')) {
    gsap.fromTo('[data-cta-media]', { scale: 1.14 }, {
      scale: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  }
}

document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());
