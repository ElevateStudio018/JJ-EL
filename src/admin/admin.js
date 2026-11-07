import './admin.css';
import { createClient } from '@supabase/supabase-js';
import repoImages from 'virtual:repo-images';
import siteTexts from 'virtual:site-texts';
import { norm } from '../cms/texts.js';
import { SUPABASE_URL, SUPABASE_KEY, CONTENT_TABLE, IMAGE_BUCKET } from '../cms/supabase-config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'jjel-admin-auth' } });
const DRAFT_KEY = 'jjel-admin-draft';
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const SOURCES = ['Verifierad kund på Reco', 'Google-recension'];
const JOB_LISTS = { jobsHome: 'Startsidan', jobsAll: 'Om oss' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name) => `<svg><use href="#i-${name}"/></svg>`;

let content = null; // working copy
let saved = ''; // JSON of the last saved/loaded state
let updatedAt = null; // row version, to detect edits from another browser
let updatedBy = '';
let userEmail = '';
let images = []; // selectable images: "images/x.jpg" (in the repo) or bucket URLs
const pending = new Map(); // bucket URL → { blob, path, url } awaiting upload
const undoStack = [];
const ui = { view: 'oversikt', filter: 'all', search: '', jobList: 'jobsHome', drawer: null, mediaPick: null, textPage: 'index.html', textSearch: '', textEdited: false };

/* ---------- helpers ---------- */

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, v) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};
const debounce = (fn, ms) => {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), ms)));
};
const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bild';
const imgSrc = (image) => pending.get(image)?.url ?? image;
const imgName = (image) => decodeURIComponent(image.split('/').pop()).replace(/-[a-z0-9]{8}(?=\.\w+$)/, '');
const parseRating = (s) => Number(String(s).replace(',', '.'));
const telLink = (phone) => String(phone).replace(/[^\d+]/g, '').replace(/^0/, '+46');
const today = () => {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
function relTime(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'nyss';
  if (s < 3600) return `för ${Math.round(s / 60)} min sedan`;
  if (s < 86400) return `för ${Math.round(s / 3600)} tim sedan`;
  if (s < 86400 * 7) return `för ${Math.round(s / 86400)} dagar sedan`;
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
}
/** "IMG_2041.jpg" → "", "kok-belysning_2.png" → "Kok belysning 2" */
function captionFromFile(name) {
  const base = name.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ').trim();
  if (/^(img|dsc|pxl|photo|bild|image)?\s*\d+$/i.test(base) || /^\d{8}/.test(base)) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function toast(msg, kind = 'ok', action) {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<div>${esc(msg)}</div>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => (action.fn(), close());
    el.append(b);
  }
  $('[data-toasts]').append(el);
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  };
  setTimeout(close, kind === 'error' ? 9000 : action ? 7000 : 4000);
}

/** Downscale to max 1800px and re-encode as JPEG so uploads stay small. */
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
}

/** Queues image files for upload on save; returns their future public URLs. */
async function addImageFiles(files) {
  const urls = [];
  for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
    try {
      const blob = await prepareImage(file);
      const path = `jobb-${slug(file.name.replace(/\.\w+$/, ''))}-${Date.now().toString(36).slice(-8)}.jpg`;
      const url = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      pending.set(url, { blob, path, url: URL.createObjectURL(blob), file: file.name });
      images.unshift(url);
      urls.push(url);
    } catch {
      toast(`Kunde inte läsa ${file.name}. Prova JPG eller PNG.`, 'error');
    }
  }
  return urls;
}

/** Rough number of edits between two JSON values: changed fields, added/removed list items, one per reorder. */
function diffCount(a, b) {
  if (a === b) return 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const ja = a.map((x) => JSON.stringify(x));
    const jb = b.map((x) => JSON.stringify(x));
    const rest = [...jb];
    const common = ja.filter((x) => {
      const k = rest.indexOf(x);
      return k >= 0 && rest.splice(k, 1);
    });
    const moved = jb.filter((x) => common.includes(x)).join('\0') !== common.join('\0') ? 1 : 0;
    return Math.max(a.length, b.length) - common.length + moved;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return 1;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const k of keys) n += k in a && k in b ? diffCount(a[k], b[k]) : 1;
  return n;
}

/** Best-effort parse of a review copied from Reco or Google. */
function parseReview(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const monthRe = /(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zåä]*\.?\s+(\d{4})/i;
  const isoRe = /(\d{4})-(\d{2})-(\d{2})/;
  const noise = /^(verifierad|★|☆|\d([.,]\d)?\s*(\/\s*5|av 5)?$|läs mer|svara|gilla|hjälpsamt|recension|omdöme från|lokal guide)/i;
  let date = '';
  let name = '';
  const rest = [];
  for (const line of lines) {
    const m = line.match(monthRe);
    const iso = line.match(isoRe);
    if (!date && (m || iso) && line.length < 40) {
      date = m
        ? `${+m[1]} ${MONTHS.find((x) => x.startsWith(m[2].toLowerCase()))} ${m[3]}`
        : `${+iso[3]} ${MONTHS[+iso[2] - 1]} ${iso[1]}`;
      continue;
    }
    if (noise.test(line)) continue;
    if (!name && line.length <= 40 && !/[.!?]$/.test(line)) {
      name = line;
      continue;
    }
    rest.push(line);
  }
  const text = rest.join(' ').replace(/^[”"“]|[”"“]$/g, '').trim();
  const source = /google/i.test(raw) ? SOURCES[1] : SOURCES[0];
  return { name, date: date || today(), source, text, featured: false };
}

/** First sentences of a review that fit a short homepage quote. */
function suggestQuote(text, max = 150) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  return (out || sentences[0]).trim();
}

/* ---------- state changes ---------- */

const isDirty = () => pending.size > 0 || JSON.stringify(content) !== saved;

function snapshot() {
  const s = JSON.stringify(content);
  if (undoStack.at(-1) !== s) undoStack.push(s);
  if (undoStack.length > 100) undoStack.shift();
}

let typing = false;
const stopTyping = debounce(() => (typing = false), 900);
/** Groups a burst of keystrokes into one undo step. */
function snapshotTyping() {
  if (!typing) snapshot();
  typing = true;
  stopTyping();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return toast('Inget att ångra.', 'error');
  content = JSON.parse(prev);
  if (ui.drawer && !content[ui.drawer.key]?.[ui.drawer.index]) closeDrawer();
  renderAll();
  if (ui.drawer) renderDrawer();
}

const saveDraft = debounce(() => {
  try {
    if (isDirty() && pending.size === 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: updatedAt, at: Date.now(), content }));
    } else if (!isDirty()) localStorage.removeItem(DRAFT_KEY);
  } catch {}
}, 600);
const dropDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
};

/** Re-renders everything that depends on content, except form fields the user may be typing in. */
function changed() {
  renderDerived();
  saveDraft();
}

/* ---------- rendering ---------- */

function renderAll() {
  $$('[data-bind]').forEach((el) => (el.value = getPath(content, el.dataset.bind) ?? ''));
  renderDerived();
  renderTexts();
  liveRefresh();
}

function renderDerived() {
  renderNav();
  renderSavebar();
  renderStatus();
  renderDashboard();
  renderCompany();
  renderHero();
  renderReviews();
  renderJobs();
  if (ui.drawer) renderDrawerPreview();
}

