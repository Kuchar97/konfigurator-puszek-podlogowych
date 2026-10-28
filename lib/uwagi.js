// Uwagi od testerów („Zgłoś uwagę”): data/uwagi.json + zrzuty ekranu w data/uwagi/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const PLIK = path.join(DATA, 'uwagi.json');
const ZDJECIA = path.join(DATA, 'uwagi');

const TYPY = { blad: 'Błąd', pomysl: 'Pomysł', pytanie: 'Pytanie', inne: 'Inne' };
const STATUSY = { nowa: 'nowa', 'w-trakcie': 'w trakcie', zrobione: 'zrobione', odrzucone: 'odrzucone' };
const OBRAZY = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_ZDJECIE = 4 * 1024 * 1024;

const czytaj = () => { try { return JSON.parse(fs.readFileSync(PLIK, 'utf8')); } catch { return []; } };
const zapisz = l => fs.writeFileSync(PLIK, JSON.stringify(l, null, 1));
function blad(t, status = 400) { const e = new Error(t); e.status = status; return e; }
const tekst = (v, max) => String(v || '').trim().slice(0, max);

function dodaj(d, konto) {
  const tresc = tekst(d.tekst, 5000);
  if (tresc.length < 3) throw blad('Opisz uwagę – choć kilka słów.');
  const typ = TYPY[d.typ] ? d.typ : 'inne';
  const email = konto ? konto.login : tekst(d.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw blad('Podaj poprawny adres e-mail albo zostaw pole puste.');

  let kontekst = null;
  if (d.kontekst && typeof d.kontekst === 'object') {
    const s = JSON.stringify(d.kontekst);
    kontekst = s.length <= 60000 ? d.kontekst : { uwaga: 'kontekst za duży – pominięto', widok: d.kontekst.widok };
  }

  const lista = czytaj();
  const u = {
    id: crypto.randomBytes(6).toString('hex'),
    numer: lista.reduce((m, x) => Math.max(m, x.numer || 0), 0) + 1,
    data: new Date().toISOString(),
    typ, tekst: tresc, status: 'nowa', odpowiedz: '',
    autor: konto ? { login: konto.login, rola: konto.rola, nazwa: konto.nazwa || konto.imie || konto.login } : { gosc: true, email: email || null },
    kontekst, zdjecie: null
  };

  if (d.zdjecie && d.zdjecie.dane) {
    const ext = OBRAZY[d.zdjecie.typ];
    if (!ext) throw blad('Zrzut ekranu musi być plikiem PNG, JPG lub WEBP.');
    const buf = Buffer.from(String(d.zdjecie.dane), 'base64');
    if (buf.length > MAX_ZDJECIE) throw blad('Zrzut ekranu jest za duży (max 4 MB).');
    fs.mkdirSync(ZDJECIA, { recursive: true });
    u.zdjecie = `${u.id}.${ext}`;
    fs.writeFileSync(path.join(ZDJECIA, u.zdjecie), buf);
  }

  lista.push(u);
  zapisz(lista);
  return u;
}

const lista = () => czytaj().slice().reverse();
const moje = login => lista().filter(u => u.autor && u.autor.login === login)
  .map(({ id, numer, data, typ, tekst: t, status, odpowiedz }) => ({ id, numer, data, typ, tekst: t, status, odpowiedz }));
const noweIle = () => czytaj().filter(u => u.status === 'nowa').length;
const znajdz = id => czytaj().find(u => u.id === id);

function zmien(id, zmiany) {
  const l = czytaj();
  const u = l.find(x => x.id === id);
  if (!u) throw blad('Nie ma takiej uwagi.', 404);
  const przed = { status: u.status, odpowiedz: u.odpowiedz };
  if ('status' in zmiany) {
    if (!STATUSY[zmiany.status]) throw blad('Nieznany status.');
    u.status = zmiany.status;
  }
  if ('odpowiedz' in zmiany) u.odpowiedz = tekst(zmiany.odpowiedz, 3000);
  if ('notatka' in zmiany) u.notatka = tekst(zmiany.notatka, 3000);
  u.zmieniono = new Date().toISOString();
  zapisz(l);
  return { uwaga: u, przed };
}

function usun(id) {
  const l = czytaj();
  const u = l.find(x => x.id === id);
  if (!u) throw blad('Nie ma takiej uwagi.', 404);
  if (u.zdjecie) fs.rmSync(path.join(ZDJECIA, u.zdjecie), { force: true });
  zapisz(l.filter(x => x.id !== id));
}

function sciezkaZdjecia(u) { return u && u.zdjecie ? path.join(ZDJECIA, u.zdjecie) : null; }

// Zestawienie otwartych uwag w formacie Markdown (do skopiowania)
function eksportMd(tylkoOtwarte) {
  const l = czytaj().filter(u => !tylkoOtwarte || ['nowa', 'w-trakcie'].includes(u.status));
  const kto = u => u.autor.gosc ? `gość${u.autor.email ? ' ' + u.autor.email : ''}` : `${u.autor.nazwa} (${u.autor.rola})`;
  const linie = [`# Uwagi testerów – konfigurator puszek (${l.length})`, `Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, ''];
  for (const u of l) {
    linie.push(`## #${u.numer} · ${TYPY[u.typ]} · ${STATUSY[u.status]}`);
    linie.push(`${new Date(u.data).toLocaleString('pl-PL')} · ${kto(u)}${u.zdjecie ? ' · ze zrzutem ekranu' : ''}`, '');
    linie.push(u.tekst, '');
    if (u.notatka) linie.push(`**Notatka admina:** ${u.notatka}`, '');
    if (u.odpowiedz) linie.push(`**Odpowiedź:** ${u.odpowiedz}`, '');
    if (u.kontekst) linie.push('<details><summary>Kontekst</summary>', '', '```json', JSON.stringify(u.kontekst, null, 1), '```', '</details>', '');
  }
  return linie.join('\n');
}

module.exports = { TYPY, STATUSY, dodaj, lista, moje, noweIle, znajdz, zmien, usun, sciezkaZdjecia, eksportMd };
