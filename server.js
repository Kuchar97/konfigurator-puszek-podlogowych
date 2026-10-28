// Konfigurator puszek podłogowych Kontakt-Simon
// Start: npm start  →  http://localhost:3490
const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseCennik } = require('./lib/cennik');
const { stan, infoProduktu } = require('./lib/kontakt-simon');
const { ofertaXlsx } = require('./lib/oferta-xlsx');
const konta = require('./lib/konta');
const poczta = require('./lib/poczta');
const uwagi = require('./lib/uwagi');
const reguly = require('./lib/reguly');
const podobneProdukty = require('./lib/podobne');

const PORT = process.env.PORT || 3490;
// Na serwerze (deploy/konfigurator.env): KONFIGURATOR_PRODUKCJA=1, ADRES_APLIKACJI=https://…ts.net
const PRODUKCJA = process.env.KONFIGURATOR_PRODUKCJA === '1';
const ADRES = (process.env.ADRES_APLIKACJI || '').replace(/\/+$/, '');
const HOST = process.env.HOST || (PRODUKCJA ? '127.0.0.1' : undefined); // za tunelem – tylko lokalnie
const DATA = path.join(__dirname, 'data');
const KATALOGI = path.join(DATA, 'katalogi');
fs.mkdirSync(KATALOGI, { recursive: true });

const czytaj = (plik, dom) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, plik), 'utf8')); } catch { return dom; } };
const zapisz = (plik, obj) => fs.writeFileSync(path.join(DATA, plik), JSON.stringify(obj, null, 1));
const bezpiecznaNazwa = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

const app = express();
app.set('trust proxy', 'loopback'); // Tailscale Funnel / Cloudflare Tunnel łączą się z 127.0.0.1
app.use(express.json({ limit: '10mb' })); // oferty, reguły doboru, uwagi ze zrzutem ekranu
// no-cache: przeglądarka przy każdym wejściu sprawdza (ETag), czy pliki się zmieniły – po aktualizacji serwera
// użytkownicy od razu dostają nową wersję, bez Ctrl+F5
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/katalogi', express.static(KATALOGI));

// ---------- Sesja i uprawnienia ----------
const COOKIE = 'kai_sesja'; // inna nazwa niż w konfiguratorze puszek – przeglądarka nie rozróżnia ciasteczek po porcie
function token(req) {
  const c = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return c ? decodeURIComponent(c.slice(COOKIE.length + 1)) : null;
}
app.use((req, res, next) => { req.konto = konta.kontoZSesji(token(req)); next(); });

// wymagaj() – dowolne zalogowane konto; wymagaj('admin') – tylko administrator
const wymagaj = (...role) => (req, res, next) => {
  if (!req.konto) return res.status(401).json({ blad: 'Zaloguj się, aby skorzystać z tej funkcji.' });
  if (role.length && !role.includes(req.konto.rola)) return res.status(403).json({ blad: 'Brak uprawnień.' });
  next();
};
const tylkoAdmin = wymagaj('admin'); // cennik, katalogi, reguły doboru, poczta, konta, uwagi
const obsluz = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message, kod: e.kod }); }
};

// Adres aplikacji do linków w mailach (np. http://localhost:3480 albo ADRES_APLIKACJI na serwerze)
const adresAplikacji = req => ADRES || `${req.protocol}://${req.get('host')}`;
const COOKIE_OPCJE = `HttpOnly; SameSite=Lax; Path=/${ADRES.startsWith('https:') ? '; Secure' : ''}`;

async function wyslijLinkPotwierdzajacy(req, konto, token) {
  const url = `${adresAplikacji(req)}/api/konto/potwierdz?token=${token}`;
  const { html, tekst } = poczta.szablon('Potwierdź adres e-mail', [
    `Dzień dobry${konto.imie ? ' ' + konto.imie : ''},`,
    'dziękujemy za rejestrację w konfiguratorze puszek podłogowych Kontakt-Simon.',
    'Aby aktywować logowanie, potwierdź swój adres e-mail – link jest ważny 48 godzin.',
    'Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.'
  ], { url, tekst: 'Potwierdź adres e-mail' });
  try { return { wyslano: true, ...(await poczta.wyslij({ do: konto.email, temat: 'Potwierdź adres e-mail – konfigurator puszek Kontakt-Simon', html, tekst })) }; }
  catch (e) { console.error('Błąd wysyłki e-maila:', e.message); return { wyslano: false, blad: e.message }; }
}

