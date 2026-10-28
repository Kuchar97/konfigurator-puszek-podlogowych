// Konta użytkowników, sesje, zapisane wyceny i powiadomienia (pliki JSON w data/)
// Wszystkie konta są takie same – wyjątkiem jest pierwsze, które zostaje administratorem (Dane, Konta, Uwagi)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const plik = n => path.join(DATA, n);
const czytaj = (n, dom) => { try { return JSON.parse(fs.readFileSync(plik(n), 'utf8')); } catch { return dom; } };
const zapisz = (n, obj) => fs.writeFileSync(plik(n), JSON.stringify(obj, null, 1));

// ---------- Słowniki ----------
const ROLE = { admin: 'Administrator', uzytkownik: 'Użytkownik' };
const rolaKonta = k => (k && k.rola === 'admin' ? 'admin' : 'uzytkownik');

function blad(tekst, status = 400) { const e = new Error(tekst); e.status = status; return e; }
const tekst = (v, max = 200) => String(v || '').trim().slice(0, max);

// ---------- Hasła ----------
function hashuj(haslo) {
  const sol = crypto.randomBytes(16).toString('hex');
  return `${sol}:${crypto.scryptSync(haslo, sol, 64).toString('hex')}`;
}
function sprawdzHaslo(haslo, zapis) {
  const [sol, hash] = String(zapis).split(':');
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(haslo, sol, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Konta ----------
// Identyfikatorem konta jest e-mail (małe litery), zapisany jako `login`
const konta = () => czytaj('konta.json', {});
const zapiszKonta = k => zapisz('konta.json', k);
const normEmail = e => String(e || '').trim().toLowerCase();

// Nazwa do wyświetlania: imię (i firma), a gdy ich brak – e-mail
function nazwaKonta(k) {
  if (!k) return '—';
  if (k.imie && k.firma) return `${k.imie} (${k.firma})`;
  return k.imie || k.firma || k.login;
}

const publiczne = k => k && ({
  login: k.login, email: k.login, rola: rolaKonta(k), rolaNazwa: ROLE[rolaKonta(k)], status: k.status, nazwa: nazwaKonta(k),
  imie: k.imie || '', firma: k.firma || '', telefon: k.telefon || '', utworzono: k.utworzono,
  emailPotwierdzony: k.emailPotwierdzony !== false
});

// opcje.bezMaila – poczta nie jest skonfigurowana: zamiast linku w mailu każde nowe konto akceptuje administrator
function rejestruj(d, opcje = {}) {
  const k = konta();
  const pierwsze = Object.keys(k).length === 0;
  const email = normEmail(d.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw blad('Podaj poprawny adres e-mail.');
  if (k[email]) throw blad('Konto z tym adresem e-mail już istnieje.');
  if (String(d.haslo || '').length < 8) throw blad('Hasło musi mieć co najmniej 8 znaków.');

  const konto = {
    login: email, haslo: hashuj(d.haslo), rola: pierwsze ? 'admin' : 'uzytkownik', status: 'aktywne', utworzono: new Date().toISOString(),
    imie: tekst(d.imie), firma: tekst(d.firma), telefon: tekst(d.telefon, 30)
  };

  // Adres e-mail trzeba potwierdzić linkiem z wiadomości (poza pierwszym kontem – administratorem).
  // Bez poczty: konto od razu czeka na akceptację administratora.
  let token = null;
  if (pierwsze) konto.emailPotwierdzony = true;
  else if (opcje.bezMaila) { konto.emailPotwierdzony = true; konto.weryfikacja = 'administrator'; konto.status = 'oczekuje'; }
  else { konto.emailPotwierdzony = false; token = ustawToken(konto); }

  k[email] = konto;
  zapiszKonta(k);
  if (konto.status === 'oczekuje') prosbaOAkceptacje(konto);
  return { konto: publiczne(konto), pierwsze, token, akceptacja: !pierwsze && !!opcje.bezMaila };
}

// ---------- Potwierdzanie adresu e-mail ----------
const hashTokenu = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function ustawToken(konto) {
  const token = crypto.randomBytes(32).toString('hex');
  konto.tokenHash = hashTokenu(token);
  konto.tokenWygasa = Date.now() + 1000 * 60 * 60 * 48; // 48 godzin
  konto.tokenWyslano = Date.now();
  return token;
}

// Konto akceptowane przez administratora (tryb bez poczty) – powiadomienie w aplikacji
function prosbaOAkceptacje(konto) {
  powiadomRole(['admin'], { typ: 'akceptacja', tytul: 'Nowe konto do akceptacji', tresc: `${nazwaKonta(konto)} (${konto.login}).`, login: konto.login });
}

function potwierdzEmail(token) {
  const k = konta(), h = hashTokenu(token);
  const x = Object.values(k).find(a => a.tokenHash && a.tokenHash === h);
  if (!x) throw blad('Link potwierdzający jest nieprawidłowy albo został już użyty.', 404);
  if (x.tokenWygasa < Date.now()) throw blad('Link potwierdzający wygasł – wyślij nowy z ekranu logowania.', 410);
  x.emailPotwierdzony = true;
  delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
  zapiszKonta(k);
  return publiczne(x);
}

// Nowy link potwierdzający (maks. raz na minutę); dla nieistniejących/potwierdzonych kont zwraca null bez błędu
function nowyTokenPotwierdzenia(email) {
  const k = konta(), x = k[normEmail(email)];
  if (!x || x.emailPotwierdzony !== false) return null;
  if (x.tokenWyslano && Date.now() - x.tokenWyslano < 60 * 1000) throw blad('Link został wysłany przed chwilą – odczekaj minutę.', 429);
  const token = ustawToken(x);
  zapiszKonta(k);
  return { token, konto: publiczne(x) };
}

const KOMUNIKAT_OCZEKUJE = 'Konto czeka na akceptację administratora. Spróbuj zalogować się później.';

function zaloguj(email, haslo, opcje = {}) {
  const k = konta()[normEmail(email)];
  if (!k || !sprawdzHaslo(String(haslo || ''), k.haslo)) throw blad('Nieprawidłowy e-mail lub hasło.', 401);
  // konto założone, gdy poczta działała, a link nie dotarł – bez poczty akceptuje je administrator
  if (k.emailPotwierdzony === false && opcje.bezMaila) throw blad(KOMUNIKAT_OCZEKUJE, 403);
  if (k.emailPotwierdzony === false) throw Object.assign(blad('Potwierdź adres e-mail – kliknij link z wiadomości, którą wysłaliśmy przy rejestracji.', 403), { kod: 'niepotwierdzony' });
  if (k.status === 'oczekuje') throw blad(KOMUNIKAT_OCZEKUJE, 403);
  if (k.status === 'zablokowane') throw blad('Konto jest zablokowane – skontaktuj się z administratorem.', 403);
  const token = crypto.randomBytes(32).toString('hex');
  const s = czytaj('sesje.json', {});
  s[token] = { login: k.login, wygasa: Date.now() + 1000 * 60 * 60 * 24 * 14 };
  for (const [t, v] of Object.entries(s)) if (v.wygasa < Date.now()) delete s[t];
  zapisz('sesje.json', s);
  return { token, konto: publiczne(k) };
}
function wyloguj(token) { const s = czytaj('sesje.json', {}); delete s[token]; zapisz('sesje.json', s); }
function kontoZSesji(token) {
  if (!token) return null;
  const s = czytaj('sesje.json', {})[token];
  if (!s || s.wygasa < Date.now()) return null;
  const k = konta()[s.login];
  return k && k.status === 'aktywne' ? { ...k, rola: rolaKonta(k) } : null;
}

// Lista kont (administrator)
const listaKont = () => Object.values(konta()).map(publiczne);

// Zmiany kont (administrator): status, ręczne potwierdzenie adresu, nowe hasło
function zmienKonto(kto, login, zmiany) {
  const k = konta(), x = k[normEmail(login)];
  if (!x) throw blad('Nie ma takiego konta.', 404);

  if ('status' in zmiany) {
    if (!['aktywne', 'oczekuje', 'zablokowane'].includes(zmiany.status)) throw blad('Nieznany status.');
    if (x.login === kto.login && zmiany.status !== 'aktywne') throw blad('Nie możesz zablokować własnego konta.');
    const bylo = x.status; x.status = zmiany.status;
    // akceptacja przez administratora zastępuje potwierdzenie adresu e-mail
    if (x.status === 'aktywne' && x.emailPotwierdzony === false) {
      x.emailPotwierdzony = true;
      delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
    }
    if (bylo === 'oczekuje' && x.status === 'aktywne') powiadom(x.login, { typ: 'info', tytul: 'Konto zaakceptowane', tresc: 'Administrator zaakceptował Twoje konto – możesz się zalogować.' });
  }
  // administrator może ręcznie potwierdzić adres (np. gdy mail nie dotarł)
  if (zmiany.emailPotwierdzony === true && x.emailPotwierdzony === false) {
    x.emailPotwierdzony = true; delete x.tokenHash; delete x.tokenWygasa; delete x.tokenWyslano;
  }
  if ('haslo' in zmiany) {
    if (String(zmiany.haslo).length < 8) throw blad('Hasło musi mieć co najmniej 8 znaków.');
    x.haslo = hashuj(zmiany.haslo);
  }
  zapiszKonta(k);
  return publiczne(x);
}

function usunKonto(kto, login) {
  login = normEmail(login);
  if (login === kto.login) throw blad('Nie możesz usunąć własnego konta.');
  const k = konta();
  if (!k[login]) throw blad('Nie ma takiego konta.', 404);
  delete k[login];
  zapiszKonta(k);
}

// ---------- Powiadomienia ----------
function powiadom(login, p) {
  if (!login) return;
  const all = czytaj('powiadomienia.json', []);
  all.push({ id: crypto.randomBytes(6).toString('hex'), do: login, data: new Date().toISOString(), przeczytane: false, ...p });
  zapisz('powiadomienia.json', all.slice(-3000));
}
function powiadomRole(role, p) { for (const k of Object.values(konta())) if (role.includes(rolaKonta(k)) && k.status === 'aktywne') powiadom(k.login, p); }
function powiadomienia(login) { return czytaj('powiadomienia.json', []).filter(p => p.do === login).reverse().slice(0, 100); }
function oznaczPrzeczytane(login) {
  const all = czytaj('powiadomienia.json', []);
  all.forEach(p => { if (p.do === login) p.przeczytane = true; });
  zapisz('powiadomienia.json', all);
}

// ---------- Wyceny ----------
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nowyKod(istniejace, prefiks = 'KS') {
  let kod;
  do { kod = prefiks + '-' + Array.from(crypto.randomBytes(8), b => ALFABET[b % ALFABET.length]).join('').replace(/(.{4})/, '$1-'); } while (istniejace[kod]);
  return kod;
}
const wyceny = () => czytaj('wyceny.json', {});
const mozeEdytowac = (kto, w) => kto.rola === 'admin' || w.wlasciciel === kto.login;
// Maksymalny rabat (reguly.json → rabatMaks, domyślnie 45%)
const rabatMaks = () => { const m = Number(czytaj('reguly.json', {}).rabatMaks); return m >= 0 && m <= 100 ? m : 45; };

function zapiszWycene(kto, { kod, oferta, cennik }) {
  const all = wyceny();
  const teraz = new Date().toISOString();
  let w = kod && all[kod];
  if (w && !mozeEdytowac(kto, w)) throw blad('Nie możesz zmieniać tej wyceny – zapisz ją jako nową.', 403);
  if (!w) {
    kod = nowyKod(all);
    w = { kod, wlasciciel: kto.login, utworzono: teraz, historia: [{ data: teraz, kto: kto.login, co: 'Utworzono wycenę' }] };
  } else w.historia.push({ data: teraz, kto: kto.login, co: 'Zaktualizowano wycenę' });
  w.projekt = tekst(oferta.projekt);
  w.klient = tekst(oferta.klient);
  w.zestawy = Array.isArray(oferta.zestawy) ? oferta.zestawy : [];
  w.netto = w.zestawy.reduce((a, z) => a + (Number(z.netto) || 0) * (Number(z.liczba) || 1), 0);
  w.rabat = Math.max(0, Math.min(rabatMaks(), Number(oferta.rabat) || 0));
  w.cennik = cennik || '';
  w.zmieniono = teraz;
  all[w.kod] = w;
  zapisz('wyceny.json', all);
  return w;
}

function pobierzWycene(kto, kod) {
  const w = wyceny()[String(kod || '').trim().toUpperCase()];
  if (!w) throw blad('Nie znaleziono wyceny o tym kodzie.', 404);
  return { ...w, wlascicielNazwa: nazwaKonta(konta()[w.wlasciciel]), mozeEdytowac: mozeEdytowac(kto, w) };
}

function podsumowanie(w, k) {
  return {
    kod: w.kod, projekt: w.projekt, klient: w.klient, wlasciciel: w.wlasciciel, wlascicielNazwa: nazwaKonta(k[w.wlasciciel]),
    netto: w.netto, zestawy: (w.zestawy || []).length, zmieniono: w.zmieniono, rabat: w.rabat || 0
  };
}

function listaWycen(kto, zakres) {
  const all = Object.values(wyceny()), k = konta();
  const lista = zakres === 'wszystkie' && kto.rola === 'admin' ? all : all.filter(w => w.wlasciciel === kto.login);
  return lista.sort((a, b) => b.zmieniono.localeCompare(a.zmieniono)).map(w => podsumowanie(w, k));
}

function usunWycene(kto, kod) {
  const all = wyceny(), w = all[kod];
  if (!w) throw blad('Nie znaleziono wyceny.', 404);
  if (!mozeEdytowac(kto, w)) throw blad('Brak uprawnień.', 403);
  delete all[kod];
  zapisz('wyceny.json', all);
}

module.exports = {
  ROLE, rejestruj, potwierdzEmail, nowyTokenPotwierdzenia, zaloguj, wyloguj, kontoZSesji, publiczne, listaKont, zmienKonto, usunKonto,
  powiadomienia, oznaczPrzeczytane, powiadom, powiadomRole, nazwaKonta,
  zapiszWycene, pobierzWycene, listaWycen, usunWycene,
  czyPusto: () => Object.keys(konta()).length === 0
};