function renderNav() {
  const base = JSON.parse(saved);
  const dirty = {
    foretag: diffCount(base.company, content.company) + diffCount(base.rating, content.rating) > 0,
    startsida: diffCount(base.hero, content.hero) > 0,
    sida: diffCount(base.texts || {}, content.texts || {}) + diffCount(base.hero, content.hero) > 0,
    texter: diffCount(base.texts || {}, content.texts || {}) > 0,
    omdomen: diffCount(base.reviews, content.reviews) > 0,
    jobb: diffCount(base.jobsHome, content.jobsHome) + diffCount(base.jobsAll, content.jobsAll) > 0 || pending.size > 0,
  };
  $$('.nav__item[data-nav]').forEach((b) => b.classList.toggle('is-dirty', !!dirty[b.dataset.nav]));
  $$('[data-count="reviews"]').forEach((e) => (e.textContent = content.reviews.length));
  $$('[data-count="texts"]').forEach((e) => (e.textContent = Object.keys(content.texts || {}).length || ''));
  $$('[data-count="jobs"]').forEach((e) => (e.textContent = content.jobsAll.length));
  $$('[data-count="jobsHome"]').forEach((e) => (e.textContent = content.jobsHome.length));
  $$('[data-count="jobsAll"]').forEach((e) => (e.textContent = content.jobsAll.length));
}

function renderSavebar() {
  const dirty = isDirty();
  $('[data-savebar]').hidden = !dirty;
  if (!dirty) return;
  const n = diffCount(JSON.parse(saved), content) + pending.size;
  $('[data-dirty-count]').textContent = `${n} osparad${n === 1 ? '' : 'e'} ändring${n === 1 ? '' : 'ar'}`;
  $('[data-undo]').disabled = undoStack.length === 0;
}

function renderStatus() {
  const el = $('[data-status]');
  const state = isDirty() ? 'dirty' : 'ok';
  el.dataset.state = state;
  el.innerHTML = state === 'dirty' ? `${icon('upload')}Osparade ändringar` : `${icon('check')}Sparat och live ✓`;
}

/** Smart checks on the content, each with an optional fix. */
function insights() {
  const out = [];
  const featured = content.reviews.filter((r) => r.featured);
  const recoReviews = content.reviews.filter((r) => /reco/i.test(r.source)).length;
  const recoCount = parseInt(content.rating.recoCount, 10);
  if (featured.length < 3)
    out.push({ kind: 'warn', text: `Bara ${featured.length} omdöme${featured.length === 1 ? '' : 'n'} visas på startsidan. Karusellen blir bäst med minst 3.`, label: 'Välj omdömen', fn: () => (go('omdomen'), setFilter('hidden')) });
  if (recoReviews > (recoCount || 0))
    out.push({ kind: 'info', text: `Listan har ${recoReviews} Reco-omdömen men betyget säger ${content.rating.recoCount || 0} st.`, label: `Uppdatera till ${recoReviews}`, fn: () => (snapshot(), (content.rating.recoCount = String(recoReviews)), renderAll(), saveDraft()) });
  featured.forEach((r) => {
    if (!r.quote && r.text.length > 200)
      out.push({ kind: 'info', text: `Omdömet från ${r.name} är långt för karusellen (${r.text.length} tecken).`, label: 'Föreslå kort citat', fn: () => (snapshot(), (r.quote = suggestQuote(r.text)), go('omdomen'), changed(), openDrawer('reviews', content.reviews.indexOf(r))) });
  });
  content.reviews.forEach((r, i) => {
    if (!r.name.trim() || !r.text.trim()) out.push({ kind: 'error', text: `Omdöme ${i + 1} saknar namn eller text.`, label: 'Åtgärda', fn: () => (go('omdomen'), openDrawer('reviews', i)) });
  });
  for (const key of Object.keys(JOB_LISTS)) {
    content[key].forEach((j, i) => {
      if (!j.image || !j.caption.trim())
        out.push({ kind: 'error', text: `Jobb ${i + 1} (${JOB_LISTS[key]}) saknar ${j.image ? 'bildtext' : 'bild'}.`, label: 'Åtgärda', fn: () => (go('jobb'), setJobList(key), openDrawer(key, i)) });
    });
  }
  const all = new Set(content.jobsAll.map((j) => j.image));
  const missing = content.jobsHome.filter((j) => j.image && !all.has(j.image));
  if (missing.length)
    out.push({ kind: 'info', text: `${missing.length} jobb på startsidan finns inte i galleriet på Om oss.`, label: 'Lägg till dem', fn: () => (snapshot(), content.jobsAll.unshift(...missing.map((j) => ({ ...j }))), changed()) });
  const seen = new Set();
  const dupes = content.jobsAll.filter((j) => j.image && (seen.has(j.image) || !seen.add(j.image)));
  if (dupes.length) out.push({ kind: 'warn', text: `${dupes.length} bild${dupes.length === 1 ? '' : 'er'} förekommer två gånger på Om oss.`, label: 'Visa', fn: () => (go('jobb'), setJobList('jobsAll')) });
  const empty = Object.entries(content.texts || {}).filter(([, v]) => !norm(v));
  if (empty.length)
    out.push({ kind: 'error', text: `${empty.length === 1 ? 'En text' : `${empty.length} texter`} på webbplatsen är tom${empty.length === 1 ? '' : 'ma'}.`, label: 'Visa', fn: () => (go('texter'), (ui.textEdited = true), renderTexts()) });
  if (content.hero.title.length > 70) out.push({ kind: 'warn', text: 'Rubriken på startsidan är lång och kan bli trång i mobilen.', label: 'Redigera', fn: () => go('startsida') });
  if (!/^\S+@\S+\.\S+$/.test(content.company.email)) out.push({ kind: 'error', text: 'E-postadressen ser inte giltig ut.', label: 'Redigera', fn: () => go('foretag') });
  return out;
}

let tipActions = [];
function renderDashboard() {
  const hour = new Date().getHours();
  const name = userEmail.split('@')[0].replace(/^\w/, (c) => c.toUpperCase());
  $('[data-greeting]').textContent = `${hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll'}${name ? `, ${name}` : ''}`;

  const featured = content.reviews.filter((r) => r.featured).length;
  const reco = parseRating(content.rating.reco);
  $('[data-stats]').innerHTML = `
    <button class="stat" data-nav="omdomen"><small>Omdömen</small><b>${content.reviews.length}</b><span>${featured} på startsidan</span></button>
    <button class="stat" data-nav="foretag"><small>Betyg på Reco</small><b>${esc(content.rating.reco)}</b><span class="stars" style="--v:${Number.isFinite(reco) ? reco : 0}"></span></button>
    <button class="stat" data-nav="jobb"><small>Jobbilder</small><b>${content.jobsAll.length}</b><span>${content.jobsHome.length} på startsidan</span></button>
    <div class="stat"><small>Senast ändrad</small><b style="font-size:20px;margin-top:10px">${updatedAt ? esc(relTime(updatedAt)) : '–'}</b><span>${updatedBy ? `av ${esc(updatedBy)}` : ''}</span></div>`;

  const dirty = isDirty();
  const steps = [
    { b: dirty ? 'Osparade ändringar' : 'Sparat', s: dirty ? 'Klicka på ”Spara & publicera” när du är klar.' : 'Allt du ändrat är sparat.', st: dirty ? 'active' : 'done' },
    { b: 'Live på webbplatsen', s: dirty ? 'Syns för besökarna direkt när du sparar.' : 'Besökarna ser det senast sparade.', st: dirty ? '' : 'done' },
  ];
  $('[data-steps]').innerHTML = steps.map((x) => `<li class="${x.st ? `is-${x.st}` : ''}"><div><b>${x.b}</b><span>${x.s}</span></div></li>`).join('');
  $('[data-last-edit]').textContent = updatedAt ? `Senast sparad ${relTime(updatedAt)}${updatedBy ? ` av ${updatedBy}` : ''}.` : '';

  const tips = insights();
  tipActions = tips.map((t) => t.fn);
  $('[data-tips-count]').textContent = tips.length ? `${tips.length} st` : '';
  $('[data-tips]').innerHTML = tips.length
    ? tips.map((t, i) => `<li class="tip tip--${t.kind}">${icon(t.kind === 'error' ? 'alert' : t.kind === 'warn' ? 'alert' : 'bulb')}<div>${esc(t.text)}${t.label ? `<br><button class="btn btn--sm" data-tip="${i}">${esc(t.label)}</button>` : ''}</div></li>`).join('')
    : `<li class="tip tip--ok">${icon('check')}<div>Allt ser bra ut – inga förslag just nu.</div></li>`;
}

