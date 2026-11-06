import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

// AVIF encoding is memory hungry: encode a couple of files at a time.
sharp.cache(false);
sharp.concurrency(2);
let running = 0;
const waiting = [];
async function limited(fn) {
  if (running >= 2) await new Promise((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/**
 * Build-time image optimisation. Every <img> in the built pages that points at a photo in public/
 * or on Pexels/Supabase is converted to AVIF in several widths and served from our own domain
 * (images/opt/…), with src/srcset/sizes/width/height filled in. This keeps the page fast on phones,
 * avoids layout shifts and removes third-party requests (and their cookies) from the pages.
 */

// Candidate widths. Close steps keep the picked file near the size it is shown at.
const WIDTHS = [160, 240, 320, 400, 480, 560, 640, 720, 800, 960, 1120, 1280, 1440, 1600, 1920];
const MAX_WIDTH = 1920;
// Lighthouse judges compression against the size an image is *shown* at (CSS pixels), so on a
// 1.75× phone screen a file may only use ~0.054 bytes per real pixel. AVIF reaches that with good quality.
const TARGET_BPP = 0.042;
const REMOTE = /^https:\/\/(images\.pexels\.com|[a-z0-9]+\.supabase\.co)\//;

// How wide each kind of image is shown, measured in the layout (mobile gutter 24px each side).
const GUTTER = 'calc(100vw - 48px)';
const SIZES = {
  // Page heroes sit under a dark overlay: a slightly lighter file on phones is not noticeable.
  hero: '(max-width: 767px) 62vw, 100vw',
  'hero__slides': '100vw',
  stile: `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 352px, 236px`,
  job: '(max-width: 767px) calc(50vw - 30px), 236px',
  'feature__img': `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 496px`,
  'wide-img': `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 992px`,
  'card__img': `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 480px`,
  tile: `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 480px`,
  split: `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 480px`,
  award: '260px',
  'award--footer': '200px',
  brand: '58px',
};
const DEFAULT_SIZES = `(max-width: 767px) ${GUTTER}, (max-width: 1023px) 720px, 50vw`;

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const setAttr = (tag, name, value) =>
  attr(tag, name) != null
    ? tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${value}"`)
    : tag.replace(/\s*\/?>$/, ` ${name}="${value}" />`);
const dropAttr = (tag, name) => tag.replace(new RegExp(`\\s${name}="[^"]*"`), '');

/** Picks the sizes value from the image's own classes or the classes of the elements around it. */
function sizesFor(tag, parentClasses) {
  const own = (attr(tag, 'class') || '').split(/\s+/).reverse();
  for (const c of [...own, ...parentClasses]) if (SIZES[c]) return SIZES[c];
  return DEFAULT_SIZES;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** For every <img>, the classes of its open ancestor elements (nearest first). */
function imgAncestors(html) {
  const stack = [];
  const result = new Map();
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->/g)) {
    if (!m[2]) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.findLastIndex((e) => e.name === name);
      if (i >= 0) stack.length = i;
    } else if (name === 'img') {
      result.set(m.index, stack.toReversed().flatMap((e) => e.classes));
    } else if (!VOID.has(name) && !m[3]) {
      stack.push({ name, classes: (attr(m[0], 'class') || '').split(/\s+/).filter(Boolean).reverse() });
    }
  }
  return result;
}

/** Bigger Pexels source (same crop ratio) so we can make every width ourselves. */
function pexelsSource(url) {
  const u = new URL(url.replace(/&amp;/g, '&'));
  const w = Number(u.searchParams.get('w')) || MAX_WIDTH;
  const h = Number(u.searchParams.get('h')) || 0;
  u.searchParams.set('w', String(MAX_WIDTH));
  if (h) u.searchParams.set('h', String(Math.round((h / w) * MAX_WIDTH)));
  return u.toString();
}

export function images({ root, publicDir = resolve(root, 'public'), outDir = resolve(root, 'dist') }) {
  const cacheDir = resolve(root, 'node_modules/.cache/jjel-images');
  const sources = new Map(); // source key → Promise<{ name, width, height, widths }>
  const files = new Map(); // output file name → cache path
  let isBuild = false;

  async function loadSource(src) {
    if (REMOTE.test(src)) {
      const url = src.includes('images.pexels.com') ? pexelsSource(src) : src.replace(/&amp;/g, '&');
      const file = join(cacheDir, 'src', createHash('sha1').update(url).digest('hex').slice(0, 16));
      if (!existsSync(file)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        mkdirSync(join(cacheDir, 'src'), { recursive: true });
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      const id = url.match(/photos\/(\d+)\//)?.[1];
      return { buf: readFileSync(file), stem: id ? `pexels-${id}` : basename(new URL(url).pathname, extname(new URL(url).pathname)) };
    }
    const path = resolve(publicDir, src.replace(/^\.?\//, ''));
    if (!path.startsWith(publicDir) || !existsSync(path)) return null;
    return { buf: readFileSync(path), stem: basename(path, extname(path)) };
  }

  async function encode(img, w, cachePath) {
    if (existsSync(cachePath)) return;
    return limited(() => encodeNow(img, w, cachePath));
  }

  async function encodeNow(img, w, cachePath) {
    const meta = await img.metadata();
    const h = Math.round((meta.height / meta.width) * w);
    const resized = img.clone().resize({ width: w });
    let out;
    for (const quality of [64, 56, 48, 42, 36, 30]) {
      out = await resized.clone().avif({ quality, effort: 4 }).toBuffer();
      if (out.length / (w * h) <= TARGET_BPP || out.length < 3000) break;
    }
    writeFileSync(cachePath, out);
  }

  function process(src) {
    if (!sources.has(src)) {
      sources.set(
        src,
        (async () => {
          const s = await loadSource(src);
          if (!s) return null;
          const hash = createHash('sha1').update(s.buf).digest('hex').slice(0, 8);
          const img = sharp(s.buf).rotate();
          const { width, height } = await img.metadata();
          const max = Math.min(width, MAX_WIDTH);
          const widths = WIDTHS.filter((w) => w < max);
          widths.push(max);
          const name = `${s.stem}-${hash}`;
          mkdirSync(join(cacheDir, 'out'), { recursive: true });
          await Promise.all(
            widths.map(async (w) => {
              const file = `${name}-${w}.avif`;
              const cachePath = join(cacheDir, 'out', file);
              await encode(img, w, cachePath);
              files.set(file, cachePath);
            }),
          );
          return { name, width: max, height: Math.round((height / width) * max), widths };
        })(),
      );
    }
    return sources.get(src);
  }

  async function rewriteImg(tag, parentClasses) {
    const src = attr(tag, 'src');
    if (!src || src.startsWith('data:') || /\.svg(\?|$)/.test(src)) return tag;
    const info = await process(src).catch((e) => {
      console.warn(`[images] ${src}: ${e.message}`);
      return null;
    });
    if (!info) return tag;
    const url = (w) => `images/opt/${info.name}-${w}.avif`;
    const fallback = info.widths.find((w) => w >= 800) || info.width;
    let out = tag;
    out = setAttr(out, 'src', url(fallback));
    out = setAttr(out, 'srcset', info.widths.map((w) => `${url(w)} ${w}w`).join(', '));
    out = setAttr(out, 'sizes', sizesFor(tag, parentClasses));
    if (!attr(tag, 'width') || !attr(tag, 'height')) {
      out = setAttr(out, 'width', String(info.width));
      out = setAttr(out, 'height', String(info.height));
    }
    out = dropAttr(dropAttr(out, 'data-px'), 'data-ar');
    // data-defer: the page script sets src/srcset later (hero slides after the first).
    if (/\sdata-defer\b/.test(out)) {
      out = out.replace(/\sdata-defer\b/, '').replace(/\ssrc="/, ' data-src="').replace(/\ssrcset="/, ' data-srcset="');
    }
    return out;
  }

  return {
    name: 'jjel-images',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        if (!isBuild || /admin\.html$/.test(ctx.filename)) return html;
        const ancestors = imgAncestors(html);
        const parts = [];
        let last = 0;
        for (const m of html.matchAll(/<img\b[^>]*>/g)) {
          parts.push(html.slice(last, m.index));
          parts.push(rewriteImg(m[0], ancestors.get(m.index) || []));
          last = m.index + m[0].length;
        }
        parts.push(html.slice(last));
        html = (await Promise.all(parts)).join('');
        const bg = [...html.matchAll(/url\('(https:\/\/[^']+)'\)/g)].filter((m) => REMOTE.test(m[1]));
        for (const m of bg) {
          const info = await process(m[1]).catch(() => null);
          if (!info) continue;
          const w = info.widths.find((x) => x >= 640) || info.width;
          html = html.replace(m[0], `url('images/opt/${info.name}-${w}.avif')`);
        }
        return html;
      },
    },
    closeBundle() {
      if (!isBuild || !files.size) return;
      const dir = join(outDir, 'images/opt');
      mkdirSync(dir, { recursive: true });
      for (const [file, cachePath] of files) copyFileSync(cachePath, join(dir, file));
    },
  };
}
