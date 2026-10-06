# JJ El & Entreprenad AB — webbplats

Webbplats för JJ El & Entreprenad AB, ett elföretag i Ytterby verksamt i hela Västra Götaland.

```bash
npm install
npm run dev      # utveckling
npm run build    # produktion → dist/
npm run preview  # förhandsgranska bygget
```

## Struktur

| Fil | Innehåll |
| --- | --- |
| `index.html` | Startsidan — hero, omdömen i siffror, tjänster, om oss, kundröster, CTA |
| `tjanster.html` | Tjänstesida — elinstallationer, elservice, smarta hem, laddbox, data & nät, styr-/reglerteknik |
| `omdomen.html` | Alla Reco- och Google-omdömen |
| `process.html` | "Så går det till" — arbetsprocessen i sex steg |
| `om-oss.html` | Företagsbeskrivning, fokusområden, verksamhetsområde |
| `kontakt.html` | Kontaktvägar och adress |
| `src/data/images.js` | Pexels foto-ID:n |
| `src/lib/*` | Smooth scroll (Lenis + GSAP), reveals, header, meny, offertformulär |
| `src/styles/*` | Designsystem (tokens, typografi, knappar) och sektionsstilar |

## Designsystem

- **Typografi:** Geist Variable + Geist Mono (självhostade via Fontsource).
- **Färger:** `#F7F7F5` off-white · `#12161C` nästan svart · accent `#E8A930` (amber, används sparsamt).
- **Grid:** 12 kolumner, max 1560 px, sidomarginal `clamp(20px, 5.4vw, 88px)`.
- **Rörelse:** `cubic-bezier(0.22, 1, 0.36, 1)`; UI 0.5–1.1 s; scroll-reveals via GSAP ScrollTrigger.

## Tillgänglighet

Semantisk HTML, tangentbordsnavigering, fokusfälla i dialoger (offertformulär), alt-texter,
`prefers-reduced-motion` stänger av rörelse.

## Bilder

Alla fotografier kommer från [Pexels](https://www.pexels.com) och används under
[Pexels-licensen](https://www.pexels.com/license/) (fri kommersiell användning, ingen attribution krävs).
Bilderna hämtas responsivt från Pexels CDN (`srcset` genereras av ett litet Vite-plugin i `vite.config.js`)
och färggraderas enhetligt i CSS (`.ph`). Foto-ID:n finns samlade i `src/data/images.js`.

## Innehåll

Företagsinformation, tjänstelista och kundomdömen är hämtade från underlag som tillhandahållits
av JJ El & Entreprenad AB (inklusive publika Reco- och Google-recensioner). Inga siffror om
omsättning, personalstyrka eller liknande har uppskattats eller hittats på — de hålls medvetet
utanför webbplatsen tills verifierade uppgifter finns.