function renderCompany() {
  const c = content.company;
  const digits = c.phone.replace(/\D/g, '').replace(/^46/, '0');
  const phoneOk = /^07/.test(digits) ? digits.length === 10 : digits.length >= 8 && digits.length <= 10;
  const mailOk = /^\S+@\S+\.\S+$/.test(c.email);
  hint('phone', phoneOk ? `Ringlänk: ${telLink(c.phone)}` : /^07/.test(digits) ? `Mobilnummer har 10 siffror – det här har ${digits.length}.` : 'Kontrollera numret.', phoneOk ? 'ok' : 'error');
  hint('email', mailOk ? (c.email !== JSON.parse(saved).company.email ? 'Offertformuläret skickar hit. FormSubmit mejlar en aktiveringslänk vid första förfrågan.' : '') : 'Ogiltig e-postadress.', mailOk ? '' : 'error');
  const bad = ['reco', 'google'].filter((k) => !(parseRating(content.rating[k]) >= 0 && parseRating(content.rating[k]) <= 5));
  hint('rating', bad.length ? 'Betyg anges mellan 0 och 5, t.ex. 4,7.' : '', bad.length ? 'error' : '');

  $('[data-pv-company]').innerHTML = `<span>${icon('phone')}${esc(c.phone)}</span><span>${icon('mail')}${esc(c.email)}</span><span>★ ${esc(content.rating.reco)}/5 på Reco</span>`;
  $('[data-pv-score]').innerHTML = ['reco', 'google']
    .map((k) => `<div><small>${k === 'reco' ? 'Reco' : 'Google'}</small><b>${esc(content.rating[k])}</b><span class="stars" style="--v:${parseRating(content.rating[k]) || 0}"></span>${k === 'reco' ? `<small><br>${esc(content.rating.recoCount)} omdömen</small>` : ''}</div>`)
    .join('');
}

function hint(name, text, kind) {
  const el = $(`[data-hint="${name}"]`);
  el.textContent = text;
  el.className = `field__hint${kind ? ` is-${kind}` : ''}`;
  el.closest('.field')?.classList.toggle('is-invalid', kind === 'error');
}

function renderHero() {
  const pv = $('[data-pv-hero]');
  pv.style.backgroundImage = 'url("images/jobb-elcentral.jpg")';
  pv.innerHTML = `<h3>${esc(content.hero.title)}</h3><p>${esc(content.hero.lead)}</p><div class="pv-ctas"><span>Begär offert</span><span>Se våra tjänster</span></div>`;
  $$('[data-counter]').forEach((el) => {
    const n = (getPath(content, el.dataset.counter) || '').length;
    el.textContent = `${n}/${el.dataset.max}`;
    el.classList.toggle('is-over', n > +el.dataset.max);
  });
}

const canDrag = () => ui.filter === 'all' && !ui.search;

function renderReviews() {
  const q = ui.search.toLowerCase();
  const rows = content.reviews
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => ui.filter === 'all' || (ui.filter === 'featured' ? r.featured : !r.featured))
    .filter(({ r }) => !q || `${r.name} ${r.text} ${r.date}`.toLowerCase().includes(q));
  const drag = canDrag();
  $('[data-reviews]').innerHTML = rows.length
    ? rows
        .map(
          ({ r, i }) => `<li class="rrow${ui.drawer?.key === 'reviews' && ui.drawer.index === i ? ' is-open' : ''}" data-key="reviews" data-index="${i}" ${drag ? 'draggable="true"' : ''}>
        <span class="grip" title="${drag ? 'Dra för att flytta' : 'Visa alla utan sökning för att sortera'}" ${drag ? '' : 'style="opacity:.3"'}>${icon('grip')}</span>
        <div class="rrow__main">
          <div class="rrow__top"><b>${esc(r.name) || '<i class="muted">Namn saknas</i>'}</b><small>${esc(r.date)}</small>${/google/i.test(r.source) ? '<span class="badge badge--muted">Google</span>' : ''}${r.quote ? '<span class="badge badge--muted">Kort citat</span>' : ''}</div>
          <div class="rrow__text">${esc(r.text) || '<i>Text saknas</i>'}</div>
        </div>
        <label class="switch" title="Visa på startsidan"><input type="checkbox" data-feature="${i}" ${r.featured ? 'checked' : ''} /><i></i><span>Startsida</span></label>
      </li>`,
        )
        .join('')
    : `<li class="empty">${q ? `Inga omdömen matchar ”${esc(ui.search)}”.` : 'Inga omdömen här ännu.'}</li>`;
}

function renderJobs() {
  const key = ui.jobList;
  $('[data-joblist-hint]').textContent =
    key === 'jobsHome' ? 'Urvalet under ”Utförda jobb” på startsidan – 8 bilder ger jämna rader.' : 'Hela galleriet på sidan Om oss.';
  $('[data-jobs]').innerHTML =
    content[key]
      .map(
        (j, i) => `<li class="jcard${ui.drawer?.key === key && ui.drawer.index === i ? ' is-open' : ''}" data-key="${key}" data-index="${i}" draggable="true" title="${esc(j.caption)}">
      ${j.image ? `<img src="${esc(imgSrc(j.image))}" alt="" loading="lazy" />` : ''}
      <span class="jcard__num">${i + 1}</span>
      ${!j.image || !j.caption.trim() ? `<span class="jcard__warn">Saknar ${j.image ? 'text' : 'bild'}</span>` : ''}
      <div class="jcard__cap">${esc(j.caption) || '<i>Ingen bildtext</i>'}</div>
    </li>`,
      )
      .join('') + `<li><button class="jcard jcard--add" data-add-job>${icon('upload')}Lägg till bilder<span class="muted small">eller släpp dem här</span></button></li>`;
}

/* ---------- texter ---------- */

// Texts that are on most pages (menu, footer, contact form) are edited once, under their own heading.
const COMMON = '__common';
const textPages = (() => {
  const count = new Map();
  for (const p of siteTexts) for (const t of p.texts) count.set(t.text, (count.get(t.text) || 0) + 1);
  const shared = (t) => t.where === 'header' || t.where === 'footer' || count.get(t.text) > siteTexts.length / 2;
  const common = new Map();
  const label = (t) => (t.where === 'footer' ? 'Sidfot' : t.where === 'header' ? 'Meny' : 'Återkommer på flera sidor');
  const pages = siteTexts.map((p) => ({
    ...p,
    texts: p.texts.filter((t) => {
      if (!shared(t)) return true;
      if (!common.has(t.text)) common.set(t.text, { ...t, section: label(t) });
      return false;
    }),
  }));
  return [...pages, { file: COMMON, name: 'Meny & sidfot (alla sidor)', texts: [...common.values()] }];
})();
const pagesWith = (text) => siteTexts.filter((p) => p.texts.some((t) => t.text === text)).length;

function renderTextPages() {
  const sel = $('[data-text-page]');
  if (sel.options.length) return;
  sel.innerHTML = textPages.map((p) => `<option value="${esc(p.file)}">${esc(p.name)}</option>`).join('');
  sel.value = ui.textPage;
}

