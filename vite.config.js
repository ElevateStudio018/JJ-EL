import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Pexels CDN — all imagery is royalty-free for commercial use (pexels.com/license).
const PX = (id, w, h) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}${h ? `&h=${h}` : ''}`;

const WIDTHS = [640, 960, 1280, 1920, 2560];

/**
 * Expands <img data-px="ID" data-ar="16/10" ...> into a responsive src/srcset.
 * Keeps image markup in the HTML readable while shipping production-grade attributes.
 */
function pexelsImages() {
  return {
    name: 'pexels-images',
    transformIndexHtml(html) {
      html = html.replace(/<link([^>]*?)\sdata-px-preload="(\d+)"([^>]*?)>/g, (_, pre, id, post) => {
        const set = WIDTHS.map((w) => `${PX(id, w, Math.round(w * 0.625))} ${w}w`).join(', ');
        return `<link${pre} imagesrcset="${set}" imagesizes="100vw"${post}>`;
      });
      return html.replace(/<img([^>]*?)\sdata-px="(\d+)"([^>]*?)>/g, (_, pre, id, post) => {
        const attrs = pre + post;
        const arMatch = attrs.match(/data-ar="(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)"/);
        const ratio = arMatch ? Number(arMatch[2]) / Number(arMatch[1]) : null;
        const set = WIDTHS.map((w) => `${PX(id, w, ratio ? Math.round(w * ratio) : null)} ${w}w`).join(', ');
        const src = PX(id, 1600, ratio ? Math.round(1600 * ratio) : null);
        return `<img${pre} src="${src}" srcset="${set}"${post}>`;
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pexelsImages()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        projekt: resolve(import.meta.dirname, 'projekt.html'),
        allaProjekt: resolve(import.meta.dirname, 'alla-projekt.html'),
        tjanster: resolve(import.meta.dirname, 'tjanster.html'),
        process: resolve(import.meta.dirname, 'process.html'),
        omOss: resolve(import.meta.dirname, 'om-oss.html'),
        kontakt: resolve(import.meta.dirname, 'kontakt.html'),
        integritetspolicy: resolve(import.meta.dirname, 'integritetspolicy.html'),
        cookies: resolve(import.meta.dirname, 'cookies.html'),
      },
    },
  },
});
