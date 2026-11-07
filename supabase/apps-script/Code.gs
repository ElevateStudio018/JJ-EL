// JJ El – skickar offertförfrågningar från jjel.se till Jespers mejl.
// Körs i Google-kontot elevate.studio018@gmail.com, så mejlet skickas av Google precis som från Gmail.
const SECRET = '<samma värde som GAS_SECRET i Supabase>'; // fylls i i Apps Script, inte i git
const TO = 'jesper@jjel.se';

function doPost(e) {
  const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (d.secret !== SECRET) return ContentService.createTextOutput('forbidden');
  GmailApp.sendEmail(TO, d.subject, d.text, { htmlBody: d.html, name: 'JJ El – hemsidan', replyTo: d.replyTo });
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