function textItem(t) {
  const texts = content.texts || {};
  const value = texts[t.text] ?? t.text;
  const edited = t.text in texts;
  const n = pagesWith(t.text);
  return `<div class="titem${edited ? ' is-edited' : ''}" data-titem>
    <div class="titem__top"><span class="titem__kind">${esc(t.kind)}</span>${n > 1 ? `<span>· finns på ${n} sidor</span>` : ''}<span class="titem__edited" ${edited ? '' : 'hidden'}>Ändrad</span>
      <button class="titem__reset" data-text-reset="${esc(t.text)}" ${edited ? '' : 'hidden'}>Återställ</button></div>
    <textarea rows="1" data-text="${esc(t.text)}" aria-label="${esc(t.kind)}">${esc(value)}</textarea>
  </div>`;
}

function renderTexts() {
  const box = $('[data-text-list]');
  if (!box || !content) return;
  renderTextPages();
  const q = norm(ui.textSearch).toLowerCase();
  const texts = content.texts || {};
  const keep = (t) =>
    (!ui.textEdited || t.text in texts) &&
    (!q || t.text.toLowerCase().includes(q) || String(texts[t.text] || '').toLowerCase().includes(q));
  const pages = q || ui.textEdited ? textPages : textPages.filter((p) => p.file === ui.textPage);
  const groups = [];
  for (const p of pages) {
    const list = p.texts.filter(keep);
    if (!list.length) continue;
    if (q || ui.textEdited) {
      groups.push({ title: p.name, sub: `${list.length} text${list.length === 1 ? '' : 'er'}`, items: list.slice(0, 80) });
      continue;
    }
    for (const t of list) {
      const head = /^(Sidtitel|Beskrivning)/.test(t.kind) ? 'Sidans titel och beskrivning' : t.section || 'Överst på sidan';
      if (groups.at(-1)?.title !== head) groups.push({ title: head, items: [] });
      groups.at(-1).items.push(t);
    }
  }
  box.innerHTML = groups.length
    ? groups.map((g) => `<div class="card tgroup"><h2>${esc(g.title)}${g.sub ? ` <small>${g.sub}</small>` : ''}</h2>${g.items.map(textItem).join('')}</div>`).join('')
    : `<div class="card tempty">${q ? `Ingen text innehåller ”${esc(ui.textSearch)}”.` : 'Inga ändrade texter än.'}</div>`;
}

function setText(original, value) {
  snapshotTyping();
  content.texts ||= {};
  if (norm(value) === original) delete content.texts[original];
  else content.texts[original] = value;
  const item = $(`[data-text="${CSS.escape(original)}"]`)?.closest('[data-titem]');
  if (item) {
    const edited = original in content.texts;
    item.classList.toggle('is-edited', edited);
    $('.titem__reset', item).hidden = !edited;
    $('.titem__edited', item).hidden = !edited;
  }
  changed();
}

/* ---------- förfrågningar ---------- */

// Quote requests from the website form, stored in jjel_leads (only admins can read them).
const leads = { list: [], filter: 'open', loaded: false };
const LEAD_TABLE = 'jjel_leads';

async function loadLeads() {
  const { data, error } = await sb.from(LEAD_TABLE).select('*').order('created_at', { ascending: false }).limit(500);
  if (error) {
    toast(`Kunde inte hämta förfrågningar: ${error.message}`, 'error');
    return;
  }
  leads.list = data;
  leads.loaded = true;
  renderLeads();
}

function renderLeads() {
  const open = leads.list.filter((l) => !l.handled).length;
  $$('[data-count="leads"]').forEach((e) => (e.textContent = open || ''));
  $('[data-lead-mail]').textContent = content?.company?.email || 'jesper@jjel.se';
  const box = $('[data-lead-list]');
  if (!box) return;
  const list = leads.list.filter((l) => leads.filter === 'all' || (leads.filter === 'done' ? l.handled : !l.handled));
  if (!leads.loaded) return void (box.innerHTML = '<div class="lead__empty">Hämtar förfrågningar…</div>');
  if (!list.length) {
    box.innerHTML = `<div class="lead__empty">${leads.filter === 'open' ? 'Inga nya förfrågningar just nu. När någon fyller i offertformuläret på hemsidan dyker det upp här.' : 'Inga förfrågningar här.'}</div>`;
    return;
  }
  const when = (d) => new Date(d).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = list
    .map((l) => {
      const subject = encodeURIComponent(`Ang. din förfrågan${l.service ? ` – ${l.service}` : ''}`);
      return `<article class="lead${l.handled ? ' is-done' : ''}">
        <div class="lead__top"><b>${esc(l.name)}</b>${l.handled ? '' : '<span class="lead__new">Ny</span>'}${l.service ? `<span class="lead__tag">${esc(l.service)}</span>` : ''}<time>${when(l.created_at)}</time>${l.city ? `<span>${esc(l.city)}</span>` : ''}</div>
        <div class="lead__contact">${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : ''}<a href="mailto:${esc(l.email)}?subject=${subject}">${esc(l.email)}</a>${l.page ? `<span class="muted">från ${esc(l.page)}</span>` : ''}</div>
        <div class="lead__acts">
          <button class="btn btn--sm ${l.handled ? '' : 'btn--primary'}" data-lead-done="${l.id}">${l.handled ? 'Markera som ny' : 'Markera som hanterad'}</button>
          <button class="btn btn--sm btn--ghost" data-lead-del="${l.id}">Ta bort</button>
        </div>
        <p class="lead__msg">${esc(l.message)}</p>
      </article>`;
    })
    .join('');
}

async function setLeadHandled(id) {
  const l = leads.list.find((x) => x.id === id);
  if (!l) return;
  const { error } = await sb.from(LEAD_TABLE).update({ handled: !l.handled }).eq('id', id);
  if (error) return toast(`Kunde inte spara: ${error.message}`, 'error');
  l.handled = !l.handled;
  renderLeads();
  toast(l.handled ? 'Markerad som hanterad.' : 'Markerad som ny.');
}

async function deleteLead(id) {
  const l = leads.list.find((x) => x.id === id);
  if (!l || !confirm(`Ta bort förfrågan från ${l.name}? Det går inte att ångra.`)) return;
  const { error } = await sb.from(LEAD_TABLE).delete().eq('id', id);
  if (error) return toast(`Kunde inte ta bort: ${error.message}`, 'error');
  leads.list = leads.list.filter((x) => x.id !== id);
  renderLeads();
  toast('Förfrågan borttagen.');
}

/* ---------- välkomstguide ---------- */

// The guide video opens by itself the first time someone signs in (remembered on the account, so it does
// not come back on another device), and can always be opened again from Översikt.
const INTRO_KEY = 'jjel-admin-intro-seen';
let introTimer = 0;

function openIntro(first) {
  const dlg = $('[data-intro]');
  const btn = $('[data-intro-close]');
  const video = $('[data-intro-video]');
  clearInterval(introTimer);
  let left = first ? 15 : 0;
  const tick = () => {
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? `Hoppa över om ${left} s` : first ? 'Hoppa över' : 'Stäng';
  };
  tick();
  if (left) introTimer = setInterval(() => (left--, tick(), left <= 0 && clearInterval(introTimer)), 1000);
  video.onended = () => {
    clearInterval(introTimer);
    btn.disabled = false;
    btn.textContent = 'Kom igång';
  };
  dlg.showModal();
  video.currentTime = 0;
  video.play().catch(() => {});
}

async function closeIntro() {
  const dlg = $('[data-intro]');
  if ($('[data-intro-close]').disabled) return;
  clearInterval(introTimer);
  $('[data-intro-video]').pause();
  dlg.close();
  try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  sb.auth.updateUser({ data: { jjel_intro_seen: true } }).catch(() => {});
}

$('[data-intro]').addEventListener('cancel', (e) => {
  e.preventDefault();
  closeIntro();
});

/* ---------- redigera sidan ---------- */

