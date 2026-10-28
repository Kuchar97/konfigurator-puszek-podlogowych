/* Konta, wyceny i administracja – część interfejsu konfiguratora */
'use strict';

let KONTO = null;            // zalogowane konto albo null (gość)
let PIERWSZE_KONTO = false;  // brak kont w systemie – pierwsze zostanie administratorem
let POWIADOMIENIA = [];
let BEZ_MAILA = false;       // poczta nieskonfigurowana – nowe konta akceptuje administrator
const KONTA_CACHE = {};      // dane widoków (klucz → tablica | 'laduje')

// wszystkie konta są takie same; pierwsze założone jest administratorem (Dane, Konta, Uwagi)
const zalogowany = () => !!KONTO;
const adminKS = () => !!KONTO && KONTO.rola === 'admin';

async function api(url, opcje = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opcje, body: opcje.body && typeof opcje.body !== 'string' ? JSON.stringify(opcje.body) : opcje.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.blad || `Błąd ${r.status}`);
  return j;
}

async function wczytajKonto() {
  try {
    const j = await api('/api/konto');
    KONTO = j.konto; PIERWSZE_KONTO = j.pierwszeKonto;
    NOWE_UWAGI = j.noweUwagi || 0;
    BEZ_MAILA = !!j.bezMaila;
  } catch { KONTO = null; }
  POWIADOMIENIA = [];
  if (KONTO) { try { POWIADOMIENIA = await api('/api/powiadomienia'); } catch { /* bez powiadomień */ } }
}

// Dane widoku ładowane w tle: pierwsze wywołanie zwraca null i po pobraniu ponownie renderuje
function daneWidoku(klucz, url) {
  if (KONTA_CACHE[klucz] && KONTA_CACHE[klucz] !== 'laduje') return KONTA_CACHE[klucz];
  if (KONTA_CACHE[klucz] !== 'laduje') {
    KONTA_CACHE[klucz] = 'laduje';
    api(url).then(d => { KONTA_CACHE[klucz] = d; render(); }).catch(e => { KONTA_CACHE[klucz] = []; toast(e.message); render(); });
  }
  return null;
}
const odswiezDane = (...klucze) => klucze.forEach(k => delete KONTA_CACHE[k]);
const odswiezWszystko = () => Object.keys(KONTA_CACHE).forEach(k => delete KONTA_CACHE[k]);
const ladowanieHtml = '<p class="muted">Wczytywanie…</p>';
const dataPl = d => d ? new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ---------- Menu w nagłówku ----------
function menuKonta() {
  if (!KONTO) return `<button class="btn" data-akcja="konto-logowanie">Zaloguj</button><button class="btn btn-primary" data-akcja="konto-rejestracja">Załóż konto</button>`;
  const nowe = POWIADOMIENIA.filter(p => !p.przeczytane).length;
  return `
    <button class="btn" data-akcja="idz" data-widok="powiadomienia" title="Powiadomienia">🔔${nowe ? ` <span class="licznik">${nowe}</span>` : ''}</button>
    <button class="btn" data-akcja="idz" data-widok="wyceny">Moje wyceny</button>
    ${adminKS() ? `<button class="btn" data-akcja="idz" data-widok="uwagi" title="Uwagi od testerów">Uwagi${NOWE_UWAGI ? ` <span class="licznik">${NOWE_UWAGI}</span>` : ''}</button><button class="btn" data-akcja="idz" data-widok="konta">Konta</button><button class="btn" data-akcja="admin" title="Cennik, katalogi, reguły doboru, poczta">Dane</button>` : ''}
    <span class="uzytkownik" title="${esc(KONTO.email)}">${esc(KONTO.imie || KONTO.nazwa || KONTO.email)}${adminKS() ? '<small>Administrator</small>' : ''}</span>
    <button class="btn" data-akcja="konto-wyloguj">Wyloguj</button>`;
}

// ---------- Logowanie i rejestracja ----------
function widokLogowanie() {
  return `<section class="panel formularz">
    <h1>Logowanie</h1>
    ${S.komunikatLogowania ? `<p class="komunikat ${S.komunikatLogowaniaTyp || 'info'}">${esc(S.komunikatLogowania)}</p>` : ''}
    ${S.niepotwierdzony ? `<div class="komunikat">Adres <b>${esc(S.niepotwierdzony)}</b> nie jest jeszcze potwierdzony. Kliknij link z wiadomości wysłanej przy rejestracji (sprawdź też folder SPAM).
      <div style="margin-top:8px"><button class="btn btn-sm" data-akcja="konto-wyslij-link">Wyślij link ponownie</button></div></div>` : ''}
    <label>E-mail<input id="f-email" class="tekst" type="email" autocomplete="username" value="${esc(S.niepotwierdzony || S.ostatniEmail || '')}"></label>
    <label>Hasło<input id="f-haslo" class="tekst" type="password" autocomplete="current-password"></label>
    <button class="btn btn-primary" data-akcja="konto-zaloguj">Zaloguj →</button>
    <p class="small muted">Nie masz konta? <button class="btn-link" data-akcja="konto-rejestracja">Załóż konto</button></p>
  </section>`;
}

