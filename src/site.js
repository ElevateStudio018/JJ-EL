import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/700-italic.css';
import './styles/site.css';

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
menuBtn?.addEventListener('click', () => {
  const open = panel.classList.toggle('is-open');
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});
panel?.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    panel.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
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
