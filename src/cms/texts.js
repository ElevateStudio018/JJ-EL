// Editable page texts. Every piece of visible text in the HTML pages (headings, paragraphs, buttons,
// list items …) can be changed in the admin. The change is stored as `texts[original] = replacement`
// in the content, applied when the site is built (render.js) and in the browser right after a save
// (live.js). The original text is the key, so a text that appears on several pages (header, footer)
// is changed everywhere at once.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decode = (s) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

export const encode = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Collapses runs of whitespace, as the browser shows them. Keys are always normalised like this. */
export const norm = (s) => s.replace(/[\s ]+/g, ' ').trim();

/** Text that is worth offering for editing (not just punctuation, numbers or a template token). */
const editable = (t) => /\p{L}/u.test(t) && !t.includes('{{');

// Elements whose content is never page text.
const SKIP = /<(script|style|svg|template|noscript|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Calls fn(text, start, end, tagName) for every text run between tags in the <body> and the <title>,
 * skipping scripts, styles, icons and generated content blocks.
 */
function eachText(html, fn) {
  const masked = html.replace(SKIP, (m) => ' '.repeat(m.length));
  const stack = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>|([^<]+)/g;
  let body = false;
  for (let m; (m = re.exec(masked)); ) {
    if (m[2]) {
      const name = m[2].toLowerCase();
      if (name === 'body' || name === 'title') body = !m[1];
      if (m[1]) {
        const i = stack.lastIndexOf(name);
        if (i >= 0) stack.length = i;
      } else if (!m[3] && !/^(br|img|input|meta|link|hr|source|wbr)$/.test(name)) stack.push(name);
      continue;
    }
    if (!m[4] || !body) continue;
    const text = norm(decode(m[4]));
    if (text && editable(text)) fn(text, m.index, m.index + m[4].length, stack.at(-1) || '', stack);
  }
}

/** Build: replaces every text that has an edited version. Leading/trailing whitespace is kept. */
export function applyTexts(html, texts) {
  if (!texts || !Object.keys(texts).length) return html;
  const edits = [];
  eachText(html, (text, start, end) => {
    if (texts[text] != null && texts[text] !== text) edits.push([start, end]);
  });
  for (let i = edits.length - 1; i >= 0; i--) {
    const [start, end] = edits[i];
    const raw = html.slice(start, end);
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    html = html.slice(0, start) + lead + encode(texts[norm(decode(raw))]) + trail + html.slice(end);
  }
  // Page title and description follow their texts too.
  return html.replace(/(<meta (?:name|property)="(?:description|og:description|og:title|twitter:title|twitter:description)" content=")([^"]*)(")/g, (m, a, v, b) => {
    const t = texts[norm(decode(v))];
    return t != null ? a + encode(t).replace(/"/g, '&quot;') + b : m;
  });
}

const KIND = { h1: 'Huvudrubrik', h2: 'Rubrik', h3: 'Underrubrik', h4: 'Underrubrik', p: 'Text', a: 'Länk', button: 'Knapp', li: 'Listpunkt', title: 'Sidtitel (flik och Google)', label: 'Formulärfält', option: 'Val', figcaption: 'Bildtext', blockquote: 'Citat', small: 'Liten text', th: 'Tabellrubrik', td: 'Tabell' };

/** Admin: the editable texts of one page, in order, with what kind of text it is and the heading above it. */
export function extractTexts(html) {
  const items = [];
  const seen = new Set();
  let section = '';
  eachText(html, (text, _s, _e, tag, stack) => {
    if (/^h[1-3]$/.test(tag)) section = text;
    if (seen.has(text)) return;
    seen.add(text);
    const kindTag = [...stack].reverse().find((t) => KIND[t]) || tag;
    const where = stack.includes('footer') ? 'footer' : stack.includes('header') ? 'header' : 'main';
    items.push({ text, kind: KIND[kindTag] || 'Text', section: /^h[1-3]$/.test(tag) ? '' : section, where });
  });
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const d = desc && norm(decode(desc));
  if (d && editable(d) && !seen.has(d)) items.splice(1, 0, { text: d, kind: 'Beskrivning (visas i Google)', section: '', where: 'head' });
  return items;
}
