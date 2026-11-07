import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './styles/site.css';
import { company } from '../content/site.json';
import { liveContent } from './cms/live.js';
import { SUPABASE_URL, SUPABASE_KEY } from './cms/supabase-config.js';

// Every quote request is saved in the database (shown under Förfrågningar in the admin). A database
// trigger then mails it to the company inbox (Supabase function jjel-lead-mail), so the visitor only
// waits for the save and a slow mail server never loses a customer.
let contact = company;
liveContent.then((c) => c && (contact = c.company));
const tel = () => contact.phone.replace(/[^\d+]/g, '').replace(/^0/, '+46');

document.documentElement.classList.add('js');

const header = document.querySelector('.site-header');
const toTop = document.querySelector('.totop');
const onScroll = () => {
  const y = window.scrollY;
  header?.classList.toggle('is-scrolled', y > 10);
  toTop?.classList.toggle('is-visible', y > 500);
};
window.addEventListener('scroll', onScroll, { passive: true });
requestAnimationFrame(onScroll);
toTop?.addEventListener('click', () => window.scrollTo({ top: 0 }));

const menuBtn = document.querySelector('.menu-btn');
const panel = document.querySelector('.mobile-panel');
const setMenu = (open) => {
  panel.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  header.classList.toggle('is-scrolled', open || window.scrollY > 10);
};
menuBtn?.addEventListener('click', () => setMenu(!panel.classList.contains('is-open')));
panel?.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel?.classList.contains('is-open')) setMenu(false);
});

document.querySelectorAll('.carousel').forEach((c) => {
  const track = c.querySelector('.carousel__track');
  const step = () => (track.firstElementChild?.getBoundingClientRect().width || 300) + 22;
  c.querySelector('.carousel__btn--prev')?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  c.querySelector('.carousel__btn--next')?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  const count = c.querySelector('[data-count]');
  if (count) {
    const upd = () => (count.textContent = `${Math.round(track.scrollLeft / step()) + 1} / ${track.children.length}`);
    track.addEventListener('scroll', upd, { passive: true });
    document.addEventListener('cms:updated', upd);
    requestAnimationFrame(upd);
  }
});

const filterBtns = document.querySelectorAll('[data-filter]');
filterBtns.forEach((btn) =>
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    const f = btn.dataset.filter;
    document.querySelectorAll('[data-cat]').forEach((card) => {
      card.hidden = f !== 'alla' && card.dataset.cat !== f;
    });
  }),
);

// Gentle fade-up as sections enter the viewport (also for blocks re-rendered with live content).
const io =
  'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ? new IntersectionObserver(
        (entries) =>
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add('is-in');
              io.unobserve(en.target);
            }
          }),
        { rootMargin: '0px 0px -8% 0px' },
      )
    : null;
const reveal = () =>
  document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => (io ? io.observe(el) : el.classList.add('is-in')));
reveal();
document.addEventListener('cms:updated', reveal);

