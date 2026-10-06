import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/vh.css';

import { initSmoothScroll, ScrollTrigger } from './lib/scroll.js';
import { heroIntro, scrollMotion, counters } from './lib/motion.js';
import { initHeader } from './lib/header.js';
import { initMenu, initDrawer, initCursor } from './lib/ui.js';

document.documentElement.classList.add('js');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

initSmoothScroll();
heroIntro();
scrollMotion();
counters();
initHeader();
initMenu();
initDrawer();
initCursor();

// Fonts and late images shift layout — keep every trigger accurate.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());