const pole = (id, etykieta, opcje = {}) => `<label>${etykieta}${opcje.wymagane ? ' *' : ''}<input class="tekst" data-pole="rej.${id}" data-bez-renderu value="${esc((S.rej || {})[id] || '')}" type="${opcje.typ || 'text'}" ${opcje.auto ? `autocomplete="${opcje.auto}"` : ''} placeholder="${esc(opcje.placeholder || '')}"></label>`;

// Jeden formularz dla wszystkich – konta nie mają rodzajów
function widokRejestracja() {
  S.rej = S.rej || {};
  return `<section class="panel formularz">
    <h1>Załóż konto</h1>
    ${PIERWSZE_KONTO ? '<p class="komunikat info">To pierwsze konto w systemie – otrzyma uprawnienia <b>administratora</b> (cennik, reguły doboru, konta, uwagi).</p>' : ''}
    ${pole('email', 'E-mail (służy do logowania)', { wymagane: 1, typ: 'email', auto: 'email' })}
    ${pole('imie', 'Imię i nazwisko', { auto: 'name' })}
    ${pole('firma', 'Firma (opcjonalnie)', { auto: 'organization' })}
    ${pole('telefon', 'Telefon (opcjonalnie)', { typ: 'tel', auto: 'tel' })}
    ${BEZ_MAILA && !PIERWSZE_KONTO ? '<p class="komunikat">Konto zostanie aktywowane po akceptacji administratora – potem zalogujesz się swoim e-mailem i hasłem.</p>' : ''}
    ${pole('haslo', 'Hasło (min. 8 znaków)', { wymagane: 1, typ: 'password', auto: 'new-password' })}
    ${pole('haslo2', 'Powtórz hasło', { wymagane: 1, typ: 'password', auto: 'new-password' })}
    <button class="btn btn-primary" data-akcja="konto-zarejestruj">Załóż konto →</button>
    <p class="small muted">Masz już konto? <button class="btn-link" data-akcja="konto-logowanie">Zaloguj się</button></p>
  </section>`;
}

// ---------- Filtry „Moich wycen”: klient (firma / osoba), autor wyceny, wyszukiwanie ----------
const BEZ_KLIENTA = '__brak__';
const normTekst = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
const filtrWycen = () => (S.filtrWycen = S.filtrWycen || { tekst: '', klient: '', autor: '' });

function wycenyPoFiltrze(lista) {
  const f = filtrWycen(), t = normTekst(f.tekst);
  return lista.filter(w => {
    if (f.klient === BEZ_KLIENTA ? w.klient : f.klient && normTekst(w.klient) !== normTekst(f.klient)) return false;
    if (f.autor && w.wlasciciel !== f.autor) return false;
    if (!t) return true;
    const gdzie = [w.kod, w.projekt, w.klient, w.wlascicielNazwa, w.wlasciciel].map(normTekst).join(' ');
    return t.split(/\s+/).every(slowo => gdzie.includes(slowo));
  });
}

// Klienci zgrupowani bez rozróżniania wielkości liter i polskich znaków; nazwa = najczęstsza pisownia
// (przy remisie – ta z wielkimi literami, np. „Elektro-Hurt Łódź” zamiast „elektro-hurt łódź”)
function klienciWycen(lista) {
  const grupy = new Map();
  for (const w of lista) if (w.klient) {
    const k = normTekst(w.klient), g = grupy.get(k) || { ile: 0, pisownie: {} };
    g.ile++; g.pisownie[w.klient] = (g.pisownie[w.klient] || 0) + 1; grupy.set(k, g);
  }
  const wielkie = s => (s.match(/\p{Lu}/gu) || []).length;
  return [...grupy.values()].map(g => ({ ile: g.ile, nazwa: Object.entries(g.pisownie).sort((a, b) => (b[1] - a[1]) || (wielkie(b[0]) - wielkie(a[0])))[0][0] }))
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
}

