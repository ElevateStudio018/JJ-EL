// Brings a page up to date with the content last saved in the admin, without waiting for a rebuild.
// The page carries the version and token values it was built with (see render.js); when Supabase
// holds a newer version, the generated blocks are re-rendered and the old token values replaced.
import { blocks, contentText, contentVars } from './templates.js';
import { SUPABASE_URL, SUPABASE_KEY, CONTENT_TABLE } from './supabase-config.js';

const ATTRS = ['href', 'aria-label', 'title', 'alt', 'content'];

/** Old → new text replacements. Numbers only in their known phrasings, so other digits stay untouched. */
function replacements(old, next) {
  const pairs = [];
  const add = (a, b) => a && a !== b && pairs.push([a, b]);
  const rating = (k) => ['/5', ' av 5'].forEach((s) => add(old[k] + s, next[k] + s));
  add(old.phone, next.phone);
  add(old.email, next.email);
  add(`tel:${old.tel}`, `tel:${next.tel}`);
  rating('reco');
  rating('google');
  ['verifierade', 'omdömen'].forEach((w) => add(`${old.recoCount} ${w}`, `${next.recoCount} ${w}`));
  add(old['hero.title'], next['hero.title']);
  add(old['hero.lead'], next['hero.lead']);
  return pairs;
}

function replaceText(pairs) {
  if (!pairs.length) return;
  const swap = (s) => pairs.reduce((t, [a, b]) => t.split(a).join(b), s);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = swap(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  for (const el of document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v != null && swap(v) !== v) el.setAttribute(a, swap(v));
    }
  }
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves with the current content once the page shows it (or null if it could not be fetched). */
export const liveContent = (async () => {
  const built = document.querySelector('meta[name="cms-version"]')?.content;
  const bakedEl = document.getElementById('cms-vars');
  if (!built || !bakedEl || !crypto.subtle) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${CONTENT_TABLE}?id=eq.1&select=data`, {
      headers: { apikey: SUPABASE_KEY },
    });
    const c = res.ok ? (await res.json())[0]?.data : null;
    if (!c?.company || (await sha256(contentText(c))) === built) return c;

    for (const el of document.querySelectorAll('[data-cms-block]')) {
      const render = blocks[el.dataset.cmsBlock];
      if (render) el.innerHTML = render(c);
    }
    replaceText(replacements(JSON.parse(bakedEl.textContent), contentVars(c)));
    document.dispatchEvent(new CustomEvent('cms:updated', { detail: c }));
    return c;
  } catch {
    return null; // offline or Supabase unreachable: the built page is still complete
  }
})();
