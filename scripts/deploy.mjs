#!/usr/bin/env node
// Publishes the built site (dist/) to the web host over SFTP or FTPS.
//
//   npm run deploy:check            show what would happen – changes nothing
//   npm run deploy                  build and upload (asks before changing anything)
//
// Safety rules:
// - Credentials come from environment variables or the git-ignored file .env.deploy – never from the repo.
// - Files that already exist on the server and were not uploaded by this script are never overwritten
//   unless --overwrite-existing is given, and are never deleted.
// - Every server file that is about to be overwritten or deleted is first downloaded to deploy-backups/.
// - Files this script uploaded earlier but that are no longer part of the site are only deleted with --prune.
// - Plain FTP (unencrypted) is refused unless DEPLOY_ALLOW_PLAIN_FTP=1.
//
// Options: --overwrite-existing  --prune  --yes (no question, for CI)  --no-build (use the existing dist/)

import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const MANIFEST = '.deploy-manifest.json';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'check';
const flag = (name) => args.includes(`--${name}`);

if (!['check', 'upload'].includes(command)) fail(`Okänt kommando "${command}". Använd check eller upload.`);
if (existsSync(join(ROOT, '.env.deploy'))) process.loadEnvFile(join(ROOT, '.env.deploy'));

const cfg = {
  protocol: (process.env.DEPLOY_PROTOCOL || '').toLowerCase(),
  host: process.env.DEPLOY_HOST,
  port: Number(process.env.DEPLOY_PORT) || undefined,
  user: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASSWORD,
  path: posix.normalize(process.env.DEPLOY_PATH || '/'),
  fingerprint: process.env.DEPLOY_SFTP_FINGERPRINT,
};

function fail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

function checkConfig() {
  const missing = ['DEPLOY_PROTOCOL', 'DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_PASSWORD', 'DEPLOY_PATH'].filter((k) => !process.env[k]);
  if (missing.length) fail(`Saknar ${missing.join(', ')}. Fyll i .env.deploy (se .env.deploy.example) eller GitHub-secrets.`);
  if (!['sftp', 'ftps', 'ftp'].includes(cfg.protocol)) fail('DEPLOY_PROTOCOL måste vara sftp eller ftps.');
  if (cfg.protocol === 'ftp' && process.env.DEPLOY_ALLOW_PLAIN_FTP !== '1')
    fail('Okrypterad FTP skickar lösenordet i klartext. Be internet.se om SFTP eller FTPS (FTP med TLS).');
}

/* ---------- local files ---------- */

function localFiles() {
  if (!existsSync(DIST)) fail('dist/ saknas – kör utan --no-build.');
  const out = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else {
        const buf = readFileSync(abs);
        out.set(relative(DIST, abs).split('\\').join('/'), { abs, size: buf.length, hash: createHash('sha256').update(buf).digest('hex') });
      }
    }
  };
  walk(DIST);
  return out;
}

/* ---------- remote connections ---------- */