// ---------- Konta ----------
// Bez skonfigurowanej poczty nowe konta akceptuje administrator (zamiast linku w mailu)
const bezMaila = () => !poczta.statusPoczty().skonfigurowana;
app.get('/api/konto', (req, res) => res.json({
  konto: konta.publiczne(req.konto), pierwszeKonto: konta.czyPusto(), bezMaila: bezMaila(),
  noweUwagi: req.konto && req.konto.rola === 'admin' ? uwagi.noweIle() : 0
}));
app.post('/api/konto/rejestracja', obsluz(async req => {
  const { konto, pierwsze, token, akceptacja } = konta.rejestruj(req.body || {}, { bezMaila: bezMaila() });
  const mail = token ? await wyslijLinkPotwierdzajacy(req, konto, token) : null;
  return { konto, pierwsze, mail, akceptacja }; // token nigdy nie trafia do przeglądarki
}));
// Link z maila: potwierdza adres i przekierowuje na ekran logowania z komunikatem
app.get('/api/konto/potwierdz', (req, res) => {
  try {
    const k = konta.potwierdzEmail(String(req.query.token || ''));
    res.redirect(`/?potwierdzenie=ok&status=${encodeURIComponent(k.status)}`);
  } catch (e) { res.redirect(`/?potwierdzenie=blad&komunikat=${encodeURIComponent(e.message)}`); }
});
app.post('/api/konto/wyslij-link', obsluz(async req => {
  const r = konta.nowyTokenPotwierdzenia(req.body.email);
  if (r) await wyslijLinkPotwierdzajacy(req, r.konto, r.token);
  return { ok: true }; // ta sama odpowiedź niezależnie od tego, czy konto istnieje
}));

