// Mails every new quote request from the jjel.se form to the company inbox.
// Called by a database trigger on public.jjel_leads (see supabase/migrations), authenticated with a
// shared secret header. Sends through Gmail SMTP with an app password; Reply-To is the customer.
import nodemailer from 'npm:nodemailer@6.9.16';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

Deno.serve(async (req) => {
  if (req.method !== 'POST' || req.headers.get('x-hook-secret') !== Deno.env.get('JJEL_HOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  const to = Deno.env.get('LEAD_TO') || 'jesper@jjel.se';
  if (!user || !pass) return new Response('mail not configured', { status: 503 });

  const { record: l } = await req.json();
  if (!l?.email || !l?.name) return new Response('bad request', { status: 400 });

  const rows: [string, string][] = [
    ['Namn', l.name],
    ['Telefon', l.phone || '–'],
    ['E-post', l.email],
    ['Ort', l.city || '–'],
    ['Tjänst', l.service || 'Ej vald'],
    ['Skickad från', l.page ? `jjel.se/${l.page}` : 'jjel.se'],
  ];
  const text = `Ny offertförfrågan via jjel.se\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nMeddelande:\n${l.message}\n\nSvara på det här mejlet för att svara kunden direkt. Förfrågan finns också i admin: https://jjel.se/admin.html#leads`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#1e1e1c">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6a6963">Ny offertförfrågan via jjel.se</p>
  <h2 style="margin:0 0 18px;font-size:22px">${esc(l.name)}${l.service ? ` · ${esc(l.service)}` : ''}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:15px">${rows
    .map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;color:#6a6963;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:7px 0">${esc(v)}</td></tr>`)
    .join('')}</table>
  <div style="margin:18px 0;padding:14px 16px;border-radius:10px;background:#f6f5f2;white-space:pre-wrap;font-size:15px;line-height:1.55">${esc(l.message)}</div>
  <p style="font-size:14px;color:#6a6963">Svara på mejlet för att svara kunden direkt.${l.phone ? ` Eller ring: <a href="tel:${esc(String(l.phone).replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>.` : ''}<br>
  Förfrågan finns också i <a href="https://jjel.se/admin.html#leads">admin under Förfrågningar</a>.</p></div>`;

  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  try {
    await transport.sendMail({
      from: `"JJ El – hemsidan" <${user}>`,
      to,
      replyTo: `"${String(l.name).replace(/"/g, '')}" <${l.email}>`,
      subject: `Ny offertförfrågan: ${l.name}${l.service ? ` – ${l.service}` : ''}`,
      text,
      html,
    });
  } catch (e) {
    console.error('mail failed', e);
    return new Response('mail failed', { status: 502 });
  }
  return Response.json({ ok: true });
});
