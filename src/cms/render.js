import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { blocks, contentText, contentVars, esc } from './templates.js';

/**
 * Build-time CMS. Content lives in content/site.json (edited via /admin.html)
 * and is injected into the HTML pages:
 *   {{phone}} {{email}} {{tel}} {{reco}} {{recoCount}} {{google}} {{hero.title}} …  → escaped text
 *   <!--cms:quotes--> <!--cms:reviews--> <!--cms:jobsHome--> <!--cms:jobsAll-->    → generated markup
 * Each page also gets the content version and the token values it was built with, so live.js can
 * bring it up to date in the browser when the admin has saved something newer.
 */
export const CONTENT_FILE = resolve(import.meta.dirname, '../../content/site.json');

export function loadContent() {
  return JSON.parse(readFileSync(CONTENT_FILE, 'utf8'));
}

export function renderHtml(html, c = loadContent()) {
  const vars = contentVars(c);
  const version = createHash('sha256').update(contentText(c)).digest('hex');
  const baked = JSON.stringify(vars).replace(/</g, '\\u003c');
  return html
    .replace(/<!--cms:(\w+)-->/g, (m, key) => (blocks[key] ? blocks[key](c) : m))
    .replace(/\{\{([\w.]+)\}\}/g, (m, key) => (key in vars ? esc(vars[key]) : m))
    .replace(
      '</head>',
      `  <meta name="cms-version" content="${version}" />\n    <script type="application/json" id="cms-vars">${baked}</script>\n  </head>`,
    );
}

const IMAGE_DIR = resolve(import.meta.dirname, '../../public/images');

/**
 * Vite plugin: renders content into every page, reloads the dev server when the content file changes and
 * provides `virtual:repo-images` (the job photos in public/images, selectable in the admin).
 */
export function cms() {
  return {
    name: 'cms',
    transformIndexHtml: { order: 'pre', handler: (html) => renderHtml(html) },
    resolveId: (id) => (id === 'virtual:repo-images' ? '\0virtual:repo-images' : null),
    load(id) {
      if (id !== '\0virtual:repo-images') return null;
      const files = readdirSync(IMAGE_DIR).filter((f) => /^jobb-.*\.(jpe?g|png|webp)$/i.test(f));
      return `export default ${JSON.stringify(files)};`;
    },
    configureServer(server) {
      server.watcher.add(CONTENT_FILE);
      server.watcher.on('change', (f) => f === CONTENT_FILE && server.ws.send({ type: 'full-reload' }));
    },
  };
}
