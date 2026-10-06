import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/project.css';

import { initSmoothScroll, gsap, ScrollTrigger } from './lib/scroll.js';
import { initHeader } from './lib/header.js';
import { initCursor } from './lib/ui.js';
import { initProjectTransitions } from './lib/transition.js';
import { splitLines } from './lib/split.js';
import { reducedMotion } from './lib/env.js';
import { PROJECTS, getProject } from './data/projects.js';
import { px, pxSet } from './data/images.js';

document.documentElement.classList.add('js');

const slug = new URLSearchParams(location.search).get('p');
const p = getProject(slug) || PROJECTS[0];
const idx = PROJECTS.indexOf(p);
const next = PROJECTS[(idx + 1) % PROJECTS.length];
const $ = (s) => document.querySelector(s);

document.title = `${p.title} — Bygg Uppsala`;
$('meta[name="description"]').setAttribute('content', p.lead);
// Static OG tags in <head> cover link-preview crawlers (most don't run JS);
// this keeps the tab title/description and any JS-aware unfurl in sync too.
$('meta[property="og:title"]')?.setAttribute('content', `${p.title} — Bygg Uppsala`);
$('meta[property="og:description"]')?.setAttribute('content', p.lead);
$('meta[property="og:image"]')?.setAttribute('content', px(p.img, 1200, 630));

// Hero — reuse the exact image the card expanded, so the hand-over is seamless.
let handoff = null;
try {
  handoff = JSON.parse(sessionStorage.getItem('lir:ptrans') || 'null');
  sessionStorage.removeItem('lir:ptrans');
} catch {}
const fresh = handoff && Date.now() - handoff.t < 8000;
const hero = $('[data-p-hero]');
hero.alt = `${p.title}, ${p.place}`;
hero.src = fresh ? handoff.src : px(p.img, 1920, 1200);
hero.sizes = '100vw';
const upgrade = () => (hero.srcset = pxSet(p.img, 10 / 16));
hero.complete ? upgrade() : hero.addEventListener('load', upgrade, { once: true });

$('[data-p-kicker]').textContent = `${p.no} — ${p.category} · ${p.year}`;
$('[data-p-title]').innerHTML = p.title.replace(/ (?=\S+$)/, '<br />').replace(/^(\S+ \S+) /, '$1<br />');
$('[data-p-place]').textContent = p.place;
$('[data-p-lead]').textContent = p.lead;
$('[data-p-body]').innerHTML = p.body.map((t) => `<p>${t}</p>`).join('');
$('[data-p-facts]').innerHTML = [
  ['Beställare', p.client],
  ['Plats', p.place],
  ['Omfattning', p.scope],
  ['Entreprenadform', p.form],
  ['Tidsperiod', p.year],
  ['Certifiering', p.certification],
]
  .map(([k, v]) => `<div><dt class="mono">${k}</dt><dd>${v}</dd></div>`)
  .join('');
$('[data-p-metrics]').innerHTML = p.metrics.map(([v, l]) => `<div><dt class="mono">${l}</dt><dd>${v}</dd></div>`).join('');
$('[data-p-gallery]').innerHTML = p.gallery
  .map(
    (id, i) =>
      `<figure class="pgallery__item pgallery__item--${i}"><div class="pgallery__img" data-parallax-img><img class="ph" src="${px(id, 1600, i === 0 ? 900 : 1200)}" srcset="${pxSet(id, i === 0 ? 9 / 16 : 3 / 4)}" sizes="(min-width: 900px) ${i === 0 ? '90vw' : '45vw'}, 100vw" alt="" loading="lazy" decoding="async" /></div></figure>`,
  )
  .join('');

const nextLink = $('[data-p-next]');
nextLink.href = `projekt.html?p=${next.slug}`;
nextLink.setAttribute('data-project-link', '');
$('[data-p-next-title]').innerHTML = next.title.replace(/ (?=\S+$)/, '<br />');
const nImg = $('[data-p-next-img]');
nImg.src = px(next.img, 1920, 1080);
nImg.srcset = pxSet(next.img, 9 / 16);
nImg.sizes = '100vw';
nImg.alt = `${next.title}, ${next.place}`;

// ---------- Motion ----------
initSmoothScroll();
initHeader();
initCursor();
initProjectTransitions();
window.scrollTo(0, 0);

const lines = splitLines($('[data-p-title]'));
const layer = $('[data-ptrans]');
if (!reducedMotion) {
  if (fresh) {
    layer.innerHTML = `<img class="ph" src="${handoff.src}" alt="" />`;
    Object.assign(layer.style, { display: 'block', inset: '0', top: '0', left: '0', width: '100vw', height: '100vh' });
  }
  const tl = gsap.timeline({ delay: fresh ? 0.1 : 0 });
  if (!fresh) tl.fromTo('[data-phero-media]', { scale: 1.06 }, { scale: 1, duration: 1.8, ease: 'power2.out' }, 0);
  if (fresh) tl.to(layer, { opacity: 0, duration: 0.6, ease: 'power1.out', onComplete: () => (layer.style.display = 'none') }, 0.15);
  tl.fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.25)
    .fromTo('.phero__kicker, .phero__place', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.5);

  gsap.to('[data-phero-media]', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.utils.toArray('.pinfo__facts > div, .pinfo__lead, .pinfo__text p, .pinfo__metrics > div').forEach((el) =>
    gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } }),
  );
  gsap.utils.toArray('.pgallery__item').forEach((el) => {
    gsap.fromTo(el, { clipPath: 'inset(14% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 40%', scrub: true } });
    gsap.fromTo(el.querySelector('[data-parallax-img]'), { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  gsap.fromTo('.pnext__media', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.pnext', start: 'top bottom', end: 'bottom bottom', scrub: true } });
}
window.addEventListener('load', () => ScrollTrigger.refresh());