function filtryWycenHtml(lista, zakres) {
  const f = filtrWycen();
  const klienci = klienciWycen(lista);
  const bezKlienta = lista.filter(w => !w.klient).length;
  const autorzy = new Map();
  for (const w of lista) { const e = autorzy.get(w.wlasciciel) || { nazwa: w.wlascicielNazwa || w.wlasciciel, ile: 0 }; e.ile++; autorzy.set(w.wlasciciel, e); }
  return `<div class="filtry-wycen">
    <label class="pole">Szukaj <input class="tekst" type="search" data-filtr-wycen="tekst" value="${esc(f.tekst)}" placeholder="kod, projekt, klient, osoba…" style="width:240px"></label>
    <label class="pole">Klient (firma / osoba) <select class="tekst" data-filtr-wycen="klient">
      <option value="">wszyscy (${lista.length})</option>
      ${klienci.map(k => `<option value="${esc(k.nazwa)}" ${f.klient && normTekst(f.klient) === normTekst(k.nazwa) ? 'selected' : ''}>${esc(k.nazwa)} (${k.ile})</option>`).join('')}
      ${bezKlienta ? `<option value="${BEZ_KLIENTA}" ${f.klient === BEZ_KLIENTA ? 'selected' : ''}>— bez klienta (${bezKlienta})</option>` : ''}
    </select></label>
    ${zakres === 'wszystkie' && autorzy.size > 1 ? `<label class="pole">Utworzył(a) <select class="tekst" data-filtr-wycen="autor">
      <option value="">wszyscy</option>${[...autorzy.entries()].sort((a, b) => a[1].nazwa.localeCompare(b[1].nazwa, 'pl')).map(([login, a]) => `<option value="${esc(login)}" ${f.autor === login ? 'selected' : ''}>${esc(a.nazwa)} (${a.ile})</option>`).join('')}
    </select></label>` : ''}
    <button class="btn btn-sm" data-akcja="wyceny-filtr-czysc" ${f.tekst || f.klient || f.autor ? '' : 'hidden'}>Wyczyść filtry</button>
  </div>`;
}

// Podpowiedzi pola „Klient” w ofercie – nazwy z wcześniejszych wycen (ta sama pisownia = łatwe filtrowanie)
function listaKlientowHtml() {
  if (!KONTO) return '';
  const lista = daneWidoku('wyceny-moje', '/api/wyceny?zakres=moje');
  if (!Array.isArray(lista)) return '';
  return `<datalist id="lista-klientow">${klienciWycen(lista).map(k => `<option value="${esc(k.nazwa)}">`).join('')}</datalist>`;
}

