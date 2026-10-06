import { gsap, ScrollTrigger } from './scroll.js';
import { splitLines } from './split.js';
import { reducedMotion } from './env.js';

/** Hero opening sequence: image settle → headline lines → body → CTA. */
export function heroIntro() {
  const media = document.querySelector('[data-hero-media]');
  const lines = document.querySelectorAll('[data-hero-line]');
  const fades = document.querySelectorAll('[data-hero-fade]');
  const cta = document.querySelector('[data-hero-cta]');
  const header = document.querySelector('[data-header]');
  if (reducedMotion) {
    document.body.classList.remove('is-loading');
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo(media, { scale: 1.04 }, { scale: 1, duration: 1.8, ease: 'power2.out' }, 0)
    .fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: 1.1, stagger: 0.09 }, 0.2)
    .fromTo(fades, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.06 }, 0.6)
    .fromTo(cta, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9 }, 0.8)
    .fromTo(header, { yPercent: -100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, clearProps: 'transform,opacity' }, 0.35);
  document.body.classList.remove('is-loading');
}

/**
 * Split-heading and fade-up reveals — the two patterns every page shares
 * (`[data-split]` headings, `[data-reveal]` copy). Safe to call on pages
 * that don't have the homepage's other sections, since it only ever
 * touches these two generic markers.
 */
export function genericReveals() {
  // Split headings → masked line reveals
  document.querySelectorAll('[data-split]').forEach((el) => {
    const lines = splitLines(el);
    if (reducedMotion) return;
    gsap.set(lines, { yPercent: 105, y: 0 });
    gsap.to(lines, {
      yPercent: 0,
      y: 0,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
  });

  if (reducedMotion) return;

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });
}

export function scrollMotion() {
  genericReveals();
  if (reducedMotion) return;

  // Hero: background drifts slower than scroll, copy fades as it exits
  const hero = document.querySelector('.hero');
  if (hero) {
    gsap.to('[data-hero-media]', {
      yPercent: 8,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__copy', {
      y: -60,
      opacity: 0.15,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
  }

  // Generic image parallax (about/closer band photos)
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    const amt = parseFloat(el.dataset.parallax) || 0.1;
    gsap.fromTo(
      el,
      { yPercent: -amt * 60 },
      {
        yPercent: amt * 60,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });

  // Service & project cards: gentle staggered rise + image curtain reveal
  gsap.utils.toArray('.scard').forEach((el, i) => {
    gsap.fromTo(
      el,
      { y: 30 },
      { y: -10, ease: 'none', scrollTrigger: { trigger: '.scard-grid', start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
  gsap.utils.toArray('.scard__media, .pcard__media, .about__media').forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(10% 0% 0% 0%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 55%', scrub: true },
      },
    );
  });

  // Closing band: photo settles as the section arrives
  gsap.fromTo('.closer__media img', { scale: 1.12 }, {
    scale: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.closer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });
}

/** Count-up on viewport entry. Swedish number formatting (thin space thousands). */
export function counters() {
  const fmt = (n, el) => {
    if (el.dataset.format === 'space') return Math.round(n).toLocaleString('sv-SE');
    if (el.dataset.format === 'decimal1') return n.toFixed(1).replace('.', ',');
    return String(Math.round(n));
  };
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count);
    if (reducedMotion) {
      el.textContent = fmt(to, el);
      return;
    }
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () =>
        gsap.to(o, {
          v: to,
          duration: 2.2,
          ease: 'expo.out',
          onUpdate: () => (el.textContent = fmt(o.v, el)),
        }),
    });
  });
}
