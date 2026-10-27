import './admin.css';
import { GitHub, REPO } from './github.js';

const CONTENT_PATH = 'content/site.json';
const IMAGE_DIR = 'public/images';
const TOKEN_KEY = 'jjel-admin-token';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const store = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (v) => {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {}
  },
};

let gh = null;
let content = null; // working copy
let saved = ''; // JSON of last saved/loaded state
let sha = null;
let images = []; // file names in public/images
const pending = new Map(); // image path → { blob, url } awaiting upload
const uploaded = new Map(); // image path → { blob, url } committed this session (not yet on the live site)

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

const imgSrc = (image) => {
  const path = `public/${image}`;
  return (pending.get(path) || uploaded.get(path))?.url ?? image;
};

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
          const opts = [...new Set([item.image, ...images.map((n) => `images/${n}`)].filter(Boolean))];
          el.replaceChildren(
            new Option('— välj bild —', ''),
            ...opts.map((o) => new Option(o.replace('images/', ''), o)),
          );
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
    const base = `jobb-${slug(item.caption || input.files[0].name.replace(/\.\w+$/, ''))}`;
    let name = `${base}.jpg`;
    for (let n = 2; images.includes(name) || pending.has(`${IMAGE_DIR}/${name}`); n++) name = `${base}-${n}.jpg`;
    pending.set(`${IMAGE_DIR}/${name}`, { blob, url: URL.createObjectURL(blob) });
    images.push(name);
    item.image = `images/${name}`;
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
    pending.forEach((p, path) => {
      URL.revokeObjectURL(p.url);
      images = images.filter((n) => `${IMAGE_DIR}/${n}` !== path);
    });
    pending.clear();
    renderAll();
    return;
  }
  if ('logout' in t.dataset) {
    if (isDirty() && !confirm('Du har osparade ändringar. Logga ut ändå?')) return;
    store.set(null);
    location.reload();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (content && isDirty()) e.preventDefault();
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
    for (const [path, p] of pending) {
      const bytes = new Uint8Array(await p.blob.arrayBuffer());
      await gh.writeBytes(path, bytes, null, `Ladda upp bild ${path.split('/').pop()} via admin`);
      uploaded.set(path, p);
      pending.delete(path);
    }
    const json = `${JSON.stringify(content, null, 2)}\n`;
    sha = await gh.writeText(CONTENT_PATH, json, sha, 'Uppdatera innehåll via admin');
    saved = JSON.stringify(content);
    renderAll();
    toast('Sparat! Sidan publiceras om en minut eller två.', 'is-ok');
    watchDeploy();
  } catch (e) {
    toast(
      e.status === 409
        ? 'Innehållet har ändrats någon annanstans. Ladda om sidan och gör om ändringen.'
        : `Kunde inte spara: ${e.message}`,
      'is-error',
    );
  } finally {
    btn.disabled = false;
    btn.textContent = 'Spara & publicera';
  }
}

let deployTimer;
async function watchDeploy() {
  clearTimeout(deployTimer);
  const el = $('[data-deploy]');
  const run = await gh.latestRun();
  if (!run) return (el.textContent = '');
  const busy = run.status !== 'completed';
  const ok = run.conclusion === 'success';
  el.dataset.state = busy ? 'busy' : ok ? 'ok' : 'fail';
  el.textContent = busy ? 'Publicerar…' : ok ? 'Publicerad' : 'Publicering misslyckades';
  el.title = `${run.display_title} — ${new Date(run.updated_at).toLocaleString('sv-SE')}`;
  if (busy) deployTimer = setTimeout(watchDeploy, 8000);
}

async function load() {
  const [{ data, sha: s }, files] = await Promise.all([gh.readJson(CONTENT_PATH), gh.listDir(IMAGE_DIR)]);
  content = data;
  sha = s;
  saved = JSON.stringify(content);
  images = files.filter((n) => /\.(jpe?g|png|webp|avif)$/i.test(n));
  renderAll();
  show('editor');
  watchDeploy();
}

async function login(token) {
  gh = new GitHub(token);
  await gh.verify();
  store.set(token);
  await load();
}

$$('[data-repo-name]').forEach((el) => (el.textContent = `${REPO.owner}/${REPO.name}`));

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  const msg = $('[data-login-msg]');
  btn.disabled = true;
  msg.textContent = '';
  try {
    await login(new FormData(e.target).get('token').trim());
  } catch (err) {
    msg.textContent = err.status === 401 ? 'Ogiltig token.' : err.status === 404 ? 'Token har inte åtkomst till repot.' : err.message;
  } finally {
    btn.disabled = false;
  }
});

const storedToken = store.get();
if (storedToken) {
  login(storedToken).catch(() => {
    store.set(null);
    show('login');
  });
} else {
  show('login');
}