// Quote form → FormSubmit (AJAX), so visitors never need their own mail client.
document.querySelectorAll('[data-offert]').forEach((form) => {
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('[type="submit"]');
  const preset = new URLSearchParams(location.search).get('tjanst');
  if (preset && form.tjanst) form.tjanst.value = preset;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    status.classList.remove('is-error');

    let firstInvalid = null;
    form.querySelectorAll('[required]').forEach((f) => {
      const ok = f.type === 'checkbox' ? f.checked : f.value.trim() && (f.type !== 'email' || /^\S+@\S+\.\S+$/.test(f.value));
      f.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !firstInvalid) firstInvalid = f;
    });
    if (firstInvalid) {
      status.textContent = 'Fyll i namn, en giltig e-postadress, en beskrivning och godkänn villkoren.';
      status.classList.add('is-error');
      firstInvalid.focus();
      return;
    }
    if (form._honey?.value) return; // bot

    const d = new FormData(form);
    const page = location.pathname.split('/').pop() || 'index.html';

    submit.disabled = true;
    const labelEl = submit.querySelector('span') || submit;
    const label = labelEl.textContent;
    labelEl.textContent = 'Skickar…';
    const clip = (v, n) => String(v || '').trim().slice(0, n) || null;
    const lead = {
      name: clip(d.get('namn'), 120),
      phone: clip(d.get('telefon'), 40),
      email: clip(d.get('epost'), 160),
      city: clip(d.get('ort'), 80),
      service: clip(d.get('tjanst'), 80),
      message: clip(d.get('meddelande'), 4000),
      page: clip(page, 80),
    };
    const saveLead = async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/jjel_leads`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(lead),
      });
      if (!res.ok) throw new Error(res.status);
    };
    try {
      await saveLead();
      form.innerHTML = `<div class="form-done" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>
          <h3>Tack för din förfrågan!</h3>
          <p>Vi har tagit emot ditt meddelande och återkommer så snart vi kan.</p>
        </div>`;
    } catch {
      submit.disabled = false;
      labelEl.textContent = label;
      status.innerHTML =
        `Något gick fel när förfrågan skulle skickas. Försök igen, eller mejla <a href="mailto:${contact.email}">${contact.email}</a> / ring <a href="tel:${tel()}">${contact.phone}</a>.`;
      status.classList.add('is-error');
    }
  });
});

// Process: a line fills as you scroll and each step lights up when the line reaches it.
document.querySelectorAll('[data-progress]').forEach((box) => {
  const line = box.querySelector('.mprocess__line');
  const steps = [...box.querySelectorAll('.mstep')];
  const nums = steps.map((s) => s.querySelector('.mstep__num'));
  let len = 0;
  let marks = [];
  const vertical = () => matchMedia('(max-width: 900px)').matches;
  // All layout reads happen first and all style writes last, inside one animation frame,
  // so the browser never has to recalculate layout in the middle of the script.
  const measure = () => {
    const b = box.getBoundingClientRect();
    const v = vertical();
    const pos = nums.map((n) => {
      const r = n.getBoundingClientRect();
      return v ? r.top - b.top : r.left - b.left;
    });
    marks = pos.map((p) => p - pos[0]);
    len = marks[marks.length - 1];
  };
  const update = () => {
    const v = vertical();
    const r = box.getBoundingClientRect();
    const first = nums[0].getBoundingClientRect();
    const ref = innerHeight * 0.6;
    const px = v ? ref - first.top - 26 : ((ref - r.top) / (innerHeight * 0.3)) * len;
    const fill = len ? Math.min(1, Math.max(0, px / len)) : 0;
    box.style.setProperty('--len', len + 'px');
    box.style.setProperty('--fill', fill);
    steps.forEach((s, i) => s.classList.toggle('is-on', (v ? px : fill * len) >= marks[i] - 1 && r.top < ref));
  };
  let frame = 0;
  let remeasure = false;
  const schedule = (m) => {
    remeasure ||= m;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (remeasure) measure();
      remeasure = false;
      update();
    });
  };
  addEventListener('scroll', () => schedule(false), { passive: true });
  addEventListener('resize', () => schedule(true));
  schedule(true);
});

// Hero slideshow: crossfade every 8 s.
document.querySelectorAll('[data-slides]').forEach((box) => {
  const imgs = [...box.querySelectorAll('img')];
  let i = 0;
  imgs[0]?.classList.add('is-active');
  if (imgs.length < 2) return;
  // The other slides are only fetched once the page has loaded, so they never compete with the first view.
  const loadRest = () =>
    setTimeout(() => {
      for (const im of box.querySelectorAll('img[data-srcset]')) {
        im.srcset = im.dataset.srcset;
        im.src = im.dataset.src;
        im.removeAttribute('data-srcset');
      }
    }, 1500);
  if (document.readyState === 'complete') loadRest();
  else addEventListener('load', loadRest, { once: true });
  setInterval(() => {
    if (document.hidden) return;
    imgs[i].classList.remove('is-active');
    i = (i + 1) % imgs.length;
    imgs[i].classList.add('is-active');
  }, 8000);
});

// Map: swap the placeholder for the Google map when the visitor asks for it.
document.querySelectorAll('[data-map-src]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = btn.dataset.mapSrc;
    frame.title = btn.dataset.mapTitle;
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.allowFullscreen = true;
    btn.replaceWith(frame);
    frame.focus();
  });
});
