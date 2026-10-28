// Copies the content saved in the admin panel (Supabase) into content/site.json.
// Prints changed=true|false for GitHub Actions; exits non-zero only on a broken response.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPABASE_URL, SUPABASE_KEY, CONTENT_TABLE } from '../src/cms/supabase-config.js';

const file = resolve(import.meta.dirname, '../content/site.json');

const res = await fetch(`${SUPABASE_URL}/rest/v1/${CONTENT_TABLE}?id=eq.1&select=data`, {
  headers: { apikey: SUPABASE_KEY },
});
if (!res.ok) throw new Error(`Supabase svarade ${res.status}: ${await res.text()}`);
const [row] = await res.json();
if (!row?.data?.company || !Array.isArray(row.data.reviews)) throw new Error('Oväntat innehåll från Supabase');

const next = `${JSON.stringify(row.data, null, 2)}\n`;
const changed = next !== readFileSync(file, 'utf8');
if (changed) writeFileSync(file, next);

console.log(`changed=${changed}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