// Poczta (administrator): ustawienia SMTP, test, skrzynka testowa
app.get('/api/poczta', tylkoAdmin, (req, res) => res.json({ ...poczta.statusPoczty(), skrzynka: poczta.skrzynkaTestowa() }));
app.post('/api/poczta', tylkoAdmin, obsluz(req => { poczta.zapiszSmtp(req.body && req.body.usun ? null : req.body); return poczta.statusPoczty(); }));
app.post('/api/poczta/test', tylkoAdmin, obsluz(async req => {
  const { html, tekst } = poczta.szablon('Test poczty', ['To jest testowa wiadomość z konfiguratora puszek podłogowych Kontakt-Simon. Wysyłka e-maili działa.']);
  return poczta.wyslij({ do: String(req.body.do || req.konto.login), temat: 'Test poczty – konfigurator puszek', html, tekst });
}));
app.delete('/api/poczta/skrzynka', tylkoAdmin, (req, res) => { poczta.wyczyscSkrzynke(); res.json({ ok: true }); });
// Ochrona przed zgadywaniem haseł: max 10 nieudanych prób na 15 minut dla danego konta z jednego adresu
// (klucz z e-mailem – za tunelem wszyscy mogą mieć ten sam adres 127.0.0.1)
const PROBY = new Map();
const kluczProby = req => `${req.ip}|${String((req.body || {}).email || '').trim().toLowerCase()}`;
function limitLogowania(req) {
  const teraz = Date.now(), klucz = kluczProby(req), p = PROBY.get(klucz);
  if (p && teraz - p.od < 15 * 60 * 1000 && p.ile >= 10) throw Object.assign(new Error('Zbyt wiele nieudanych prób logowania – spróbuj za kilkanaście minut.'), { status: 429 });
  return () => { const q = PROBY.get(klucz); PROBY.set(klucz, q && teraz - q.od < 15 * 60 * 1000 ? { od: q.od, ile: q.ile + 1 } : { od: teraz, ile: 1 }); };
}
app.post('/api/konto/logowanie', obsluz((req, res) => {
  const nieudana = limitLogowania(req);
  let wynik;
  try { wynik = konta.zaloguj(req.body.email, req.body.haslo, { bezMaila: bezMaila() }); }
  catch (e) { if (e.kod !== 'niepotwierdzony') nieudana(); throw e; }
  PROBY.delete(kluczProby(req));
  res.setHeader('Set-Cookie', `${COOKIE}=${wynik.token}; ${COOKIE_OPCJE}; Max-Age=${60 * 60 * 24 * 14}`);
  return { konto: wynik.konto };
}));
app.post('/api/konto/wylogowanie', (req, res) => {
  konta.wyloguj(token(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; ${COOKIE_OPCJE}; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/powiadomienia', wymagaj(), (req, res) => res.json(konta.powiadomienia(req.konto.login)));
app.post('/api/powiadomienia/przeczytane', wymagaj(), (req, res) => { konta.oznaczPrzeczytane(req.konto.login); res.json({ ok: true }); });

// Konta (administrator): lista, akceptacja, blokada, nowe hasło, usuwanie
app.get('/api/konta', tylkoAdmin, (req, res) => res.json(konta.listaKont()));
app.post('/api/konta/:login', tylkoAdmin, obsluz(req => konta.zmienKonto(req.konto, req.params.login, req.body || {})));
app.delete('/api/konta/:login', tylkoAdmin, obsluz(req => { konta.usunKonto(req.konto, req.params.login); return { ok: true }; }));

// ---------- Wyceny ----------
app.get('/api/wyceny', wymagaj(), (req, res) => res.json(konta.listaWycen(req.konto, String(req.query.zakres || ''))));
app.post('/api/wyceny', wymagaj(), obsluz(req => {
  const w = konta.zapiszWycene(req.konto, { kod: req.body.kod, oferta: req.body.oferta || {}, cennik: czytaj('produkty.json', { meta: {} }).meta.cennik });
  return konta.pobierzWycene(req.konto, w.kod);
}));
app.get('/api/wyceny/:kod', wymagaj(), obsluz(req => konta.pobierzWycene(req.konto, req.params.kod)));
app.delete('/api/wyceny/:kod', wymagaj(), obsluz(req => { konta.usunWycene(req.konto, req.params.kod); return { ok: true }; }));

// ---------- Dane aplikacji ----------
app.get('/api/dane', (req, res) => {
  res.json({ ...czytaj('produkty.json', { meta: {}, produkty: {} }), reguly: czytaj('reguly.json', {}), katalogi: czytaj('katalogi.json', []) });
});

// ---------- Reguły doboru – plik wgrywany w panelu Dane (administrator) ----------
const produktyCennika = () => czytaj('produkty.json', { produkty: {} }).produkty;
const zBledami = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message, bledy: e.bledy }); }
};
const bezR = ({ R, ...o }) => o;
app.get('/api/reguly/stan', tylkoAdmin, (req, res) => res.json(reguly.stan()));
app.get('/api/reguly/plik', tylkoAdmin, (req, res) => {
  const w = (czytaj('reguly.json', {})._wersja || 'obecne').replace(/[^\w.-]/g, '_');
  res.set('Content-Disposition', `attachment; filename="reguly-${w}.json"`).type('application/json').send(fs.readFileSync(reguly.PLIK));
});
app.post('/api/reguly/sprawdz', tylkoAdmin, zBledami(req => bezR(reguly.ocen(req.body.zAktualizacji ? reguly.tekstZAktualizacji() : req.body.tekst, produktyCennika()))));
app.post('/api/reguly', tylkoAdmin, zBledami(req => ({ ok: true, ...bezR(reguly.wgraj(req.body.tekst, produktyCennika(), req.konto)) })));
app.get('/api/reguly/kopie/:nazwa', tylkoAdmin, (req, res) => {
  try { res.download(reguly.bezpiecznaKopia(req.params.nazwa)); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
});
app.post('/api/reguly/przywroc', tylkoAdmin, zBledami(req => { reguly.przywroc(req.body.nazwa, produktyCennika(), req.konto); return { ok: true }; }));
app.post('/api/reguly/aktualizacja', tylkoAdmin, zBledami(req => ({ ok: true, ...bezR(reguly.zastosujZAktualizacji(produktyCennika(), req.konto)) })));
app.delete('/api/reguly/aktualizacja', tylkoAdmin, (req, res) => { reguly.odrzucZAktualizacji(); res.json({ ok: true }); });
app.get('/api/reguly/aktualizacja/plik', tylkoAdmin, (req, res) => {
  try { res.set('Content-Disposition', 'attachment; filename="reguly-z-aktualizacji.json"').type('application/json').send(reguly.tekstZAktualizacji()); }
  catch (e) { res.status(e.status || 500).json({ blad: e.message }); }
});

// ---------- Uwagi testerów („Zgłoś uwagę”) ----------
// Zgłaszać może każdy (także gość) – limit na godzinę: 20 na konto, 15 dla gości z jednego adresu
// (za tunelem goście mogą mieć wspólny adres 127.0.0.1, dlatego zalogowani liczeni są osobno)
const ZGLOSZENIA = new Map();
app.post('/api/uwagi', obsluz(async req => {
  const klucz = req.konto ? 'konto:' + req.konto.login : 'ip:' + req.ip;
  const teraz = Date.now(), z = (ZGLOSZENIA.get(klucz) || []).filter(t => teraz - t < 60 * 60 * 1000);
  if (z.length >= (req.konto ? 20 : 15)) throw Object.assign(new Error('Wysłano już dużo uwag – spróbuj za godzinę.'), { status: 429 });
  const autor = req.konto ? { ...req.konto, nazwa: konta.nazwaKonta(req.konto) } : null;
  const u = uwagi.dodaj(req.body || {}, autor);
  ZGLOSZENIA.set(klucz, [...z, teraz]);
  const kto = autor ? `${autor.nazwa} (${autor.login})` : `gość${u.autor.email ? ' ' + u.autor.email : ''}`;
  konta.powiadomRole(['admin'], { typ: 'uwaga', tytul: `Nowa uwaga #${u.numer}: ${uwagi.TYPY[u.typ]}`, tresc: `${kto}: ${u.tekst.slice(0, 200)}` });
  // e-mail do administratora – tylko gdy poczta jest skonfigurowana (bez zapychania skrzynki testowej)
  if (poczta.statusPoczty().skonfigurowana) {
    const admin = konta.listaKont().find(k => k.rola === 'admin');
    if (admin) {
      const { html, tekst } = poczta.szablon(`Nowa uwaga #${u.numer} – ${uwagi.TYPY[u.typ]}`, [`Od: ${kto}`, u.tekst], { url: `${adresAplikacji(req)}/?widok=uwagi`, tekst: 'Otwórz listę uwag' });
      poczta.wyslij({ do: admin.email, temat: `Uwaga #${u.numer} (${uwagi.TYPY[u.typ]}) – konfigurator puszek`, html, tekst }).catch(e => console.error('Mail o uwadze:', e.message));
    }
  }
  return { ok: true, numer: u.numer };
}));
app.get('/api/uwagi', tylkoAdmin, (req, res) => res.json(uwagi.lista()));
app.get('/api/uwagi/moje', wymagaj(), (req, res) => res.json(uwagi.moje(req.konto.login)));
app.get('/api/uwagi/eksport.md', tylkoAdmin, (req, res) => {
  res.type('text/markdown; charset=utf-8').send(uwagi.eksportMd(req.query.wszystkie !== '1'));
});
app.get('/api/uwagi/:id/zdjecie', tylkoAdmin, (req, res) => {
  const p = uwagi.sciezkaZdjecia(uwagi.znajdz(req.params.id));
  if (!p || !fs.existsSync(p)) return res.status(404).json({ blad: 'Brak zrzutu ekranu.' });
  res.sendFile(p);
});
app.post('/api/uwagi/:id', tylkoAdmin, obsluz(req => {
  const { uwaga, przed } = uwagi.zmien(req.params.id, req.body || {});
  // autor (zalogowany) dostaje powiadomienie o odpowiedzi albo zmianie statusu
  if (uwaga.autor.login && (uwaga.odpowiedz !== przed.odpowiedz || uwaga.status !== przed.status)) {
    konta.powiadom(uwaga.autor.login, {
      typ: 'uwaga', tytul: `Twoja uwaga #${uwaga.numer}: ${uwagi.STATUSY[uwaga.status]}`,
      tresc: uwaga.odpowiedz ? `Odpowiedź: ${uwaga.odpowiedz}` : `„${uwaga.tekst.slice(0, 120)}”`
    });
  }
  return uwaga;
}));
app.delete('/api/uwagi/:id', tylkoAdmin, obsluz(req => { uwagi.usun(req.params.id); return { ok: true }; }));

// ---------- Produkty ----------
app.get('/api/stan', async (req, res) => {
  try { res.json(await stan(String(req.query.symbol || ''))); }
  catch (e) { res.status(502).json({ blad: 'Nie udało się połączyć z monitorem stanów: ' + e.message }); }
});
// produkty podobne do brakującego na magazynie – tylko te, które są dostępne (stan sprawdzany na żywo)
app.get('/api/podobne', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || ''), potrzeba = Math.max(1, Number(req.query.potrzeba) || 1);
    const { produkt, kandydaci } = podobneProdukty.podobne(symbol, 8);
    if (!produkt) return res.json({ produkt: null, podobne: [] });
    const stany = await Promise.all(kandydaci.map(p => stan(p.symbol).catch(() => null)));
    const podobne = kandydaci.map((p, i) => ({ ...p, stan: stany[i] }))
      .filter(p => p.stan && p.stan.znaleziono && p.stan.ilosc > 0)
      .sort((a, b) => (b.stan.ilosc >= potrzeba) - (a.stan.ilosc >= potrzeba) || b.podobienstwo - a.podobienstwo)
      .slice(0, 5);
    res.json({ produkt, podobne, sprawdzono: kandydaci.length });
  } catch (e) { res.status(502).json({ blad: 'Nie udało się sprawdzić podobnych produktów: ' + e.message }); }
});
app.get('/api/produkt', async (req, res) => {
  const symbol = String(req.query.symbol || '');
  const p = czytaj('produkty.json', { produkty: {} }).produkty[symbol];
  try { res.json(await infoProduktu(symbol, p && p.link)); }
  catch (e) { res.status(502).json({ blad: e.message }); }
});

