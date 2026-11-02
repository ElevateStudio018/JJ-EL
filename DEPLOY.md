# Publicera jjel.se på webbhotellet (internet.se)

Sajten är **helt statisk** efter bygget (Vite → `dist/`). Den behöver ingen PHP, databas eller Node
på servern – bara att filerna serveras över HTTPS. Uppladdningen görs med `scripts/deploy.mjs`
över **SFTP** (helst) eller **FTPS** (FTP med TLS). Okrypterad FTP vägras.

## Vad som laddas upp

`npm run build` skapar `dist/`, som laddas upp till webbroten:

| Fil/mapp | Innehåll |
| --- | --- |
| `*.html` | 15 sidor + `admin.html` (admin-panelen, `noindex`) |
| `assets/` | CSS, JavaScript och typsnitt (filnamn med hash – cachas länge) |
| `images/`, logotyp, favicon | Bilder |
| `sitemap.xml`, `robots.txt` | Genereras för `https://jjel.se/` (ändra med `SITE_URL=` vid bygget) |
| `web.config` | För **IIS (Windows)** – jjel.se körs på IIS idag: `index.html` som startsida, MIME-typer, cache, säkerhetsheaders. Ger sajten 500-fel? Ta bort filen och kontakta internet.se |
| `.htaccess` | Samma sak för Apache/LiteSpeed (ignoreras av IIS). HTTPS-omdirigering finns men är avstängd |
| `.deploy-manifest.json` | Skrivs av deploy-skriptet: vilka filer vi har laddat upp (blockeras för besökare i `.htaccess`) |

Alla länkar är relativa och kontrollerade, så sajten fungerar direkt på `jjel.se/` (och i en undermapp).

## Funktioner som går via externa tjänster

Inget av detta körs på webbhotellet – besökarens webbläsare pratar direkt med tjänsterna:

- **Offertformuläret** → FormSubmit (`formsubmit.co`) mejlar till adressen som står i admin.
  Första förfrågan från den nya domänen kan ge ett aktiveringsmejl till den adressen som måste bekräftas en gång.
- **Admin-panelen och direktuppdatering av innehåll** → Supabase. Fungerar på vilken domän som helst.
- **Kartan** (Google Maps) och bilder från Pexels – vanliga inbäddningar.

## Säkerhetsregler i skriptet

- Inloggningsuppgifterna läses från `.env.deploy` (ignoreras av git) eller GitHub-secrets – aldrig från koden.
- **Befintliga filer** på servern som skriptet inte själv har laddat upp skrivs **aldrig** över utan
  `--overwrite-existing`, och raderas aldrig.
- Varje fil som ska skrivas över eller raderas **laddas först ned** till `deploy-backups/<datum>/`
  (i GitHub: sparas som artefakt i 90 dagar).
- Filer som vi laddat upp tidigare men som inte längre finns i sajten raderas bara med `--prune`.
- `check` ändrar ingenting. `upload` visar planen och frågar innan något ändras.
- SFTP: serverns nyckel kan låsas med `DEPLOY_SFTP_FINGERPRINT`. FTPS: certifikatet verifieras.
- Bilder och CSS/JS laddas upp före HTML-sidorna, så ingen sida pekar på en fil som inte finns än.

## Första publiceringen

1. Kopiera `.env.deploy.example` till `.env.deploy` och fyll i uppgifterna från internet.se.
2. `npm ci`
3. `npm run deploy:check` – visar vad som skulle laddas upp och **vilka befintliga filer** som
   ligger på servern. Ingenting ändras. Spara fingeravtrycket som skrivs ut (SFTP) i `.env.deploy`.
4. Gå igenom listan "BEFINTLIGA filer … som skulle skrivas över" (t.ex. en gammal `index.html`).
5. `npm run deploy -- --overwrite-existing` när listan är godkänd. Övriga gamla filer lämnas orörda.
6. Öppna sajten. Visar den *500 – Internal Server Error* har webbhotellet låst någon inställning i `web.config`: ta bort den filen på servern och fråga internet.se.
7. Be internet.se peka `jjel.se`/`www.jjel.se` mot mappen och aktivera SSL. **Behåll MX-posterna** (e-posten).
8. HTTPS-omdirigeringen ordnar internet.se i IIS (på Apache: ta bort `#` framför HTTPS-blocket i `public/.htaccess`).
9. Den ofärdiga WordPress-installationen som ligger på jjel.se idag (`wp-admin/setup-config.php`) ska tas bort – den kan annars kapas. Skriptet raderar aldrig främmande filer, så det görs av internet.se eller efter uttryckligt beslut.

## Uppdatera i framtiden – ett kommando

Innehåll (telefon, omdömen, bilder …) ändras i `https://jjel.se/admin.html` och syns direkt, utan publicering.
För ändringar i koden/designen:

- **Från GitHub (rekommenderas):** Actions → **Publicera till jjel.se** → *Run workflow* → välj `upload`.
  Eller i terminalen: `gh workflow run deploy-jjel.yml -f action=upload`
- **Från en dator:** `npm run deploy`

### Engångsinställning i GitHub

*Settings → Secrets and variables → Actions*:

| Typ | Namn | Värde |
| --- | --- | --- |
| Secret | `DEPLOY_HOST` | serverns adress |
| Secret | `DEPLOY_USER` | användarnamn |
| Secret | `DEPLOY_PASSWORD` | lösenord |
| Variable | `DEPLOY_PROTOCOL` | `sftp` eller `ftps` |
| Variable | `DEPLOY_PATH` | webbroten, t.ex. `/public_html` |
| Variable | `DEPLOY_PORT` | tom = standard |
| Variable | `DEPLOY_SFTP_FINGERPRINT` | från `deploy:check` (SFTP) |

Vill ni att någon måste godkänna varje publicering: *Settings → Environments → jjel-production →
Required reviewers*.
