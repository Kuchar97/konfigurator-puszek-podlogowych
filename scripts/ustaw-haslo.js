// Nowe hasło konta – gdy nie da się zalogować (np. zapomniane hasło administratora).
// Uruchom w folderze projektu:  node scripts/ustaw-haslo.js [e-mail]
// Hasło wpisujesz sam (nie jest widoczne na ekranie); wszystkie sesje tego konta zostają wylogowane.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const KONTA = path.join(DATA, 'konta.json'), SESJE = path.join(DATA, 'sesje.json');
const hashuj = h => { const sol = crypto.randomBytes(16).toString('hex'); return `${sol}:${crypto.scryptSync(h, sol, 64).toString('hex')}`; };

// pytanie z ukrytym wpisywaniem (gwiazdki)
function pytaj(pytanie, ukryj) {
  return new Promise(ok => {
    process.stdout.write(pytanie);
    const wejscie = process.stdin;
    let tekst = '';
    if (ukryj && wejscie.isTTY) wejscie.setRawMode(true);
    wejscie.resume(); wejscie.setEncoding('utf8');
    const naZnak = z => {
      for (const c of z) {
        if (c === '\r' || c === '\n') { wejscie.removeListener('data', naZnak); if (ukryj && wejscie.isTTY) wejscie.setRawMode(false); wejscie.pause(); process.stdout.write('\n'); return ok(tekst); }
        if (c === '\u0003') { process.stdout.write('\nPrzerwano.\n'); process.exit(1); }
        if (c === '\u007f' || c === '\b') { if (tekst) { tekst = tekst.slice(0, -1); if (ukryj) process.stdout.write('\b \b'); } continue; }
        tekst += c; if (ukryj) process.stdout.write('*');
      }
    };
    if (!ukryj) { wejscie.once('data', z => { wejscie.pause(); ok(String(z).trim()); }); return; }
    wejscie.on('data', naZnak);
  });
}

(async () => {
  const konta = JSON.parse(fs.readFileSync(KONTA, 'utf8'));
  const email = String(process.argv[2] || await pytaj('E-mail konta: ')).trim().toLowerCase();
  const k = konta[email];
  if (!k) { console.log(`Nie ma konta ${email}. Konta: ${Object.keys(konta).join(', ')}`); process.exit(1); }
  const h1 = await pytaj('Nowe hasło (min. 8 znaków): ', true);
  if (h1.length < 8) { console.log('Hasło musi mieć co najmniej 8 znaków.'); process.exit(1); }
  const h2 = await pytaj('Powtórz hasło: ', true);
  if (h1 !== h2) { console.log('Hasła się różnią – nic nie zmieniono.'); process.exit(1); }
  fs.copyFileSync(KONTA, KONTA + '.przed-zmiana-hasla');
  k.haslo = hashuj(h1);
  if (k.status === 'zablokowane') console.log('Uwaga: konto ma status „zablokowane” – odblokuj je w zakładce Konta.');
  fs.writeFileSync(KONTA, JSON.stringify(konta, null, 1));
  try {
    const s = JSON.parse(fs.readFileSync(SESJE, 'utf8'));
    for (const [t, v] of Object.entries(s)) if (v.login === email) delete s[t];
    fs.writeFileSync(SESJE, JSON.stringify(s, null, 1));
  } catch { /* brak sesji */ }
  console.log(`Gotowe – ustawiono nowe hasło dla ${email}. Zaloguj się nim w przeglądarce.`);
  process.exit(0);
})();
