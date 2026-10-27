import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build-time CMS. Content lives in content/site.json (edited via /admin.html)
 * and is injected into the HTML pages:
 *   {{phone}} {{email}} {{tel}} {{reco}} {{recoCount}} {{google}} {{hero.title}} …  → escaped text
 *   <!--cms:quotes--> <!--cms:reviews--> <!--cms:jobsHome--> <!--cms:jobsAll-->    → generated markup
 */
export const CONTENT_FILE = resolve(import.meta.dirname, '../../content/site.json');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** "070-910 75 07" → "+46709107507" */
export const telLink = (phone) => String(phone).replace(/[^\d+]/g, '').replace(/^0/, '+46');

const job = (j) =>
  `<figure class="job" data-reveal><img src="${esc(j.image)}" alt="${esc(j.alt || j.caption)}" loading="lazy" decoding="async" /><figcaption>${esc(j.caption)}</figcaption></figure>`;

const blocks = {
  quotes: (c) =>
    c.reviews
      .filter((r) => r.featured)
      .map(
        (r) =>
          `<figure class="quote"><blockquote>${esc(r.quote || r.text)}</blockquote><figcaption><span><b>${esc(r.name)}</b><span>${esc(r.source)} · ${esc(r.date)}</span></span></figcaption></figure>`,
      )
      .join(''),
  reviews: (c) =>
    c.reviews
      .map(
        (r) =>
          `<figure class="review" data-reveal><blockquote>”${esc(r.text)}”</blockquote><footer><b>${esc(r.name)}</b> · ${esc(r.date)} · ${esc(r.source)}</footer></figure>`,
      )
      .join(''),
  jobsHome: (c) => c.jobsHome.map(job).join(''),
  jobsAll: (c) => c.jobsAll.map(job).join(''),
};

export function loadContent() {
  return JSON.parse(readFileSync(CONTENT_FILE, 'utf8'));
}

export function renderHtml(html, c = loadContent()) {
  const vars = {
    phone: c.company.phone,
    email: c.company.email,
    tel: telLink(c.company.phone),
    reco: c.rating.reco,
    recoCount: c.rating.recoCount,
    google: c.rating.google,
    'hero.title': c.hero.title,
    'hero.lead': c.hero.lead,
  };
  return html
    .replace(/<!--cms:(\w+)-->/g, (m, key) => (blocks[key] ? blocks[key](c) : m))
    .replace(/\{\{([\w.]+)\}\}/g, (m, key) => (key in vars ? esc(vars[key]) : m));
}

/** Vite plugin: renders content into every page and reloads the dev server when the content file changes. */
export function cms() {
  return {
    name: 'cms',
    transformIndexHtml: { order: 'pre', handler: (html) => renderHtml(html) },
    configureServer(server) {
      server.watcher.add(CONTENT_FILE);
      server.watcher.on('change', (f) => f === CONTENT_FILE && server.ws.send({ type: 'full-reload' }));
    },
  };
}
