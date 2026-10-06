import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/700-italic.css';
import './styles/site.css';

// FormSubmit relays the form as an e-mail to this address (no account needed).
// The very first submission triggers a one-time activation e-mail to this inbox.
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/jesper@jjel.se';

document.documentElement.classList.add('js');

const header = document.querySelector('.site-header');
const toTop = document.querySelector('.totop');
const onScroll = () => {
  const y = window.scrollY;
  header?.classList.toggle('is-scrolled', y > 10);
  toTop?.classList.toggle('is-visible', y > 500);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
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

// Gentle fade-up as sections enter the viewport.
const revealEls = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      }),
    { rootMargin: '0px 0px -8% 0px' },
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-in'));
}

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
    const payload = {
      Namn: d.get('namn'),
      Telefon: d.get('telefon') || '—',
      'E-post': d.get('epost'),
      Ort: d.get('ort') || '—',
      Tjänst: d.get('tjanst') || 'Ej vald',
      Meddelande: d.get('meddelande'),
      Sida: location.pathname.split('/').pop() || 'index.html',
      _subject: `Offertförfrågan via hemsidan — ${d.get('tjanst') || 'allmän'}`,
      _replyto: d.get('epost'),
      _template: 'table',
      _captcha: 'false',
    };

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Skickar…';
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || res.status);
      form.innerHTML = `<div class="form-done" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>
          <h3>Tack för din förfrågan!</h3>
          <p>Vi har tagit emot ditt meddelande och återkommer så snart vi kan.</p>
        </div>`;
    } catch {
      submit.disabled = false;
      submit.textContent = label;
      status.innerHTML =
        'Något gick fel när förfrågan skulle skickas. Försök igen, eller mejla <a href="mailto:jesper@jjel.se">jesper@jjel.se</a> / ring <a href="tel:+46709107507">070-910 75 07</a>.';
      status.classList.add('is-error');
    }
  });
});
