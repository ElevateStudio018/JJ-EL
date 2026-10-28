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
| `admin.html`, `src/admin/*` | Admin-panelen (Supabase-inloggning) |
| `content/site.json` | Innehållet från admin (synkas från Supabase, redigera inte för hand) |
| `scripts/pull-content.mjs` | Hämtar innehållet från Supabase vid bygget |
| `src/cms/render.js` | Fyller i innehållet i sidorna vid bygget |
| `src/data/images.js` | Pexels foto-ID:n |
| `src/lib/*` | Smooth scroll (Lenis + GSAP), reveals, header, meny, offertformulär |
| `src/styles/*` | Designsystem (tokens, typografi, knappar) och sektionsstilar |

## Admin-panel (redigera innehåll)

Kontaktuppgifter, betyg, hero-texten, omdömen och jobbgallerierna redigeras på **`/admin.html`**
(inloggning med e-post och lösenord). Behöriga adresser står i Supabase-tabellen `private.jjel_admins`.

- **Lagring:** Supabase-projektet *vastkust-bygg* (delas med den sajten; JJ El:s delar heter `jjel_*`):
  tabellen `public.jjel_content` (en rad med allt innehåll) och bucketen `jjel-images` för uppladdade bilder.
  Skrivning skyddas av RLS – bara inloggade konton som finns i `private.jjel_admins`.
- **Publicering:** GitHub Actions (`.github/workflows/deploy.yml`) kör var 5:e minut,
  hämtar innehållet med `scripts/pull-content.mjs` till `content/site.json`, committar ändringen
  och bygger om sajten. Supabase är alltså källan – ändringar direkt i `content/site.json` skrivs över.
- **Bygget:** `src/cms/render.js` fyller i `{{phone}}`, `{{email}}`, `{{reco}}` m.fl. och
  `<!--cms:reviews-->`-markörer i HTML-filerna. Övrig text redigeras fortfarande direkt i HTML.
- **Ny admin:** skapa användaren i Supabase (Authentication → Add user) och lägg till adressen:
  `insert into private.jjel_admins (email) values ('namn@exempel.se');`

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