async function connect() {
  if (cfg.protocol === 'sftp') {
    const { default: SftpClient } = await import('ssh2-sftp-client');
    const sftp = new SftpClient();
    let seen = '';
    await sftp.connect({
      host: cfg.host,
      port: cfg.port || 22,
      username: cfg.user,
      password: cfg.password,
      readyTimeout: 30000,
      hostVerifier: (key) => {
        seen = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
        return !cfg.fingerprint || cfg.fingerprint === seen;
      },
    }).catch((e) => {
      if (cfg.fingerprint && seen && seen !== cfg.fingerprint)
        fail(`Serverns nyckel (${seen}) matchar inte DEPLOY_SFTP_FINGERPRINT. Avbryter – kontakta internet.se.`);
      throw e;
    });
    if (!cfg.fingerprint) console.log(`ℹ Serverns SSH-nyckel: ${seen}\n  Spara den som DEPLOY_SFTP_FINGERPRINT så vägrar skriptet ansluta till en annan server.`);
    return {
      async list(dir) {
        return (await sftp.list(dir)).map((e) => ({ name: e.name, dir: e.type === 'd', size: e.size }));
      },
      get: (remote, local) => sftp.fastGet(remote, local),
      put: async (local, remote) => {
        await sftp.mkdir(posix.dirname(remote), true).catch(() => {});
        await sftp.fastPut(local, remote);
      },
      putText: (text, remote) => sftp.put(Buffer.from(text), remote),
      readText: async (remote) => (await sftp.get(remote)).toString('utf8'),
      remove: (remote) => sftp.delete(remote),
      close: () => sftp.end(),
    };
  }

  const ftp = await import('basic-ftp');
  const client = new ftp.Client(60000);
  await client.access({
    host: cfg.host,
    port: cfg.port || 21,
    user: cfg.user,
    password: cfg.password,
    secure: cfg.protocol === 'ftps', // explicit TLS (AUTH TLS); the certificate is verified
    secureOptions: { servername: cfg.host },
  });
  const { Readable, Writable } = await import('node:stream');
  return {
    async list(dir) {
      return (await client.list(dir)).map((e) => ({ name: e.name, dir: e.isDirectory, size: e.size }));
    },
    get: (remote, local) => client.downloadTo(local, remote),
    put: async (local, remote) => {
      await client.ensureDir(posix.dirname(remote));
      await client.uploadFrom(local, remote);
    },
    putText: (text, remote) => client.uploadFrom(Readable.from([Buffer.from(text)]), remote),
    readText: async (remote) => {
      const chunks = [];
      await client.downloadTo(new Writable({ write: (c, _e, cb) => (chunks.push(c), cb()) }), remote);
      return Buffer.concat(chunks).toString('utf8');
    },
    remove: (remote) => client.remove(remote),
    close: () => client.close(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pause between transfers: web hosts block addresses that open many connections in a burst.
const PAUSE = Number(process.env.DEPLOY_DELAY_MS ?? 250);

/** Every directory that holds one of these paths ("assets/x.js" → "assets"). */
const dirsOf = (paths) => new Set([...paths].flatMap((p) => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));

/**
 * Lists the server files that matter: everything at the top level, and the contents of directories that
 * this site uses or uploaded before. Other directories (e.g. an old CMS) are only noted, never opened,
 * so a big foreign tree does not cost hundreds of connections.
 */
async function remoteFiles(conn, top, wanted) {
  const files = new Map();
  const foreignDirs = [];
  const walk = async (rel, entries) => {
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!e.dir) files.set(r, { size: e.size });
      else if (wanted.has(r)) {
        await sleep(PAUSE);
        await walk(r, await conn.list(posix.join(cfg.path, r)));
      } else foreignDirs.push(`${r}/`);
    }
  };
  await walk('', top);
  return { files, foreignDirs };
}

/* ---------- plan ---------- */

function makePlan(local, remote, manifest, foreignDirs) {
  const plan = { new: [], update: [], unchanged: [], conflict: [], obsolete: [], foreign: [], foreignDirs };
  for (const [rel, f] of local) {
    const r = remote.get(rel);
    if (!r) plan.new.push(rel);
    else if (!(rel in manifest)) plan.conflict.push(rel);
    else if (manifest[rel] === f.hash && r.size === f.size) plan.unchanged.push(rel);
    else plan.update.push(rel);
  }
  for (const rel of remote.keys()) {
    if (rel === MANIFEST || local.has(rel)) continue;
    (rel in manifest ? plan.obsolete : plan.foreign).push(rel);
  }
  return plan;
}

function printPlan(plan) {
  const show = (title, list, note = '') => {
    console.log(`\n${title}: ${list.length}${note}`);
    list.slice(0, 25).forEach((f) => console.log(`   ${f}`));
    if (list.length > 25) console.log(`   … och ${list.length - 25} till`);
  };
  console.log('\n──────── Plan ────────');
  show('Nya filer som laddas upp', plan.new);
  show('Våra filer som uppdateras', plan.update);
  console.log(`\nOförändrade (hoppas över): ${plan.unchanged.length}`);
  show('⚠ BEFINTLIGA filer på servern som skulle skrivas över', plan.conflict, plan.conflict.length ? '  (kräver --overwrite-existing, säkerhetskopieras först)' : '');
  show('Tidigare uppladdade filer som inte längre används', plan.obsolete, plan.obsolete.length ? (flag('prune') ? '  (raderas, säkerhetskopieras först)' : '  (lämnas kvar – använd --prune för att radera)') : '');
  show('Andra filer på servern (rörs aldrig)', plan.foreign);
  show('Andra mappar på servern (öppnas och rörs aldrig)', plan.foreignDirs);
  console.log('──────────────────────');
}

/* ---------- main ---------- */

checkConfig();

if (!flag('no-build')) {
  console.log('▸ Hämtar senaste innehållet från admin och bygger sajten…');
  execSync('node scripts/pull-content.mjs', { cwd: ROOT, stdio: 'inherit' });
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}
const local = localFiles();
console.log(`▸ ${local.size} filer i dist/. Ansluter till ${cfg.protocol.toUpperCase()} ${cfg.host}, mapp ${cfg.path} …`);

let conn = await connect().catch((e) => fail(`Kunde inte ansluta: ${e.message}`));

/**
 * Runs one server operation; if the connection drops or a data connection times out (some web hosts
 * refuse a connection now and then), it reconnects after a pause and tries again, up to 5 times.
 */
async function op(fn, what) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(conn);
    } catch (e) {
      if (attempt >= 5) throw e;
      const wait = Number(process.env.DEPLOY_RETRY_MS ?? 15000) * attempt;
      console.log(`  ⟳ ${what}: ${e.message} – ansluter igen om ${wait / 1000} s (försök ${attempt + 1}/5)`);
      await Promise.resolve(conn.close()).catch(() => {});
      await sleep(wait);
      conn = await connect().catch((err) => {
        console.log(`  ⟳ kunde inte ansluta: ${err.message}`);
        return conn;
      });
    }
  }
}
process.on('uncaughtException', (e) => fail(`Anslutningen bröts: ${e.message}. Inget mer har ändrats – kör igen om en stund.`));
try {
  const top = await op((c) => c.list(cfg.path), 'lista webbroten');
  let manifest = {};
  if (top.some((e) => e.name === MANIFEST && !e.dir)) {
    try {
      manifest = JSON.parse(await op((c) => c.readText(posix.join(cfg.path, MANIFEST)), 'läsa manifestet')).files || {};
    } catch {
      fail(`${MANIFEST} på servern går inte att läsa. Avbryter för säkerhets skull.`);
    }
  }
  const { files: remote, foreignDirs } = await remoteFiles({ list: (d) => op((c) => c.list(d), `lista ${d}`) }, top, dirsOf([...local.keys(), ...Object.keys(manifest)]));
  const plan = makePlan(local, remote, manifest, foreignDirs);
  printPlan(plan);

  if (command === 'check') {
    console.log('\nInget har ändrats (check). Kör "npm run deploy" för att publicera.\n');
    process.exit(0);
  }

  if (plan.conflict.length && !flag('overwrite-existing'))
    fail(`${plan.conflict.length} befintliga filer på servern skulle skrivas över (se listan ovan).\n  Granska dem och kör igen med --overwrite-existing om det är rätt. De säkerhetskopieras automatiskt.`, 2);

  const toUpload = [...plan.new, ...plan.update, ...plan.conflict];
  const toDelete = flag('prune') ? plan.obsolete : [];
  if (!toUpload.length && !toDelete.length) {
    console.log('\nServern är redan uppdaterad. Inget att göra.\n');
    process.exit(0);
  }

  if (!flag('yes')) {
    if (!process.stdin.isTTY) fail('Ingen terminal att fråga i – lägg till --yes om planen ovan är godkänd.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nLadda upp ${toUpload.length} filer${toDelete.length ? ` och radera ${toDelete.length}` : ''}? Skriv "ja" för att fortsätta: `);
    rl.close();
    if (answer.trim().toLowerCase() !== 'ja') fail('Avbrutet. Inget har ändrats.', 0);
  }

  // Back up every server file we are about to overwrite or delete.
  const risky = [...plan.update, ...plan.conflict, ...toDelete].filter((rel) => remote.has(rel));
  const backupDir = join(ROOT, 'deploy-backups', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  for (const rel of risky) {
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    await sleep(PAUSE);
    await op((c) => c.get(posix.join(cfg.path, rel), dest), `säkerhetskopiera ${rel}`);
  }
  if (risky.length) console.log(`\n▸ Säkerhetskopierade ${risky.length} filer till ${relative(ROOT, backupDir)}/`);

  // Assets first and pages last, so no page ever points at a file that is not there yet.
  const isPage = (rel) => rel.endsWith('.html') || rel === '.htaccess';
  const order = [...toUpload.filter((r) => !isPage(r)), ...toUpload.filter(isPage)];
  // Before uploading, every file in the plan is claimed as "pending", so an interrupted run can simply be
  // started again: those files count as ours (already backed up) and are uploaded again, never skipped.
  const saveManifest = (files) =>
    op((c) => c.putText(JSON.stringify({ deployedAt: new Date().toISOString(), files }, null, 1), posix.join(cfg.path, MANIFEST)), 'spara manifestet');
  const uploaded = { ...manifest };
  for (const rel of order) uploaded[rel] = 'pending';
  if (order.length) await saveManifest(uploaded);
  let n = 0;
  for (const rel of order) {
    await sleep(PAUSE);
    await op((c) => c.put(local.get(rel).abs, posix.join(cfg.path, rel)), `ladda upp ${rel}`);
    uploaded[rel] = local.get(rel).hash;
    n++;
    if (n % 50 === 0) await saveManifest(uploaded);
    if (process.stdout.isTTY) process.stdout.write(`\r▸ Laddar upp ${n}/${order.length}`);
    else console.log(`  ↑ ${rel}`);
  }
  if (order.length && process.stdout.isTTY) process.stdout.write('\n');

  const files = Object.fromEntries([...local].map(([rel, f]) => [rel, f.hash]));
  for (const rel of plan.obsolete) if (!toDelete.includes(rel)) files[rel] = manifest[rel];
  await saveManifest(files);

  for (const rel of toDelete) await op((c) => c.remove(posix.join(cfg.path, rel)), `radera ${rel}`);
  if (toDelete.length) console.log(`▸ Raderade ${toDelete.length} gamla filer.`);

  console.log(`\n✔ Klart: ${order.length} filer uppladdade${toDelete.length ? `, ${toDelete.length} raderade` : ''}.\n`);
} catch (e) {
  fail(`FTP-fel: ${e.message}. Kör "npm run deploy:check" igen om en stund – det som redan laddats upp är oskadat.`);
} finally {
  await conn.close();
}