// The real site is shown in an iframe (same domain, so the admin can reach into it). Every piece of
// editable text is wrapped in a span that can be clicked and edited in place; changes go into the same
// content.texts as the Texter view, so Spara & publicera works exactly as before.
const ORIGINALS = new Set(siteTexts.flatMap((p) => p.texts.map((t) => t.text)));
const HERO = { '@hero.title': 'hero.title', '@hero.lead': 'hero.lead' };
const live = { file: 'index.html', size: 'desktop', loaded: false };
const LIVE_CSS = `
[data-jj]{cursor:text;border-radius:3px;transition:box-shadow .15s,background-color .15s}
[data-jj]:hover{box-shadow:0 0 0 2px rgba(224,165,38,.9);background-color:rgba(224,165,38,.14)}
[data-jj].jj-changed{box-shadow:0 0 0 2px rgba(224,165,38,.55)}
[data-jj].jj-editing{box-shadow:0 0 0 2px #1c2817;background-color:#fff;color:#1e1e1c !important;text-shadow:none;outline:none;-webkit-text-fill-color:#1e1e1c}
a,button,[role=button]{cursor:default}`;

const liveValue = (key) => (HERO[key] ? getPath(content, HERO[key]) : (content.texts || {})[key] ?? key);
const liveChanged = (key) =>
  HERO[key] ? getPath(content, HERO[key]) !== getPath(JSON.parse(saved), HERO[key]) : key in (content.texts || {});

/** Which editable text a piece of page text is: an original, the edited version of one, or the hero. */
function liveKey(t, baked) {
  const savedContent = JSON.parse(saved);
  for (const [key, path] of Object.entries(HERO)) {
    if (t === norm(getPath(savedContent, path) || '') || t === norm(getPath(content, path) || '')) return key;
  }
  for (const map of [savedContent.texts || {}, baked, content.texts || {}]) {
    for (const [k, v] of Object.entries(map)) if (norm(String(v)) === t) return k;
  }
  return ORIGINALS.has(t) ? t : null;
}

function liveDoc() {
  try {
    return $('[data-live]').contentDocument;
  } catch {
    return null;
  }
}

function liveMark(doc) {
  if (!doc?.body) return;
  let baked = {};
  try {
    baked = JSON.parse(doc.getElementById('cms-vars')?.textContent || '{}')._texts || {};
  } catch {}
  const skip = 'script,style,svg,noscript,textarea,select,option,[data-jj],[data-cms-block]';
  const walker = doc.createTreeWalker(doc.body, 4, {
    acceptNode: (n) => (n.parentElement?.closest(skip) ? 2 : 1),
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const t = norm(n.nodeValue);
    if (!t) continue;
    const key = liveKey(t, baked);
    if (!key) continue;
    const span = doc.createElement('span');
    span.dataset.jj = key;
    span.textContent = liveValue(key);
    span.classList.toggle('jj-changed', liveChanged(key));
    const lead = n.nodeValue.match(/^\s*/)[0];
    const trail = n.nodeValue.match(/\s*$/)[0];
    n.replaceWith(...[lead && doc.createTextNode(lead), span, trail && doc.createTextNode(trail)].filter(Boolean));
  }
}

/** Shows the working copy (unsaved edits included) in the page. */
function liveRefresh() {
  const doc = liveDoc();
  if (!doc?.body) return;
  for (const span of doc.querySelectorAll('[data-jj]')) {
    if (span.classList.contains('jj-editing')) continue;
    const v = liveValue(span.dataset.jj);
    if (span.textContent !== v) span.textContent = v;
    span.classList.toggle('jj-changed', liveChanged(span.dataset.jj));
  }
}

function liveSet(key, value) {
  if (HERO[key]) {
    snapshotTyping();
    setPath(content, HERO[key], value);
    const field = $(`[data-bind="${HERO[key]}"]`);
    if (field) field.value = value;
    changed();
  } else setText(key, value);
  // The same text can be on the page more than once (menu, buttons): keep them all in step.
  const doc = liveDoc();
  doc?.querySelectorAll(`[data-jj="${CSS.escape(key)}"]`).forEach((s) => {
    if (!s.classList.contains('jj-editing')) s.textContent = value;
    s.classList.toggle('jj-changed', liveChanged(key));
  });
}

function liveStartEdit(span) {
  const doc = span.ownerDocument;
  doc.querySelectorAll('.jj-editing').forEach((s) => s !== span && s.blur());
  const before = span.textContent;
  span.classList.add('jj-editing');
  try {
    span.contentEditable = 'plaintext-only';
  } catch {
    span.contentEditable = 'true';
  }
  if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
  span.focus();
  const hint = $('[data-live-hint]');
  hint.textContent = 'Skriv den nya texten · Enter = klar · Esc = ångra';
  hint.classList.add('is-editing');
  const onInput = () => liveSet(span.dataset.jj, span.textContent.replace(/\s+/g, ' '));
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      span.blur();
    } else if (e.key === 'Escape') {
      span.textContent = before;
      liveSet(span.dataset.jj, before);
      span.blur();
    }
  };
  const onPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ');
    doc.execCommand('insertText', false, text);
  };
  const onBlur = () => {
    span.contentEditable = 'false';
    span.classList.remove('jj-editing');
    span.classList.toggle('jj-changed', liveChanged(span.dataset.jj));
    hint.textContent = 'Klicka på en text för att ändra den';
    hint.classList.remove('is-editing');
    span.removeEventListener('input', onInput);
    span.removeEventListener('keydown', onKey);
    span.removeEventListener('paste', onPaste);
  };
  span.addEventListener('input', onInput);
  span.addEventListener('keydown', onKey);
  span.addEventListener('paste', onPaste);
  span.addEventListener('blur', onBlur, { once: true });
}

function liveSetup() {
  const frame = $('[data-live]');
  const doc = liveDoc();
  if (!doc?.body) return;
  const style = doc.createElement('style');
  style.textContent = LIVE_CSS;
  doc.head.append(style);
  // Nothing on the page navigates or submits while editing.
  doc.addEventListener(
    'click',
    (e) => {
      const span = e.target.closest?.('[data-jj]');
      if (span) {
        e.preventDefault();
        e.stopPropagation();
        if (!span.classList.contains('jj-editing')) liveStartEdit(span);
        return;
      }
      if (e.target.closest?.('a')) e.preventDefault();
    },
    true,
  );
  doc.addEventListener('submit', (e) => e.preventDefault(), true);
  liveMark(doc);
  // The page brings itself up to date from Supabase right after loading: mark again once it has.
  doc.addEventListener('cms:updated', () => setTimeout(() => (liveMark(doc), liveRefresh()), 50));
  setTimeout(() => (liveMark(doc), liveRefresh()), 1200);
  frame.dataset.ready = '1';
}

function liveLoad() {
  const frame = $('[data-live]');
  const sel = $('[data-live-page]');
  if (!sel.options.length) {
    sel.innerHTML = siteTexts.map((p) => `<option value="${esc(p.file)}">${esc(p.name)}</option>`).join('');
  }
  sel.value = live.file;
  frame.dataset.ready = '';
  frame.onload = liveSetup;
  frame.src = `${live.file}?redigera=${Date.now()}`;
  live.loaded = true;
}

function setLiveSize(size) {
  live.size = size;
  $$('[data-live-size]').forEach((b) => b.setAttribute('aria-selected', b.dataset.liveSize === size));
  $('[data-livebox]').classList.toggle('is-mobile', size === 'mobile');
}

/* ---------- navigation ---------- */

function go(view) {
  if (!$(`[data-view-id="${view}"]`)) view = 'oversikt';
  ui.view = view;
  $$('[data-view-id]').forEach((v) => (v.hidden = v.dataset.viewId !== view));
  $$('.nav__item[data-nav], .tabbar [data-nav]').forEach((b) =>
    b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'),
  );
  closeDrawer();
  if (view === 'sida' && !live.loaded) liveLoad();
  if (view === 'leads') loadLeads();
  if (view === 'sida') liveRefresh();
  if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0 });
}