// ---------- Import danych (administrator) ----------
app.post('/api/import/cennik', tylkoAdmin, express.raw({ type: () => true, limit: '50mb' }), (req, res) => {
  try {
    const wynik = parseCennik(req.body);
    if (wynik.meta.liczba < 50) throw new Error(`Za mało produktów (${wynik.meta.liczba}) – to chyba nie jest cennik Kontakt-Simon.`);
    const stary = czytaj('produkty.json', null);
    if (stary) zapisz(`produkty-kopia-${Date.now()}.json`, stary);
    const nazwa = bezpiecznaNazwa(req.query.nazwa || 'cennik.xls');
    fs.mkdirSync(path.join(__dirname, 'dane', 'cenniki'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'dane', 'cenniki', `${Date.now()}_${nazwa}`), req.body);
    const nowe = Object.keys(wynik.produkty).filter(s => !stary || !stary.produkty[s]);
    const zmianyCen = stary ? Object.values(wynik.produkty).filter(p => stary.produkty[p.symbol] && stary.produkty[p.symbol].cena !== p.cena).length : 0;
    zapisz('produkty.json', wynik);
    res.json({ ok: true, meta: wynik.meta, nowe: nowe.slice(0, 200), liczbaNowych: nowe.length, zmianyCen });
  } catch (e) { res.status(400).json({ blad: e.message }); }
});
app.post('/api/import/katalog', tylkoAdmin, express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
  if (!req.body || req.body.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ blad: 'To nie jest plik PDF.' });
  const plik = `${Date.now()}_${bezpiecznaNazwa(req.query.nazwa || 'katalog.pdf')}`;
  fs.writeFileSync(path.join(KATALOGI, plik), req.body);
  const lista = czytaj('katalogi.json', []);
  lista.push({ seria: String(req.query.seria || 'inne'), nazwa: String(req.query.tytul || req.query.nazwa || plik), url: `/katalogi/${plik}`, dodano: new Date().toISOString() });
  zapisz('katalogi.json', lista);
  res.json({ ok: true, katalogi: lista });
});
app.delete('/api/import/katalog', tylkoAdmin, (req, res) => {
  const lista = czytaj('katalogi.json', []).filter(k => k.url !== req.query.url);
  zapisz('katalogi.json', lista);
  res.json({ ok: true, katalogi: lista });
});

// Edytowalna oferta Excel z formułą rabatu
app.post('/api/oferta.xlsx', async (req, res) => {
  try {
    const buf = await ofertaXlsx({ ...req.body, rabatMaks: czytaj('reguly.json', {}).rabatMaks });
    const nazwa = bezpiecznaNazwa(`oferta_${req.body.kod || req.body.projekt || 'puszki'}.xlsx`);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nazwa}"` });
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ blad: e.message }); }
});

app.listen(PORT, HOST, () => console.log(`Konfigurator puszek: http://localhost:${PORT}${ADRES ? ` · publicznie: ${ADRES}` : ''}${PRODUKCJA ? ' · tryb serwerowy' : ''}`));
