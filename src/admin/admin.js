import './admin.css';
import { createClient } from '@supabase/supabase-js';
import repoImages from 'virtual:repo-images';
import { SUPABASE_URL, SUPABASE_KEY, CONTENT_TABLE, IMAGE_BUCKET } from '../cms/supabase-config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'jjel-admin-auth' } });

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let content = null; // working copy
let saved = ''; // JSON of last saved/loaded state
let updatedAt = null; // row version, to detect edits from another browser
let images = []; // selectable image values: "images/x.jpg" (in the repo) or bucket URLs
const pending = new Map(); // bucket URL → { blob, path, url } awaiting upload

/* ---------- helpers ---------- */

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, v) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v;
};

function toast(msg, kind = '') {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.className = `toast is-shown ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-shown'), kind === 'is-error' ? 8000 : 3500);
}

function show(view) {
  $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== view));
}

const isDirty = () => pending.size > 0 || JSON.stringify(content) !== saved;
function refreshDirty() {
  $('[data-savebar]').hidden = !isDirty();
}

const imgSrc = (image) => pending.get(image)?.url ?? image;
const imgLabel = (image) => decodeURIComponent(image.split('/').pop());

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bild';

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

/** Same text the sync job writes to content/site.json, hashed like the build's content-version.txt. */
async function contentHash(data) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- rendering ---------- */

function renderBindings() {
  $$('[data-bind]').forEach((el) => {
    el.value = getPath(content, el.dataset.bind) ?? '';
  });
}

const blanks = {
  reviews: () => ({ name: '', text: '', date: '', source: 'Verifierad kund på Reco', featured: false }),
  jobsHome: () => ({ image: '', caption: '' }),
  jobsAll: () => ({ image: '', caption: '' }),
};

function renderList(key) {
  const list = $(`[data-list="${key}"]`);
  const tpl = $(key === 'reviews' ? '#tpl-review' : '#tpl-job');
  list.replaceChildren(
    ...content[key].map((item, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.index = i;
      $$('[data-f]', li).forEach((el) => {
        const f = el.dataset.f;
        if (el.tagName === 'SELECT') {
          const opts = [...new Set([item.image, ...images].filter(Boolean))];
          el.replaceChildren(new Option('— välj bild —', ''), ...opts.map((o) => new Option(imgLabel(o), o)));
        }
        if (el.type === 'checkbox') el.checked = !!item[f];
        else el.value = item[f] ?? '';
      });
      const thumb = $('[data-thumb]', li);
      if (thumb) {
        thumb.src = item.image ? imgSrc(item.image) : '';
        thumb.hidden = !item.image;
      }
      $$('[data-if]', li).forEach((el) => (el.hidden = !item[el.dataset.if]));
      $('[data-move="-1"]', li).disabled = i === 0;
      $('[data-move="1"]', li).disabled = i === content[key].length - 1;
      return li;
    }),
  );
}

function renderAll() {
  renderBindings();
  ['reviews', 'jobsHome', 'jobsAll'].forEach(renderList);
  refreshDirty();
}

/* ---------- events ---------- */

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.bind) {
    setPath(content, el.dataset.bind, el.value);
  } else if (el.dataset.f) {
    const li = el.closest('[data-index]');
    const key = el.closest('[data-list]').dataset.list;
    const item = content[key][li.dataset.index];
    const f = el.dataset.f;
    if (el.type === 'checkbox') item[f] = el.checked;
    else if (el.value === '' && f === 'quote') delete item[f];
    else item[f] = el.value;
    if (f === 'image') {
      const thumb = $('[data-thumb]', li);
      thumb.src = el.value ? imgSrc(el.value) : '';
      thumb.hidden = !el.value;
    }
    $$('[data-if]', li).forEach((x) => (x.hidden = !item[x.dataset.if]));
  } else return;
  refreshDirty();
});

document.addEventListener('change', async (e) => {
  const input = e.target.closest('[data-upload]');
  if (!input?.files[0]) return;
  const li = input.closest('[data-index]');
  const key = input.closest('[data-list]').dataset.list;
  const item = content[key][li.dataset.index];
  try {
    const blob = await prepareImage(input.files[0]);
    const base = slug(item.caption || input.files[0].name.replace(/\.\w+$/, ''));
    const path = `jobb-${base}-${Date.now().toString(36)}.jpg`;
    const url = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    pending.set(url, { blob, path, url: URL.createObjectURL(blob) });
    images.unshift(url);
    item.image = url;
    renderList(key);
    refreshDirty();
  } catch {
    toast('Kunde inte läsa bilden. Prova en JPG eller PNG.', 'is-error');
  }
  input.value = '';
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [role="tab"]');
  if (!t) return;

  if (t.dataset.tab) {
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b === t));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
    return;
  }
  if (t.dataset.add) {
    const key = t.dataset.add;
    content[key].unshift(blanks[key]());
    renderList(key);
    refreshDirty();
    $(`[data-list="${key}"] input`)?.focus();
    return;
  }
  const li = t.closest('[data-index]');
  if (li) {
    const key = li.closest('[data-list]').dataset.list;
    const arr = content[key];
    const i = +li.dataset.index;
    if (t.dataset.move) {
      const j = i + +t.dataset.move;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    } else if ('remove' in t.dataset) {
      if (!confirm('Ta bort?')) return;
      arr.splice(i, 1);
    } else return;
    renderList(key);
    refreshDirty();
    return;
  }
  if ('save' in t.dataset) return save(t);
  if ('discard' in t.dataset) {
    if (!confirm('Ångra alla osparade ändringar?')) return;
    content = JSON.parse(saved);
    pending.forEach((p, image) => {
      URL.revokeObjectURL(p.url);
      images = images.filter((i) => i !== image);
    });
    pending.clear();
    renderAll();
    return;
  }
  if ('password' in t.dataset) return $('[data-pw-dialog]').showModal();
  if ('pwCancel' in t.dataset) return $('[data-pw-dialog]').close();
  if ('logout' in t.dataset) {
    if (isDirty() && !confirm('Du har osparade ändringar. Logga ut ändå?')) return;
    await sb.auth.signOut();
    location.reload();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (content && isDirty()) e.preventDefault();
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
  $('[data-pw-dialog]').close();
  toast('Lösenordet är bytt.', 'is-ok');
});

/* ---------- save / load ---------- */

function validate() {
  const errs = [];
  if (!content.company.phone.trim()) errs.push('Telefonnummer saknas.');
  if (!/^\S+@\S+\.\S+$/.test(content.company.email)) errs.push('Ogiltig e-postadress.');
  content.reviews.forEach((r, i) => {
    if (!r.name.trim() || !r.text.trim()) errs.push(`Omdöme ${i + 1} saknar namn eller text.`);
  });
  for (const key of ['jobsHome', 'jobsAll'])
    content[key].forEach((j, i) => {
      if (!j.image || !j.caption.trim()) errs.push(`Jobb ${i + 1} (${key === 'jobsHome' ? 'startsidan' : 'Om oss'}) saknar bild eller bildtext.`);
    });
  return errs;
}

async function save(btn) {
  const errs = validate();
  if (errs.length) return toast(errs.join(' '), 'is-error');
  btn.disabled = true;
  btn.textContent = 'Sparar…';
  try {
    for (const [image, p] of pending) {
      const { error } = await sb.storage.from(IMAGE_BUCKET).upload(p.path, p.blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      pending.delete(image);
    }
    const { data, error } = await sb
      .from(CONTENT_TABLE)
      .update({ data: content })
      .eq('id', 1)
      .eq('updated_at', updatedAt)
      .select('data, updated_at');
    if (error) throw error;
    if (!data.length) {
      return toast('Innehållet har ändrats från en annan dator. Ladda om sidan och gör om ändringen.', 'is-error');
    }
    content = data[0].data;
    updatedAt = data[0].updated_at;
    saved = JSON.stringify(content);
    renderAll();
    toast('Sparat! Ändringen syns på sajten inom 5–10 minuter.', 'is-ok');
    watchDeploy();
  } catch (e) {
    toast(`Kunde inte spara: ${e.message}`, 'is-error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Spara & publicera';
  }
}

let deployTimer;
/** Compares the saved content with what the live site was built from (content-version.txt). */
async function watchDeploy() {
  clearTimeout(deployTimer);
  const el = $('[data-deploy]');
  const want = await contentHash(JSON.parse(saved));
  const live = await fetch(`content-version.txt?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  const done = live.trim() === want;
  el.dataset.state = done ? 'ok' : 'busy';
  el.textContent = done ? 'Publicerad' : 'Publiceras…';
  el.title = done ? 'Sajten visar det senast sparade innehållet.' : 'Sajten byggs om automatiskt inom 5–10 minuter.';
  if (!done) deployTimer = setTimeout(watchDeploy, 30000);
}

async function load() {
  const [{ data, error }, bucket] = await Promise.all([
    sb.from(CONTENT_TABLE).select('data, updated_at').eq('id', 1).single(),
    sb.storage.from(IMAGE_BUCKET).list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } }),
  ]);
  if (error) throw error;
  content = data.data;
  updatedAt = data.updated_at;
  saved = JSON.stringify(content);
  images = [
    ...(bucket.data || []).filter((f) => f.id).map((f) => sb.storage.from(IMAGE_BUCKET).getPublicUrl(f.name).data.publicUrl),
    ...repoImages.map((n) => `images/${n}`),
  ];
  renderAll();
  show('editor');
  watchDeploy();
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

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  const msg = $('[data-login-msg]');
  const f = new FormData(e.target);
  btn.disabled = true;
  msg.textContent = '';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) throw new Error(error.status === 400 ? 'Fel e-post eller lösenord.' : error.message);
    await enter();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

sb.auth.getSession().then(({ data }) => {
  if (data.session) enter().catch(() => show('login'));
  else show('login');
});