function setFilter(f) {
  ui.filter = f;
  $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.filter === f));
  renderReviews();
}

function setJobList(key) {
  ui.jobList = key;
  $$('[data-joblist]').forEach((b) => b.setAttribute('aria-selected', b.dataset.joblist === key));
  closeDrawer();
  renderJobs();
}

/* ---------- drawer ---------- */

function openDrawer(key, index) {
  ui.drawer = { key, index };
  $('[data-drawer]').classList.add('is-open');
  $('[data-drawer]').setAttribute('aria-hidden', 'false');
  $('[data-scrim]').hidden = false;
  renderDrawer();
  renderReviews();
  renderJobs();
  setTimeout(() => $('[data-drawer] input, [data-drawer] textarea')?.focus({ preventScroll: true }), 50);
}

function closeDrawer() {
  if (!ui.drawer) return;
  ui.drawer = null;
  $('[data-drawer]').classList.remove('is-open');
  $('[data-drawer]').setAttribute('aria-hidden', 'true');
  $('[data-scrim]').hidden = true;
  renderReviews();
  renderJobs();
}

function renderDrawer() {
  const { key, index } = ui.drawer;
  const item = content[key][index];
  const body = $('[data-drawer-body]');
  if (key === 'reviews') {
    $('[data-drawer-title]').textContent = item.name || 'Nytt omdöme';
    body.innerHTML = `
      <label class="field"><span>Namn</span><input data-f="name" value="${esc(item.name)}" placeholder="Förnamn E" /></label>
      <div class="grid-3" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>Datum <button type="button" class="btn btn--sm btn--ghost" data-today style="height:20px;padding:0 6px">Idag</button></span><input data-f="date" value="${esc(item.date)}" placeholder="7 maj 2026" /></label>
        <label class="field"><span>Källa</span><input data-f="source" value="${esc(item.source)}" list="sources" /></label>
      </div>
      <datalist id="sources">${SOURCES.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="field"><span>Omdöme <small class="counter" data-dcount="text"></small></span><textarea data-f="text" rows="6">${esc(item.text)}</textarea></label>
      <div class="row-between"><label class="switch"><input type="checkbox" data-f="featured" ${item.featured ? 'checked' : ''} /><i></i>Visa i karusellen på startsidan</label></div>
      <div data-if-featured ${item.featured ? '' : 'hidden'}>
        <label class="field"><span>Kort citat för startsidan <button type="button" class="btn btn--sm btn--ghost" data-suggest style="height:22px;padding:0 6px">${icon('wand')}Föreslå</button></span><textarea data-f="quote" rows="3" placeholder="Valfritt – annars visas hela omdömet.">${esc(item.quote || '')}</textarea></label>
      </div>
      <span class="preview__label">Så här ser det ut</span>
      <div class="pv-quote" data-dpreview style="margin-top:8px"></div>`;
  } else {
    $('[data-drawer-title]').textContent = item.caption || 'Nytt jobb';
    const other = key === 'jobsHome' ? 'jobsAll' : 'jobsHome';
    const also = content[other].some((j) => j.image && j.image === item.image);
    body.innerHTML = `
      <div class="drawer__img" data-dimg></div>
      <div class="drawer__img-actions">
        <button class="btn btn--sm" data-pick-image>${icon('image')}Välj från biblioteket</button>
        <label class="btn btn--sm">${icon('upload')}Ladda upp ny<input type="file" accept="image/*" hidden data-replace-image /></label>
      </div>
      <label class="field"><span>Bildtext <small class="counter" data-dcount="caption"></small></span><input data-f="caption" value="${esc(item.caption)}" placeholder="T.ex. Laddbox vid garage" /></label>
      <label class="also switch"><input type="checkbox" data-also ${also ? 'checked' : ''} ${item.image ? '' : 'disabled'} /><i></i>Visa även på ${JOB_LISTS[other]}</label>`;
  }
  $('[data-move="-1"]').disabled = index === 0;
  $('[data-move="1"]').disabled = index === content[key].length - 1;
  $('[data-drawer-pos]').textContent = `${index + 1} av ${content[key].length}`;
  renderDrawerPreview();
}

function renderDrawerPreview() {
  const { key, index } = ui.drawer;
  const item = content[key][index];
  if (!item) return closeDrawer();
  if (key === 'reviews') {
    $('[data-drawer-title]').textContent = item.name || 'Nytt omdöme';
    const pv = $('[data-dpreview]');
    if (pv) pv.innerHTML = `<blockquote>”${esc(item.featured && item.quote ? item.quote : item.text) || '…'}”</blockquote><small><b>${esc(item.name)}</b> · ${esc(item.source)} · ${esc(item.date)}</small>`;
    const c = $('[data-dcount="text"]');
    if (c) c.textContent = `${item.text.length} tecken`;
  } else {
    $('[data-drawer-title]').textContent = item.caption || 'Nytt jobb';
    const img = $('[data-dimg]');
    if (img) img.innerHTML = item.image ? `<img src="${esc(imgSrc(item.image))}" alt="" />` : '';
    const c = $('[data-dcount="caption"]');
    if (c) c.textContent = `${item.caption.length}/40`;
  }
}

function moveItem(key, from, to) {
  const arr = content[key];
  if (to < 0 || to >= arr.length || from === to) return;
  snapshot();
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  if (ui.drawer?.key === key) {
    const i = ui.drawer.index;
    ui.drawer.index = i === from ? to : from < i && to >= i ? i - 1 : from > i && to <= i ? i + 1 : i;
  }
  changed();
  if (ui.drawer) renderDrawer();
}

function removeItem(key, index) {
  snapshot();
  const [it] = content[key].splice(index, 1);
  closeDrawer();
  changed();
  const what = key === 'reviews' ? `Omdömet från ${it.name || 'okänd'}` : `Bilden ”${it.caption || 'utan text'}”`;
  toast(`${what} togs bort.`, 'ok', { label: 'Ångra', fn: undo });
}

/* ---------- media library ---------- */

function openMedia(onPick) {
  ui.mediaPick = onPick || null;
  $('[data-media-search]').value = '';
  renderMedia();
  $('[data-media]').showModal();
}

function renderMedia() {
  const q = $('[data-media-search]').value.toLowerCase();
  const used = new Map();
  for (const key of Object.keys(JOB_LISTS)) content[key].forEach((j) => used.set(j.image, (used.get(j.image) || 0) + 1));
  const current = ui.drawer && ui.drawer.key !== 'reviews' ? content[ui.drawer.key][ui.drawer.index]?.image : null;
  const list = images.filter((i) => !q || imgName(i).toLowerCase().includes(q));
  $('[data-media-grid]').innerHTML = list.length
    ? list
        .map(
          (i) => `<li><button data-media-item="${esc(i)}" class="${i === current ? 'is-current' : ''}" title="${esc(imgName(i))}">
        <img src="${esc(imgSrc(i))}" alt="" loading="lazy" />${pending.has(i) ? '<span class="tag">Ny</span>' : used.has(i) ? '' : '<span class="tag" style="background:var(--line-2);color:#fff">Oanvänd</span>'}
        <small>${esc(imgName(i))}</small></button></li>`,
        )
        .join('')
    : '<li class="empty" style="grid-column:1/-1">Inga bilder matchar.</li>';
}

/** Adds uploaded files as new jobs at the start of the current list and opens the first one. */
async function addJobsFromFiles(files) {
  const names = [...files].map((f) => f.name);
  const urls = await addImageFiles(files);
  if (!urls.length) return;
  snapshot();
  const key = ui.jobList;
  content[key].unshift(...urls.map((image, n) => ({ image, caption: captionFromFile(names[n] || '') })));
  changed();
  openDrawer(key, 0);
  toast(urls.length === 1 ? 'Bilden är tillagd – skriv en bildtext.' : `${urls.length} bilder tillagda.`);
}

