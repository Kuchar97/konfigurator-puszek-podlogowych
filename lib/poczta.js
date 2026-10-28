// Wysyłka e-maili. Z konfiguracją SMTP (Dane → Poczta) – przez nodemailer;
// bez niej wiadomości trafiają do skrzynki testowej data/poczta/ (podgląd w panelu Dane).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const USTAWIENIA = path.join(__dirname, '..', 'data', 'ustawienia.json');
const SKRZYNKA = path.join(__dirname, '..', 'data', 'poczta');

const ustawienia = () => { try { return JSON.parse(fs.readFileSync(USTAWIENIA, 'utf8')); } catch { return {}; } };
const smtp = () => ustawienia().smtp || null;

function zapiszSmtp(dane) {
  const u = ustawienia();
  if (!dane) delete u.smtp;
  else {
    const stare = u.smtp || {};
    u.smtp = {
      host: String(dane.host || '').trim(), port: Number(dane.port) || 587, secure: !!dane.secure,
      user: String(dane.user || '').trim(),
      pass: dane.pass ? String(dane.pass) : stare.pass || '', // puste pole = bez zmiany hasła
      nadawca: String(dane.nadawca || '').trim()
    };
    if (!u.smtp.host) throw Object.assign(new Error('Podaj adres serwera SMTP.'), { status: 400 });
  }
  fs.writeFileSync(USTAWIENIA, JSON.stringify(u, null, 1));
}

function statusPoczty() {
  const s = smtp();
  return { skonfigurowana: !!s, host: s ? s.host : null, port: s ? s.port : null, secure: s ? s.secure : false, user: s ? s.user : null, nadawca: s ? s.nadawca : null, maHaslo: !!(s && s.pass) };
}

async function wyslij({ do: odbiorca, temat, tekst, html }) {
  const s = smtp();
  if (s) {
    const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: s.user ? { user: s.user, pass: s.pass } : undefined });
    await t.sendMail({ from: s.nadawca || s.user, to: odbiorca, subject: temat, text: tekst, html });
    return { tryb: 'smtp' };
  }
  fs.mkdirSync(SKRZYNKA, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(path.join(SKRZYNKA, id + '.json'), JSON.stringify({ id, data: new Date().toISOString(), do: odbiorca, temat, tekst, html }, null, 1));
  return { tryb: 'skrzynka-testowa' };
}

function skrzynkaTestowa() {
  try {
    return fs.readdirSync(SKRZYNKA).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 50)
      .map(f => JSON.parse(fs.readFileSync(path.join(SKRZYNKA, f), 'utf8')));
  } catch { return []; }
}
function wyczyscSkrzynke() { fs.rmSync(SKRZYNKA, { recursive: true, force: true }); }

// Szablon wiadomości w stylu konfiguratora
function szablon(tytul, akapity, przycisk) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#2447d8;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:700">Konfigurator puszek podłogowych · Kontakt-Simon</div>
  <div style="border:1px solid #e3e7ee;border-top:0;border-radius:0 0 10px 10px;padding:20px">
    <h2 style="margin:0 0 12px;font-size:18px">${esc(tytul)}</h2>
    ${akapity.map(a => `<p style="margin:0 0 12px;line-height:1.5">${esc(a)}</p>`).join('')}
    ${przycisk ? `<p style="margin:18px 0"><a href="${esc(przycisk.url)}" style="background:#2447d8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(przycisk.tekst)}</a></p>
    <p style="font-size:12px;color:#6b7280;margin:0">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br>${esc(przycisk.url)}</p>` : ''}
  </div></div>`;
  const tekst = [tytul, '', ...akapity, ...(przycisk ? ['', `${przycisk.tekst}: ${przycisk.url}`] : [])].join('\n');
  return { html, tekst };
}

module.exports = { wyslij, szablon, statusPoczty, zapiszSmtp, skrzynkaTestowa, wyczyscSkrzynke };