function tabelaWycen(lista, zakres) {
  const widoczne = wycenyPoFiltrze(lista);
  if (!widoczne.length) return '<p class="muted">Żadna wycena nie pasuje do filtrów.</p>';
  return `<p class="small muted" style="margin:0 0 6px">Pokazano ${widoczne.length} z ${lista.length}</p>
    <div style="overflow-x:auto"><table class="tabela"><thead><tr><th>Kod</th><th>Projekt / klient</th>${zakres === 'wszystkie' ? '<th>Właściciel</th>' : ''}<th class="num">Zestawy</th><th class="num">Wartość kat. netto</th><th class="num">Rabat</th><th>Zmieniono</th><th></th></tr></thead>
    <tbody>${widoczne.map(w => `<tr>
      <td><span class="symbol">${esc(w.kod)}</span></td><td>${esc(w.projekt || '—')}${w.klient ? `<div class="small muted">${esc(w.klient)}</div>` : ''}</td>
      ${zakres === 'wszystkie' ? `<td>${esc(w.wlascicielNazwa)}<div class="small muted">${esc(w.wlasciciel)}</div></td>` : ''}
      <td class="num">${w.zestawy}</td><td class="num">${zl(w.netto)}</td>
      <td class="num">${w.rabat ? w.rabat + '%' : '—'}</td>
      <td class="small">${dataPl(w.zmieniono)}</td>
      <td class="num"><button class="btn btn-sm" data-akcja="wycena-otworz" data-kod="${esc(w.kod)}">Otwórz</button> <button class="btn btn-sm" data-akcja="wycena-usun" data-kod="${esc(w.kod)}">Usuń</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function widokWyceny() {
  if (!KONTO) return widokLogowanie();
  const zakres = adminKS() && S.zakresWycen === 'wszystkie' ? 'wszystkie' : 'moje';
  const lista = daneWidoku('wyceny-' + zakres, '/api/wyceny?zakres=' + zakres);
  const tresc = !lista ? ladowanieHtml : !lista.length ? '<p class="muted">Brak zapisanych wycen. Skonfiguruj puszki i dodaj je do oferty – wycena zapisze się automatycznie.</p>'
    : `${filtryWycenHtml(lista, zakres)}<div id="tabela-wycen">${tabelaWycen(lista, zakres)}</div>`;
  return `<section class="panel">
    <h1>Moje wyceny</h1>
    ${polePoKodzie()}
    ${adminKS() ? `<div class="opcje" style="margin-bottom:12px">${opcjaAkcja('wyceny-zakres', 'moje', 'Moje', null, zakres === 'moje')}${opcjaAkcja('wyceny-zakres', 'wszystkie', 'Wszystkie w systemie', null, zakres === 'wszystkie')}</div>` : ''}
    ${tresc}
  </section>`;
}

// filtr zmienia tylko tabelę – pole wyszukiwania nie traci kursora
function odswiezTabeleWycen() {
  const zakres = adminKS() && S.zakresWycen === 'wszystkie' ? 'wszystkie' : 'moje';
  const lista = KONTA_CACHE['wyceny-' + zakres], el = document.getElementById('tabela-wycen');
  if (!Array.isArray(lista) || !el) return;
  el.innerHTML = tabelaWycen(lista, zakres);
  const f = filtrWycen(), czysc = document.querySelector('[data-akcja="wyceny-filtr-czysc"]');
  if (czysc) czysc.hidden = !(f.tekst || f.klient || f.autor);
  zapisz();
}
['input', 'change'].forEach(typ => document.addEventListener(typ, e => {
  const pole = e.target.dataset && e.target.dataset.filtrWycen;
  if (!pole || (typ === 'input' && pole !== 'tekst')) return;
  filtrWycen()[pole] = e.target.value;
  odswiezTabeleWycen();
}));

function polePoKodzie() {
  return `<div class="po-kodzie">
    <span>Otwórz wycenę po kodzie:</span>
    <input id="kod-wyceny" class="tekst" placeholder="KS-XXXX-XXXX" style="width:170px;text-transform:uppercase">
    <button class="btn btn-sm" data-akcja="wycena-po-kodzie">Otwórz</button>
  </div>`;
}

// ---------- Administracja kontami ----------
function widokKonta() {
  if (!adminKS()) return widokLogowanie();
  const konta = daneWidoku('konta', '/api/konta');
  if (!konta) return `<section class="panel"><h1>Konta</h1>${ladowanieHtml}</section>`;
  // bez poczty konto z niepotwierdzonym adresem też czeka na akceptację administratora
  const czeka = k => k.status === 'oczekuje' || (BEZ_MAILA && !k.emailPotwierdzony);
  const oczekujace = konta.filter(czeka);
  const wiersz = k => `<tr class="${czeka(k) ? 'oczekuje' : ''}">
    <td><b>${esc(k.email)}</b>${k.telefon ? `<div class="small muted">${esc(k.telefon)}</div>` : ''}</td>
    <td class="small">${esc(k.imie || '—')}${k.firma ? `<br>${esc(k.firma)}` : ''}</td>
    <td>${k.rola === 'admin' ? '<b>Administrator</b>' : 'Użytkownik'}</td>
    <td>${k.rola === 'admin' ? 'aktywne' : `<select class="kolor-select" data-akcja-zmiana="konto-zmien" data-login="${esc(k.login)}" data-pole-konta="status">${['aktywne', 'oczekuje', 'zablokowane'].map(s => `<option ${k.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td>
    <td class="small">${dataPl(k.utworzono)}</td>
    <td class="num">${!k.emailPotwierdzony && !BEZ_MAILA ? `<span class="plakietka pomaranczowa">e-mail niepotwierdzony</span> <button class="btn btn-sm" data-akcja="konto-potwierdz-email" data-login="${esc(k.login)}">Potwierdź e-mail</button><br>` : ''}
      ${czeka(k) ? `<span class="plakietka pomaranczowa">czeka na akceptację</span> <button class="btn btn-sm btn-primary" data-akcja="konto-akceptuj" data-login="${esc(k.login)}">Akceptuj</button><br>` : ''}
      <button class="btn btn-sm" data-akcja="konto-haslo" data-login="${esc(k.login)}">Nowe hasło</button>
      ${k.login !== KONTO.login ? `<button class="btn btn-sm" data-akcja="konto-usun" data-login="${esc(k.login)}">Usuń</button>` : ''}</td>
  </tr>`;
  return `<section class="panel">
    <h1>Konta</h1>
    ${oczekujace.length ? `<p class="komunikat"><b>${oczekujace.length}</b> ${oczekujace.length === 1 ? 'konto czeka' : 'konta czekają'} na akceptację.</p>` : ''}
    <div style="overflow-x:auto"><table class="tabela"><thead><tr><th>E-mail</th><th>Imię / firma</th><th>Rola</th><th>Status</th><th>Utworzono</th><th></th></tr></thead>
      <tbody>${[...oczekujace, ...konta.filter(k => !czeka(k))].map(wiersz).join('')}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">Wszystkie konta mają te same możliwości: konfigurator, zapisywanie wycen z kodem i rabat wpisywany w ofercie. Administrator (pierwsze założone konto) dodatkowo zarządza danymi – cennikiem, katalogami, regułami doboru, pocztą – oraz kontami i uwagami. Gość korzysta z konfiguratora bez zapisu wycen.</p>
  </section>`;
}

// ---------- Poczta (panel Dane, administrator) ----------
function sekcjaPoczty() {
  const p = daneWidoku('poczta', '/api/poczta');
  if (!p) return `<section class="panel"><h2>Poczta e-mail</h2>${ladowanieHtml}</section>`;
  const linki = t => esc(t).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return `<section class="panel">
    <h2>Poczta e-mail</h2>
    <p class="muted">Wiadomości z linkiem potwierdzającym rejestrację. Status: ${p.skonfigurowana ? `<span class="plakietka zielona">SMTP: ${esc(p.host)}:${p.port}</span>` : '<span class="plakietka pomaranczowa">poczta nieskonfigurowana</span>'}</p>
    <p class="komunikat info" style="margin:0 0 10px">${p.skonfigurowana
      ? 'Nowi użytkownicy potwierdzają adres linkiem z maila.'
      : 'Bez poczty nowe konta <b>akceptujesz ręcznie</b> w zakładce <b>Konta</b> (dostajesz powiadomienie 🔔). Użytkownik po rejestracji widzi komunikat, że konto musi zaakceptować administrator. Po skonfigurowaniu SMTP wróci potwierdzanie linkiem z maila.'}</p>
    <div class="siatka-pol">
      <label class="pole">Serwer SMTP <input id="smtp-host" class="tekst" value="${esc(p.host || '')}" placeholder="np. smtp.kontakt-simon.com.pl"></label>
      <label class="pole">Port <input id="smtp-port" class="tekst" type="number" value="${p.port || 587}" style="width:80px"></label>
      <label class="check"><input id="smtp-secure" type="checkbox" ${p.secure ? 'checked' : ''}><span>SSL/TLS (port 465)</span></label>
      <label class="pole">Użytkownik <input id="smtp-user" class="tekst" value="${esc(p.user || '')}" autocomplete="off"></label>
      <label class="pole">Hasło <input id="smtp-pass" class="tekst" type="password" autocomplete="new-password" placeholder="${p.maHaslo ? 'bez zmian' : ''}"></label>
      <label class="pole">Nadawca <input id="smtp-nadawca" class="tekst" value="${esc(p.nadawca || '')}" placeholder="Konfigurator &lt;konfigurator@firma.pl&gt;" style="width:280px"></label>
    </div>
    <div class="opcje" style="margin-top:10px;align-items:center">
      <button class="btn btn-primary btn-sm" data-akcja="poczta-zapisz">Zapisz</button>
      ${p.skonfigurowana ? '<button class="btn btn-sm" data-akcja="poczta-usun">Usuń SMTP</button>' : ''}
      <input id="smtp-test" class="tekst" placeholder="adres do testu (domyślnie Twój)" style="width:240px"><button class="btn btn-sm" data-akcja="poczta-test">Wyślij test</button>
    </div>
    <h3 style="margin-top:16px">Skrzynka testowa ${p.skrzynka.length ? `(${p.skrzynka.length}) <button class="btn-link small" data-akcja="poczta-wyczysc">wyczyść</button>` : ''}</h3>
    ${!p.skrzynka.length ? '<p class="muted small">Pusta.</p>' : p.skrzynka.map(m => `<details class="mail-testowy"><summary><b>${esc(m.temat)}</b> → ${esc(m.do)} <span class="muted small">${dataPl(m.data)}</span></summary><pre>${linki(m.tekst)}</pre></details>`).join('')}
  </section>`;
}

// Parametry z linku w mailu (?potwierdzenie=ok|blad) – komunikat na ekranie logowania
function obsluzParametryUrl() {
  const q = new URLSearchParams(location.search);
  // link z maila o nowej uwadze
  if (q.get('widok') === 'uwagi') {
    if (adminKS()) S.widok = 'uwagi';
    else { S.komunikatLogowania = 'Zaloguj się jako administrator, aby zobaczyć uwagi.'; S.poLogowaniu = 'uwagi'; S.widok = 'logowanie'; }
    history.replaceState(null, '', location.pathname);
    return;
  }
  if (!q.has('potwierdzenie')) return;
  if (q.get('potwierdzenie') === 'ok') {
    const oczekuje = q.get('status') === 'oczekuje';
    S.komunikatLogowania = oczekuje
      ? 'Adres e-mail potwierdzony. Konto czeka jeszcze na akceptację administratora.'
      : 'Adres e-mail potwierdzony – możesz się zalogować.';
    S.komunikatLogowaniaTyp = 'ok';
  } else {
    S.komunikatLogowania = q.get('komunikat') || 'Nie udało się potwierdzić adresu e-mail.';
    S.komunikatLogowaniaTyp = 'blad';
  }
  S.niepotwierdzony = null;
  S.widok = 'logowanie';
  history.replaceState(null, '', location.pathname);
}

// ---------- Powiadomienia ----------
function widokPowiadomienia() {
  if (!KONTO) return widokLogowanie();
  return `<section class="panel"><h1>Powiadomienia</h1>
    ${!POWIADOMIENIA.length ? '<p class="muted">Brak powiadomień.</p>' : POWIADOMIENIA.map(p => `<div class="zapytanie ${p.przeczytane ? '' : 'nowe'}">
      <b>${esc(p.tytul)}</b> <span class="small muted">${dataPl(p.data)}</span>
      <p style="margin:6px 0 0">${esc(p.tresc)}</p>
      ${p.kod ? `<button class="btn btn-sm" style="margin-top:6px" data-akcja="wycena-otworz" data-kod="${esc(p.kod)}">Otwórz wycenę ${esc(p.kod)}</button>` : ''}
      ${p.typ === 'akceptacja' && adminKS() ? '<button class="btn btn-sm" style="margin-top:6px" data-akcja="idz" data-widok="konta">Przejdź do akceptacji</button>' : ''}
      ${p.typ === 'uwaga' ? (adminKS() ? '<button class="btn btn-sm" style="margin-top:6px" data-akcja="idz" data-widok="uwagi">Przejdź do uwag</button>' : '<button class="btn btn-sm" style="margin-top:6px" data-akcja="uwaga-otworz">Moje uwagi</button>') : ''}
    </div>`).join('')}
  </section>`;
}

// ---------- Wycena w ofercie ----------
// Maksymalny rabat – reguly.json → rabatMaks (domyślnie 45%)
const rabatMaks = () => { const m = Number(typeof R !== 'undefined' && R && R.rabatMaks); return m >= 0 && m <= 100 && m ? m : 45; };
const rabatOferty = () => Math.max(0, Math.min(rabatMaks(), Number(S.oferta.rabat) || 0));

function wycenaDoOferty(w) {
  S.oferta = {
    projekt: w.projekt || '', klient: w.klient || '', zestawy: w.zestawy || [],
    kod: w.mozeEdytowac ? w.kod : null, kodZrodlowy: w.mozeEdytowac ? null : w.kod,
    rabat: w.rabat || 0, wlasciciel: w.wlasciciel, wlascicielNazwa: w.wlascicielNazwa
  };
}

async function zapiszWycene(cicho) {
  if (!KONTO || !S.oferta.zestawy.length) return null;
  try {
    const o = S.oferta;
    const w = await api('/api/wyceny', { method: 'POST', body: { kod: o.kod, oferta: { projekt: o.projekt, klient: o.klient, zestawy: o.zestawy, rabat: rabatOferty() } } });
    wycenaDoOferty(w);
    odswiezDane('wyceny-moje', 'wyceny-wszystkie');
    if (!cicho) toast(`Zapisano wycenę ${w.kod}`);
    zapisz();
    return w;
  } catch (e) { if (!cicho) toast(e.message); return null; }
}

// Zmiana w ofercie – bez automatycznego zapisu: oferta czeka na „Zapisz zmiany” (można z niej wyjść bez zapisywania)
function autoZapisz() {
  if (S.oferta.zestawy.length) S.oferta.zmieniona = true;
  zapisz();
}
// czy wychodząc z oferty, można coś stracić: niezapisana nowa oferta albo zmiany w zapisanej
const ofertaDoZapisania = () => S.oferta.zestawy.length > 0 && !S.oferta.kodZrodlowy && (!S.oferta.kod || !!S.oferta.zmieniona);

function panelWyceny() {
  if (!KONTO) {
    return `<div class="komunikat info" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <span>Zaloguj się, aby zapisać wycenę i otrzymać jej <b>kod</b>.</span>
      <span><button class="btn btn-sm" data-akcja="konto-logowanie">Zaloguj</button> <button class="btn btn-sm btn-primary" data-akcja="konto-rejestracja">Załóż konto</button></span></div>`;
  }
  const o = S.oferta;
  const kod = o.kod ? `<div class="kod-wyceny"><span class="small muted">Kod wyceny</span><b>${esc(o.kod)}</b><button class="btn-link small" data-akcja="kopiuj-kod">kopiuj</button></div>` : '';
  const zrodlo = o.kodZrodlowy ? `<p class="komunikat info">Otwarto wycenę <b>${esc(o.kodZrodlowy)}</b>${o.wlascicielNazwa ? ` (${esc(o.wlascicielNazwa)})` : ''} – tylko do odczytu. Zapis utworzy Twoją kopię z nowym kodem.</p>` : '';
  return `<div class="panel-wyceny">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      ${kod || '<span class="muted small">Wycena nie jest jeszcze zapisana.</span>'}
      <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${o.kod && o.zmieniona ? '<span class="plakietka pomaranczowa">Niezapisane zmiany</span>' : ''}
        <button class="btn btn-sm ${!o.kod || o.zmieniona ? 'btn-primary' : ''}" data-akcja="wycena-zapisz" ${o.zestawy.length && (!o.kod || o.zmieniona) ? '' : 'disabled'}>${o.kod ? (o.zmieniona ? 'Zapisz zmiany' : '✓ Zapisano') : 'Zapisz wycenę'}</button>
        ${o.zestawy.length ? '<button class="btn btn-sm" data-akcja="zamknij-oferte" title="Wyjście z oferty – z zapisem albo bez">Zamknij ofertę</button>' : ''}
      </span>
    </div>
    ${zrodlo}
  </div>`;
}

// ---------- Akcje ----------
// Zwraca true, gdy akcja została obsłużona (app.js wtedy renderuje), 'bez' – obsłużona bez renderu
async function akcjeKont(a, el) {
  switch (a) {
    case 'konto-logowanie': S.komunikatLogowania = null; S.komunikatLogowaniaTyp = null; S.niepotwierdzony = null; S.widok = 'logowanie'; return true;
    case 'poczta-zapisz': {
      const v = id => ($('#smtp-' + id) || {}).value;
      try { await api('/api/poczta', { method: 'POST', body: { host: v('host'), port: v('port'), secure: $('#smtp-secure').checked, user: v('user'), pass: v('pass'), nadawca: v('nadawca') } }); odswiezDane('poczta'); toast('Zapisano ustawienia poczty'); }
      catch (e) { toast(e.message); }
      return true;
    }
    case 'poczta-usun':
      if (!confirm('Usunąć ustawienia SMTP? Maile wrócą do skrzynki testowej.')) return 'bez';
      await api('/api/poczta', { method: 'POST', body: { usun: true } }); odswiezDane('poczta'); return true;
    case 'poczta-test':
      try { const r = await api('/api/poczta/test', { method: 'POST', body: { do: ($('#smtp-test') || {}).value } }); odswiezDane('poczta'); toast(r.tryb === 'smtp' ? 'Wysłano testowy e-mail' : 'Zapisano w skrzynce testowej (brak SMTP)'); }
      catch (e) { toast('Błąd wysyłki: ' + e.message); }
      return true;
    case 'poczta-wyczysc': await api('/api/poczta/skrzynka', { method: 'DELETE' }); odswiezDane('poczta'); return true;
    case 'konto-rejestracja': S.widok = 'rejestracja'; return true;
    case 'konto-wyslij-link': {
      const email = ($('#f-email') && $('#f-email').value) || S.niepotwierdzony;
      try { await api('/api/konto/wyslij-link', { method: 'POST', body: { email } }); toast(`Wysłano nowy link na ${email}`); }
      catch (e) { toast(e.message); }
      return 'bez';
    }
    case 'konto-potwierdz-email':
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { emailPotwierdzony: true } }); odswiezDane('konta'); toast('Potwierdzono adres e-mail'); }
      catch (e) { toast(e.message); }
      return true;
    case 'konto-zaloguj': {
      try {
        S.ostatniEmail = $('#f-email').value;
        const r = await fetch('/api/konto/logowanie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#f-email').value, haslo: $('#f-haslo').value }) });
        const j = await r.json();
        if (!r.ok) {
          if (j.kod === 'niepotwierdzony') { S.niepotwierdzony = $('#f-email').value.trim().toLowerCase(); S.komunikatLogowania = null; return true; }
          throw new Error(j.blad);
        }
        S.niepotwierdzony = null;
        await wczytajKonto(); odswiezWszystko();
        toast(`Witaj, ${j.konto.imie || j.konto.nazwa}!`);
        // „Zaloguj się i zapisz” z okna zamykania oferty – od razu zapisz ofertę gościa jako wycenę
        if (S.poLogowaniu === 'oferta' && S.oferta.zestawy.length && !S.oferta.kod) await zapiszWycene(false);
        S.widok = S.poLogowaniu || 'start'; S.poLogowaniu = null;
      } catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'konto-zarejestruj': {
      const r = S.rej || {};
      if (r.haslo !== r.haslo2) { toast('Hasła nie są takie same'); return 'bez'; }
      try {
        const j = await api('/api/konto/rejestracja', { method: 'POST', body: r });
        if (j.akceptacja) {
          // tryb bez poczty – konto aktywuje administrator
          S.komunikatLogowania = 'Konto założone. Musi je jeszcze zaakceptować administrator – po akceptacji zalogujesz się swoim e-mailem i hasłem.';
          S.komunikatLogowaniaTyp = 'ok';
          S.ostatniEmail = j.konto.email;
          S.widok = 'logowanie';
        } else if (!j.pierwsze) {
          // każde konto (poza pierwszym – administratorem) potwierdza adres e-mail przed logowaniem
          const dalej = ' Po potwierdzeniu adresu możesz się zalogować.';
          S.komunikatLogowania = j.mail && j.mail.wyslano === false
            ? `Konto założone, ale nie udało się wysłać wiadomości (${j.mail.blad}). Spróbuj „Wyślij link ponownie” albo skontaktuj się z administratorem.`
            : `Konto założone. Wysłaliśmy link potwierdzający na ${j.konto.email} – kliknij go, aby aktywować logowanie.${dalej}${j.mail && j.mail.tryb === 'skrzynka-testowa' ? ' (Tryb testowy: wiadomość jest w skrzynce testowej administratora w zakładce Dane.)' : ''}`;
          S.komunikatLogowaniaTyp = j.mail && j.mail.wyslano === false ? 'blad' : 'ok';
          S.ostatniEmail = j.konto.email;
          S.widok = 'logowanie';
        } else {
          await api('/api/konto/logowanie', { method: 'POST', body: { email: j.konto.email, haslo: r.haslo } });
          await wczytajKonto(); odswiezWszystko();
          toast(j.pierwsze ? 'Utworzono konto administratora' : 'Konto założone – witaj!');
          S.widok = 'start';
        }
        S.rej = {};
      } catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'konto-wyloguj':
      await api('/api/konto/wylogowanie', { method: 'POST' });
      KONTO = null; POWIADOMIENIA = []; odswiezWszystko();
      Object.assign(S.oferta, { kod: null, kodZrodlowy: null });
      if (['wyceny', 'konta', 'admin', 'uwagi', 'powiadomienia'].includes(S.widok)) S.widok = 'start';
      toast('Wylogowano'); return true;
    case 'wyceny-zakres': S.zakresWycen = el.dataset.wartosc; filtrWycen().autor = ''; return true;
    case 'wyceny-filtr-czysc': S.filtrWycen = { tekst: '', klient: '', autor: '' }; return true;
    case 'wycena-po-kodzie': case 'wycena-otworz': {
      const kod = (el.dataset.kod || ($('#kod-wyceny') && $('#kod-wyceny').value) || '').trim().toUpperCase();
      if (!kod) { toast('Wpisz kod wyceny'); return 'bez'; }
      if (!KONTO) { S.komunikatLogowania = `Zaloguj się, aby otworzyć wycenę ${kod}.`; S.poLogowaniu = 'wyceny'; S.widok = 'logowanie'; return true; }
      try { wycenaDoOferty(await api('/api/wyceny/' + encodeURIComponent(kod))); S.widok = 'oferta'; }
      catch (e) { toast(e.message); return 'bez'; }
      return true;
    }
    case 'wycena-usun':
      if (!confirm(`Usunąć wycenę ${el.dataset.kod}?`)) return 'bez';
      try { await api('/api/wyceny/' + encodeURIComponent(el.dataset.kod), { method: 'DELETE' }); if (S.oferta.kod === el.dataset.kod) S.oferta.kod = null; odswiezDane('wyceny-moje', 'wyceny-wszystkie'); toast('Usunięto wycenę'); }
      catch (e) { toast(e.message); }
      return true;
    case 'wycena-zapisz': await zapiszWycene(false); return true;
    case 'kopiuj-kod': try { await navigator.clipboard.writeText(S.oferta.kod); toast('Skopiowano kod ' + S.oferta.kod); } catch { window.prompt('Kod wyceny:', S.oferta.kod); } return 'bez';
    case 'konto-akceptuj':
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { status: 'aktywne' } }); odswiezDane('konta'); toast('Konto zaakceptowane – użytkownik dostał powiadomienie'); }
      catch (e) { toast(e.message); }
      return true;
    case 'konto-haslo': {
      const h = prompt(`Nowe hasło dla ${el.dataset.login} (min. 8 znaków):`);
      if (!h) return 'bez';
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { haslo: h } }); toast('Zmieniono hasło'); }
      catch (e) { toast(e.message); }
      return 'bez';
    }
    case 'konto-usun':
      if (!confirm(`Usunąć konto ${el.dataset.login}? Tej operacji nie można cofnąć.`)) return 'bez';
      try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'DELETE' }); odswiezDane('konta'); toast('Usunięto konto'); }
      catch (e) { toast(e.message); }
      return true;
  }
  return false;
}

// Zmiany w tabeli kont (status)
document.addEventListener('change', async e => {
  const el = e.target;
  if (!el.dataset) return;
  if (el.dataset.akcjaZmiana !== 'konto-zmien') return;
  const wartosc = el.type === 'checkbox' ? el.checked : el.value;
  try { await api('/api/konta/' + encodeURIComponent(el.dataset.login), { method: 'POST', body: { [el.dataset.poleKonta]: wartosc } }); toast('Zapisano'); }
  catch (err) { toast(err.message); }
  odswiezDane('konta');
  render();
});