/* ---------- events ---------- */

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!content) return;
  if (el.dataset.bind) {
    snapshotTyping();
    setPath(content, el.dataset.bind, el.value);
  } else if (el.dataset.text !== undefined) {
    return setText(el.dataset.text, el.value);
  } else if (el.matches('[data-text-search]')) {
    ui.textSearch = el.value;
    return renderTexts();
  } else if (el.dataset.f && ui.drawer) {
    const item = content[ui.drawer.key][ui.drawer.index];
    const f = el.dataset.f;
    if (el.type === 'checkbox') snapshot();
    else snapshotTyping();
    if (el.type === 'checkbox') item[f] = el.checked;
    else if (el.value === '' && f === 'quote') delete item[f];
    else item[f] = el.value;
    if (f === 'featured') $('[data-if-featured]').hidden = !el.checked;
  } else if (el.matches('[data-search]')) {
    ui.search = el.value;
    return renderReviews();
  } else if (el.matches('[data-media-search]')) {
    return renderMedia();
  } else if (el.matches('[data-paste-raw]')) {
    return renderPastePreview();
  } else return;
  changed();
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.feature !== undefined) {
    snapshot();
    content.reviews[+el.dataset.feature].featured = el.checked;
    changed();
    if (ui.drawer?.key === 'reviews' && ui.drawer.index === +el.dataset.feature) renderDrawer();
  } else if (el.matches('[data-also]')) {
    const item = content[ui.drawer.key][ui.drawer.index];
    const other = ui.drawer.key === 'jobsHome' ? 'jobsAll' : 'jobsHome';
    snapshot();
    if (el.checked) content[other].unshift({ ...item });
    else content[other] = content[other].filter((j) => j.image !== item.image);
    changed();
  } else if (el.matches('[data-replace-image]') && el.files[0]) {
    const [url] = await addImageFiles(el.files);
    if (url) {
      snapshot();
      const item = content[ui.drawer.key][ui.drawer.index];
      if (!item.caption) item.caption = captionFromFile(el.files[0].name);
      item.image = url;
      changed();
      renderDrawer();
    }
    el.value = '';
  } else if (el.matches('[data-file-new]') && el.files.length) {
    await addJobsFromFiles(el.files);
    el.value = '';
  } else if (el.matches('[data-media-file]') && el.files.length) {
    await addImageFiles(el.files);
    el.value = '';
    renderMedia();
    changed();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-live-page]')) {
    live.file = e.target.value;
    return liveLoad();
  }
  if (!e.target.matches('[data-text-page]')) return;
  ui.textPage = e.target.value;
  renderTexts();
  window.scrollTo({ top: 0 });
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-index], [data-nav]');
  if (!t) {
    return;
  }
  const d = t.dataset;

  if (d.nav) return go(d.nav);
  if ('guide' in d) return openIntro(false);
  if ('introClose' in d) return closeIntro();
  if (d.liveSize) return setLiveSize(d.liveSize);
  if (d.leadFilter) {
    leads.filter = d.leadFilter;
    $$('[data-lead-filter]').forEach((b) => b.setAttribute('aria-selected', b.dataset.leadFilter === d.leadFilter));
    return renderLeads();
  }
  if (d.leadDone) return setLeadHandled(Number(d.leadDone));
  if (d.leadDel) return deleteLead(Number(d.leadDel));
  if ('leadsRefresh' in d) return loadLeads();
  if (d.textReset !== undefined) {
    snapshot();
    delete content.texts?.[d.textReset];
    changed();
    return renderTexts();
  }
  if ('textEdited' in d) {
    ui.textEdited = !ui.textEdited;
    t.setAttribute('aria-pressed', ui.textEdited);
    return renderTexts();
  }
  if (d.tip !== undefined) return tipActions[+d.tip]?.();
  if (d.filter) return setFilter(d.filter);
  if (d.joblist) return setJobList(d.joblist);
  if ('password' in d) return $('[data-pw]').showModal();
  if ('pwCancel' in d) return $('[data-pw]').close();
  if ('logout' in d) {
    if (isDirty() && !confirm('Du har osparade ändringar. Logga ut ändå?')) return;
    await sb.auth.signOut();
    dropDraft();
    return location.reload();
  }
  if ('addReview' in d || d.quick === 'review') {
    snapshot();
    content.reviews.unshift({ name: '', text: '', date: today(), source: SOURCES[0], featured: false });
    go('omdomen');
    setFilter('all');
    changed();
    return openDrawer('reviews', 0);
  }
  if ('pasteOpen' in d) {
    $('[data-paste]').returnValue = '';
    $('[data-paste-raw]').value = '';
    renderPastePreview();
    return $('[data-paste]').showModal();
  }
  if ('addJob' in d || d.quick === 'job') {
    if (d.quick) go('jobb');
    return $('[data-file-new]').click();
  }
  if ('mediaOpen' in d) return openMedia();
  if ('mediaClose' in d) return $('[data-media]').close();
  if (d.mediaItem) {
    if (ui.mediaPick) ui.mediaPick(d.mediaItem);
    return $('[data-media]').close();
  }
  if ('pickImage' in d) {
    return openMedia((image) => {
      snapshot();
      content[ui.drawer.key][ui.drawer.index].image = image;
      changed();
      renderDrawer();
    });
  }
  if ('today' in d) {
    const input = $('[data-f="date"]');
    input.value = today();
    return input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if ('suggest' in d) {
    const ta = $('[data-f="quote"]');
    ta.value = suggestQuote(content.reviews[ui.drawer.index].text);
    return ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if ('drawerClose' in d) return closeDrawer();
  if (d.move && ui.drawer) return moveItem(ui.drawer.key, ui.drawer.index, ui.drawer.index + +d.move);
  if ('remove' in d && ui.drawer) return removeItem(ui.drawer.key, ui.drawer.index);
  if ('save' in d) return save(t);
  if ('undo' in d) return undo();
  if ('discard' in d) {
    if (!confirm('Kasta alla osparade ändringar?')) return;
    snapshot();
    content = JSON.parse(saved);
    pending.forEach((p, image) => {
      URL.revokeObjectURL(p.url);
      images = images.filter((i) => i !== image);
    });
    pending.clear();
    closeDrawer();
    dropDraft();
    renderAll();
    return toast('Ändringarna är kastade.', 'ok', { label: 'Ångra', fn: undo });
  }
  if ('draftRestore' in d) {
    snapshot();
    content = JSON.parse(localStorage.getItem(DRAFT_KEY)).content;
    $('[data-draft-banner]').hidden = true;
    renderAll();
    return toast('Utkastet är återställt. Glöm inte att spara.');
  }
  if ('draftDrop' in d) {
    dropDraft();
    return ($('[data-draft-banner]').hidden = true);
  }
  // A row or card: open it, unless the click was on its switch
  if (d.index !== undefined && !e.target.closest('.switch')) openDrawer(d.key, +d.index);
});

$('[data-scrim]').addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!content || $('[data-view="editor"]').hidden) return;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (isDirty()) save($('[data-save]'));
  } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !e.target.matches('input, textarea')) {
    e.preventDefault();
    undo();
  } else if (e.key === 'Escape' && ui.drawer && !$('dialog[open]')) {
    closeDrawer();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (content && isDirty()) e.preventDefault();
});
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* drag & drop: reorder rows/cards, and drop image files onto the job grid or media library */
let dragFrom = null;
const dropPos = (el, e) => {
  const r = el.getBoundingClientRect();
  return el.classList.contains('jcard') ? (e.clientX < r.left + r.width / 2 ? 'before' : 'after') : e.clientY < r.top + r.height / 2 ? 'before' : 'after';
};
const clearDrop = () => $$('.is-drop-before, .is-drop-after, .is-drop-target, .is-over').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-target', 'is-over'));

