# Målmiljöspec – jjel.se (JJ El & Entreprenad AB)

Vad hostingleverantören behöver erbjuda för att köra webbplatsen.

## 1. Typ av sajt

- **Helt statisk webbplats.** HTML, CSS, JavaScript och bilder, byggda i förväg med Vite.
- **Ingen serverkod.** Ingen PHP, Node, Python eller databas behövs i drift.
- **Inget CMS.** WordPress eller liknande krävs inte.
- **Det som publiceras** är innehållet i mappen `dist/` efter `npm run build`:
  - 15 HTML-sidor
  - `assets/` med en CSS- och en JS-fil samt typsnitt (woff2)
  - `images/` med jobbilder och märket Årets Elföretag
  - logotyp, favicon, `robots.txt` och `sitemap.xml`
- **Storlek:** cirka 10 MB i dag. Den växer med fler jobbilder.

## 2. Krav på hostingen (måste)

| Krav | Detalj |
|---|---|
| Statisk filserver | Kan servera filer som de är, t.ex. Apache, Nginx, LiteSpeed eller en statisk-hosting-tjänst. |
| Egen domän | `jjel.se` och `www.jjel.se`. Möjlighet att peka DNS (A/AAAA eller CNAME) eller att flytta domänen. |
| HTTPS | Gratis certifikat, t.ex. Let's Encrypt, med automatisk förnyelse. |
| Omdirigeringar | http → https och `www` → huvuddomänen (eller tvärtom), med 301. |
| Uppladdning | SFTP/FTP, eller helst deploy från Git/GitHub (se punkt 4). |
| Utrymme | ≥ 1 GB, så att det finns marginal för bilder. |
| Trafik | Normal småföretagstrafik. 10–50 GB/månad räcker gott. |
| MIME-typer | `.woff2` → `font/woff2`, `.svg` → `image/svg+xml`, `.webp`/`.jpg`/`.png` korrekt. |
| Index | `index.html` som startsida i rotkatalogen. |

**Krävs inte:** PHP, databas, Node.js-runtime, e-postserver för formuläret (se punkt 5), SSH.

## 3. Rekommenderat (bör)

- **Komprimering:** gzip eller Brotli för HTML, CSS, JS och SVG.
- **Cache-headers:**
  - `assets/*` har hash i filnamnet. Sätt `Cache-Control: public, max-age=31536000, immutable`.
  - `*.html`: `Cache-Control: no-cache` eller kort max-age, så att ändringar syns direkt.
  - `images/*`: t.ex. 30 dagar.
- **HTTP/2 eller HTTP/3.**
- **Egen 404-sida.** En enkel `404.html` kan läggas till.
- **Säkerhetsheaders:** `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` och `Referrer-Policy: strict-origin-when-cross-origin`.
  - Lägger man en Content-Security-Policy måste den tillåta tredjepartstjänsterna i punkt 5.
- **Serverplacering i EU/Sverige** (GDPR, svarstider).
- **Automatisk backup.** Är inte kritiskt, eftersom källkoden ligger i Git.

## 4. Driftsättning

- **Bygge:** Node.js 20+ (testat med 22) på utvecklarens dator eller i CI.
  - Kör `npm ci && npm run build`. Resultatet hamnar i `dist/`.
- **Publicering**, något av följande:
  - **a) Statisk-hosting med Git-koppling** (t.ex. Netlify, Cloudflare Pages, Vercel eller GitHub Pages).
    - Byggkommando: `npm run build`
    - Publiceringsmapp: `dist`
    - Node-version: 22
  - **b) Traditionellt webbhotell** (t.ex. Loopia, One.com eller Binero).
    - Ladda upp innehållet i `dist/` till webbroten (`public_html`/`htdocs`) via SFTP.
- **Länkar:** sajten använder relativa länkar (`base: './'`), så den fungerar både i domänroten och i en undermapp.

## 5. Externa tjänster som sajten använder

Inga av dessa körs hos hostingen. De måste bara vara nåbara från besökarens webbläsare. Integritetspolicyn och cookiesidan beskriver dem redan.

| Tjänst | Används till | Domän |
|---|---|---|
| FormSubmit | Offertformuläret skickas som e-post till jesper@jjel.se, utan egen server. | `formsubmit.co` |
| Google Maps (inbäddad karta) | Kartan med adressen | `www.google.com` |
| Pexels | Stockbilder i vissa sektioner och i bildspelet | `images.pexels.com` |
| Reco, Instagram, elevatestudio.nu | Vanliga länkar, ingen inbäddning | – |

**FormSubmit:** första gången formuläret skickas från den nya domänen får jesper@jjel.se ett aktiveringsmejl. Det måste bekräftas en gång.

## 6. E-post

- Sajten kräver **ingen** e-posttjänst.
- Om domänen flyttas måste befintliga MX-poster för `jjel.se` (Jespers e-post) **behållas oförändrade**. Annars slutar e-posten och formulärmejlen att komma fram.

## 7. Att göra vid byte till riktig domän

Följande pekar i dag på GitHub Pages-adressen och ska bytas till `https://jjel.se/` vid lansering:

- `public/sitemap.xml` och `public/robots.txt`. De pekar fortfarande på `elevatestudio018.github.io/lir/`.
- `og:image`-adresserna för bilddelning i sociala medier.

Övrigt:

- Lägg till sajten i Google Search Console och skicka in sitemap.
- Valfritt: lägg Pexels-bilderna lokalt i `images/`, så att sajten inte är beroende av Pexels CDN.

## 8. Sammanfattning för leverantören

> Statisk webbplats, cirka 10 MB, inga serverkrav utöver att servera filer över HTTPS på egen domän (jjel.se) med 301 http→https/www-omdirigering. Gzip/Brotli och långa cache-headers för `/assets/` önskas. Ingen PHP, databas eller e-post krävs. Befintliga MX-poster för jjel.se ska lämnas orörda.