document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[draggable="true"][data-index]');
  if (!el) return;
  dragFrom = { key: el.dataset.key, index: +el.dataset.index };
  el.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', el.dataset.index);
});
document.addEventListener('dragend', (e) => {
  e.target.classList?.remove('is-dragging');
  dragFrom = null;
  clearDrop();
});
document.addEventListener('dragover', (e) => {
  const files = e.dataTransfer?.types.includes('Files');
  const zone = e.target.closest?.('[data-jobs], [data-dropzone], [data-media]');
  if (files && zone) {
    e.preventDefault();
    clearDrop();
    (zone.matches('[data-media]') ? $('[data-dropzone]') : zone).classList.add(zone.matches('[data-jobs]') ? 'is-drop-target' : 'is-over');
    return;
  }
  const el = e.target.closest?.('[data-index]');
  if (!dragFrom || !el || el.dataset.key !== dragFrom.key) return;
  e.preventDefault();
  clearDrop();
  el.classList.add(`is-drop-${dropPos(el, e)}`);
});
document.addEventListener('drop', async (e) => {
  const files = e.dataTransfer?.files;
  if (files?.length) {
    e.preventDefault();
    clearDrop();
    if (e.target.closest('[data-media]')) {
      await addImageFiles(files);
      renderMedia();
      changed();
    } else if (e.target.closest('[data-jobs]')) await addJobsFromFiles(files);
    return;
  }
  const el = e.target.closest?.('[data-index]');
  if (!dragFrom || !el || el.dataset.key !== dragFrom.key) return;
  e.preventDefault();
  let to = +el.dataset.index + (dropPos(el, e) === 'after' ? 1 : 0);
  if (to > dragFrom.index) to--;
  moveItem(dragFrom.key, dragFrom.index, to);
  clearDrop();
});
// Stop the browser from opening files dropped outside a drop zone
window.addEventListener('dragover', (e) => e.dataTransfer?.types.includes('Files') && e.preventDefault());
window.addEventListener('drop', (e) => e.dataTransfer?.files.length && e.preventDefault());

/* paste review */
let parsed = null;
function renderPastePreview() {
  const raw = $('[data-paste-raw]').value;
  parsed = raw.trim() ? parseReview(raw) : null;
  $('[data-paste-preview]').innerHTML = parsed
    ? `<div><span>Namn:</span> ${esc(parsed.name) || '<i>hittades inte</i>'}</div><div><span>Datum:</span> ${esc(parsed.date)}</div><div><span>Källa:</span> ${esc(parsed.source)}</div><div><span>Text:</span> ${esc(parsed.text.slice(0, 140))}${parsed.text.length > 140 ? '…' : ''}</div>`
    : '';
  $('[data-paste-ok]').disabled = !(parsed?.name && parsed?.text);
}
$('[data-paste]').addEventListener('close', () => {
  if ($('[data-paste]').returnValue !== 'ok' || !parsed) return;
  snapshot();
  content.reviews.unshift(parsed);
  go('omdomen');
  setFilter('all');
  changed();
  openDrawer('reviews', 0);
  toast('Omdömet är tillagt – kontrollera fälten.');
});

$('[data-pw-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = $('[data-pw-msg]');
  if (f.get('pw').length < 8) return (msg.textContent = 'Minst 8 tecken.');
  if (f.get('pw') !== f.get('pw2')) return (msg.textContent = 'Lösenorden matchar inte.');
  const { error } = await sb.auth.updateUser({ password: f.get('pw') });
  if (error) return (msg.textContent = error.message);
  e.target.reset();
  msg.textContent = '';
  $('[data-pw]').close();
  toast('Lösenordet är bytt.');
});

/* ---------- save / load ---------- */

async function save(btn) {
  const errors = insights().filter((t) => t.kind === 'error');
  if (errors.length) {
    toast(errors[0].text, 'error', errors[0].fn && { label: errors[0].label, fn: errors[0].fn });
    return;
  }
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = pending.size ? `Laddar upp ${pending.size} bild${pending.size === 1 ? '' : 'er'}…` : 'Sparar…';
  try {
    for (const [image, p] of pending) {
      const { error } = await sb.storage.from(IMAGE_BUCKET).upload(p.path, p.blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      pending.delete(image);
    }
    btn.textContent = 'Sparar…';
    const { data, error } = await sb
      .from(CONTENT_TABLE)
      .update({ data: content })
      .eq('id', 1)
      .eq('updated_at', updatedAt)
      .select('data, updated_at, updated_by');
    if (error) throw error;
    if (!data.length) {
      toast('Innehållet har ändrats från en annan dator. Ladda om sidan – dina ändringar finns kvar som utkast att återställa.', 'error');
      return;
    }
    content = data[0].data;
    updatedAt = data[0].updated_at;
    updatedBy = data[0].updated_by || '';
    saved = JSON.stringify(content);
    undoStack.length = 0;
    dropDraft();
    renderAll();
    if (ui.drawer) renderDrawer();
    toast('Sparat! Ändringen syns direkt på webbplatsen.');
  } catch (err) {
    toast(`Kunde inte spara: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

async function load() {
  const [{ data, error }, bucket, user] = await Promise.all([
    sb.from(CONTENT_TABLE).select('data, updated_at, updated_by').eq('id', 1).single(),
    sb.storage.from(IMAGE_BUCKET).list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } }),
    sb.auth.getUser(),
  ]);
  if (error) throw error;
  content = data.data;
  updatedAt = data.updated_at;
  updatedBy = data.updated_by || '';
  saved = JSON.stringify(content);
  userEmail = user.data.user?.email || '';
  let introSeen = !!user.data.user?.user_metadata?.jjel_intro_seen;
  try { introSeen ||= localStorage.getItem(INTRO_KEY) === '1'; } catch {}
  $('[data-user-email]').textContent = userEmail;
  images = [
    ...(bucket.data || []).filter((f) => f.id).map((f) => sb.storage.from(IMAGE_BUCKET).getPublicUrl(f.name).data.publicUrl),
    ...repoImages.map((n) => `images/${n}`),
  ];
  $('[data-kbd]').textContent = /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘S' : 'Ctrl S';
  renderAll();
  $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== 'editor'));
  go(location.hash.slice(1) || 'oversikt');
  loadLeads();
  if (!introSeen) setTimeout(() => openIntro(true), 400);
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && JSON.stringify(draft.content) !== saved) {
      const n = diffCount(content, draft.content);
      const when = new Date(draft.at).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const stale = draft.base !== updatedAt ? ' Någon har sparat efter det – kontrollera innan du sparar.' : '';
      $('[data-draft-text]').textContent = `Du har ${n} osparad${n === 1 ? '' : 'e'} ändring${n === 1 ? '' : 'ar'} från ${when}.${stale}`;
      $('[data-draft-banner]').hidden = false;
    } else if (draft) dropDraft();
  } catch {}
}

/** Signed in and on the JJ El admin list → editor; otherwise back to the login form. */
async function enter() {
  const { data: isAdmin, error } = await sb.rpc('jjel_is_admin');
  if (error || !isAdmin) {
    await sb.auth.signOut();
    throw new Error('Kontot har inte behörighet till den här sidan.');
  }
  await load();
}

const showLogin = () => $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== 'login'));

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  const msg = $('[data-login-msg]');
  const f = new FormData(e.target);
  btn.disabled = true;
  btn.textContent = 'Loggar in…';
  msg.textContent = '';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) throw new Error(error.status === 400 ? 'Fel e-post eller lösenord.' : error.message);
    await enter();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Logga in';
  }
});

sb.auth.getSession().then(({ data }) => {
  if (data.session) enter().catch(showLogin);
  else showLogin();
});
