/* „Zgłoś uwagę” – okienko dla testerów i lista uwag dla administratora */
'use strict';

let NOWE_UWAGI = 0; // liczba nowych uwag (administrator) – z /api/konto
const TYPY_UWAG = { blad: 'Błąd', pomysl: 'Pomysł', pytanie: 'Pytanie', inne: 'Inne' };
const STATUSY_UWAG = { nowa: ['nowa', 'pomaranczowa'], 'w-trakcie': ['w trakcie', 'niebieska'], zrobione: ['zrobione', 'zielona'], odrzucone: ['odrzucone', 'czerwona'] };
const PODPOWIEDZI_UWAG = {
  blad: 'Co zrobiłeś(-aś), co się stało, a czego się spodziewałeś(-aś)? Np. „Po wybraniu KFR i 4 modułów K45 pasek pojemności pokazuje za dużo”.',
  pomysl: 'Czego brakuje albo co byłoby wygodniejsze?',
  pytanie: 'O co chcesz zapytać?',
  inne: 'Napisz, co myślisz.'
};
const MAX_ZRZUT_MB = 4;

// stan okienka (osobno od S – nie zapisuje się w przeglądarce)
const U = { otwarte: false, typ: 'blad', tekst: '', email: '', kontekst: true, zdjecie: null, wysylanie: false, wyslano: null, moje: null };

const plakietkaUwagi = s => { const [t, k] = STATUSY_UWAG[s] || [s, '']; return `<span class="plakietka ${k}">${esc(t)}</span>`; };

// Co widzi tester w chwili zgłoszenia – ułatwia odtworzenie błędu
function kontekstUwagi() {
  const k = {
    widok: S.widok, adres: location.pathname + location.search,
    ekran: `${innerWidth}×${innerHeight}`, przegladarka: navigator.userAgent, czas: new Date().toISOString(),
    cennik: (typeof META !== 'undefined' && META.cennik) || null
  };
  try { if (S.seria) k.konfiguracja = zestawZeStanu(S); } catch { k.konfiguracja = { seria: S.seria }; }
  if (S.opis) k.opisZapytania = String(S.opis).slice(0, 1500);
  if (S.oferta && S.oferta.zestawy.length) {
    k.oferta = { kod: S.oferta.kod || null, zestawy: S.oferta.zestawy.map(z => ({ nazwa: z.nazwa, seria: z.seria, liczba: z.liczba, pozycje: (z.pozycje || []).map(p => `${p.symbol} ×${p.ilosc}`) })) };
  }
  return k;
}

// ---------- Okienko ----------
function oknoUwagi() {
  if (!U.otwarte) return '';
  if (U.wyslano) return `<div class="uwaga-okno" role="dialog" aria-modal="true" aria-label="Zgłoś uwagę">
    <div class="uwaga-dzieki">
      <div class="uwaga-ok">✓</div>
      <h2>Dziękujemy!</h2>
      <p>Uwaga <b>#${U.wyslano}</b> dotarła do autora konfiguratora.${KONTO ? ' Odpowiedź zobaczysz w powiadomieniach 🔔.' : ''}</p>
      <div class="opcje" style="justify-content:center">
        <button class="btn" data-akcja="uwaga-kolejna">Zgłoś kolejną</button>
        <button class="btn btn-primary" data-akcja="uwaga-zamknij">Zamknij</button>
      </div>
    </div></div>`;

  return `<div class="uwaga-okno" role="dialog" aria-modal="true" aria-label="Zgłoś uwagę">
    <div class="uwaga-naglowek"><h2>Zgłoś uwagę</h2><button class="btn-link" data-akcja="uwaga-zamknij" aria-label="Zamknij">✕</button></div>
    <p class="muted small" style="margin:0 0 10px">Coś nie działa, czegoś brakuje albo masz pomysł? Napisz – trafi prosto do autora konfiguratora.</p>
    <div class="opcje uwaga-typy">${Object.entries(TYPY_UWAG).map(([k, n]) => opcjaAkcja('uwaga-typ', k, n, '', U.typ === k)).join('')}</div>
    <textarea id="uwaga-tekst" class="tekst" rows="5" data-uwaga-pole="tekst" placeholder="${esc(PODPOWIEDZI_UWAG[U.typ])}">${esc(U.tekst)}</textarea>
    ${U.zdjecie ? `<div class="uwaga-zrzut"><img src="data:${U.zdjecie.typ};base64,${U.zdjecie.dane}" alt="Zrzut ekranu"><span class="small">${esc(U.zdjecie.nazwa)} <span class="muted">(${Math.round(U.zdjecie.rozmiar / 1024)} kB)</span></span><button class="btn-link" data-akcja="uwaga-usun-zrzut" aria-label="Usuń zrzut">✕</button></div>`
      : `<div class="small muted uwaga-zrzut-dodaj">📷 <label class="btn-link">Dodaj zrzut ekranu<input type="file" accept="image/png,image/jpeg,image/webp" data-plik="uwaga" hidden></label> albo wklej go tutaj <kbd>Ctrl</kbd>+<kbd>V</kbd> (zrzut robisz klawiszami <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>)</div>`}
    ${KONTO ? '' : `<label class="pole" style="margin-top:8px">Twój e-mail <span class="muted small">(opcjonalnie – jeśli chcesz dostać odpowiedź)</span>
      <input class="tekst" type="email" data-uwaga-pole="email" value="${esc(U.email)}" placeholder="jan@firma.pl"></label>`}
    <label class="check" style="margin-top:8px"><input type="checkbox" data-uwaga-pole="kontekst" ${U.kontekst ? 'checked' : ''}><span class="small">Dołącz, na którym ekranie jestem i co mam skonfigurowane (pomaga znaleźć błąd)</span></label>
    <div class="uwaga-akcje">
      <button class="btn" data-akcja="uwaga-zamknij">Anuluj</button>
      <button class="btn btn-primary" data-akcja="uwaga-wyslij" ${U.wysylanie ? 'disabled' : ''}>${U.wysylanie ? '<span class="spinner"></span> Wysyłanie…' : 'Wyślij uwagę'}</button>
    </div>
    <div id="uwaga-moje">${mojeUwagiHtml()}</div>
  </div>`;
}

// Wcześniejsze uwagi zalogowanego testera ze statusem i odpowiedzią
function mojeUwagiHtml() {
  if (!KONTO || !U.moje || !U.moje.length) return '';
  return `<details class="uwaga-moje"><summary>Twoje wcześniejsze uwagi (${U.moje.length})</summary>
    ${U.moje.map(m => `<div class="uwaga-moja"><div class="small"><b>#${m.numer}</b> · ${esc(TYPY_UWAG[m.typ] || m.typ)} · ${dataPl(m.data)} ${plakietkaUwagi(m.status)}</div>
      <div class="small">${esc(m.tekst.length > 160 ? m.tekst.slice(0, 160) + '…' : m.tekst)}</div>
      ${m.odpowiedz ? `<div class="small uwaga-odp"><b>Odpowiedź:</b> ${esc(m.odpowiedz)}</div>` : ''}</div>`).join('')}
  </details>`;
}

function renderUwagi() {
  const el = $('#uwaga');
  el.innerHTML = U.otwarte ? `<div class="uwaga-tlo" id="uwaga-tlo">${oknoUwagi()}</div>` : '';
  document.body.classList.toggle('bez-przewijania', U.otwarte);
}

function otworzUwagi() {
  U.otwarte = true; U.wyslano = null;
  renderUwagi();
  setTimeout(() => { const t = $('#uwaga-tekst'); if (t) t.focus(); }, 0);
  if (KONTO) api('/api/uwagi/moje').then(m => { U.moje = m; const el = $('#uwaga-moje'); if (el) el.innerHTML = mojeUwagiHtml(); }).catch(() => {});
}
function zamknijUwagi() { U.otwarte = false; U.wyslano = null; renderUwagi(); }
function zachowajTekst() { const t = $('#uwaga-tekst'); if (t) U.tekst = t.value; }

function dodajZrzut(plik) {
  if (!plik) return;
  if (!/^image\/(png|jpeg|webp)$/.test(plik.type)) { toast('Zrzut ekranu musi być obrazkiem PNG, JPG lub WEBP'); return; }
  if (plik.size > MAX_ZRZUT_MB * 1024 * 1024) { toast(`Zrzut ekranu jest za duży (max ${MAX_ZRZUT_MB} MB)`); return; }
  const r = new FileReader();
  r.onload = () => { zachowajTekst(); U.zdjecie = { nazwa: plik.name || 'zrzut-ekranu.png', typ: plik.type, dane: String(r.result).split(',')[1], rozmiar: plik.size }; renderUwagi(); };
  r.readAsDataURL(plik);
}

async function wyslijUwage() {
  zachowajTekst();
  if (U.tekst.trim().length < 3) { toast('Opisz uwagę – choć kilka słów'); return; }
  U.wysylanie = true; renderUwagi();
  try {
    const j = await api('/api/uwagi', { method: 'POST', body: {
      typ: U.typ, tekst: U.tekst, email: U.email,
      kontekst: U.kontekst ? kontekstUwagi() : null,
      zdjecie: U.zdjecie ? { typ: U.zdjecie.typ, dane: U.zdjecie.dane } : null
    } });
    Object.assign(U, { tekst: '', zdjecie: null, wyslano: j.numer, moje: null });
    if (adminKS()) { await wczytajKonto(); odswiezDane('uwagi'); render(); }
  } catch (e) { toast(e.message); }
  U.wysylanie = false;
  renderUwagi();
}

// ---------- Lista uwag (administrator) ----------
function widokUwagi() {
  if (!adminKS()) return widokLogowanie();
  const wszystkie = daneWidoku('uwagi', '/api/uwagi');
  if (!wszystkie) return `<section class="panel"><h1>Uwagi testerów</h1>${ladowanieHtml}</section>`;
  const filtr = S.filtrUwag || 'otwarte';
  const pasuje = u => filtr === 'wszystkie' || (filtr === 'otwarte' ? ['nowa', 'w-trakcie'].includes(u.status) : u.status === filtr);
  const ile = f => wszystkie.filter(u => f === 'wszystkie' || (f === 'otwarte' ? ['nowa', 'w-trakcie'].includes(u.status) : u.status === f)).length;
  const widoczne = wszystkie.filter(pasuje);
  const autor = u => u.autor.gosc ? `gość${u.autor.email ? ` · <a href="mailto:${esc(u.autor.email)}">${esc(u.autor.email)}</a>` : ''}` : `${esc(u.autor.nazwa)} <span class="muted">(${esc(u.autor.rola)})</span> · <a href="mailto:${esc(u.autor.login)}">${esc(u.autor.login)}</a>`;
  const kontekst = k => {
    if (!k) return '';
    const kfg = k.konfiguracja && k.konfiguracja.pozycje ? `<div><b>Konfiguracja:</b> ${esc(k.konfiguracja.nazwa || k.konfiguracja.seria)} – ${k.konfiguracja.pozycje.map(p => esc(`${p.symbol} ×${p.ilosc}`)).join(', ')}</div>` : '';
    const of = k.oferta ? `<div><b>Oferta${k.oferta.kod ? ' ' + esc(k.oferta.kod) : ''}:</b> ${k.oferta.zestawy.map(z => esc(z.nazwa)).join('; ')}</div>` : '';
    return `<details class="uwaga-kontekst"><summary class="small">Kontekst: ekran „${esc(k.widok)}”, ${esc(k.ekran || '')}</summary>
      <div class="small">${kfg}${of}<div class="muted">${esc(k.przegladarka || '')}</div></div>
      <pre>${esc(JSON.stringify(k, null, 1))}</pre></details>`;
  };
  const karta = u => `<div class="uwaga-karta ${u.status === 'nowa' ? 'nowe' : ''}">
    <div class="uwaga-karta-gora">
      <div><b>#${u.numer}</b> <span class="plakietka ${u.typ === 'blad' ? 'czerwona' : u.typ === 'pomysl' ? 'niebieska' : ''}">${esc(TYPY_UWAG[u.typ] || u.typ)}</span>
        <span class="small muted">${dataPl(u.data)}</span><div class="small">${autor(u)}</div></div>
      <div class="uwaga-karta-akcje">
        <select class="kolor-select" data-akcja-zmiana="uwaga-status" data-id="${esc(u.id)}">${Object.entries(STATUSY_UWAG).map(([s, [n]]) => `<option value="${s}" ${u.status === s ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button class="btn btn-sm" data-akcja="uwaga-usun" data-id="${esc(u.id)}" data-numer="${u.numer}">Usuń</button>
      </div>
    </div>
    <p class="uwaga-tresc">${esc(u.tekst)}</p>
    ${u.zdjecie ? `<a href="/api/uwagi/${esc(u.id)}/zdjecie" target="_blank" rel="noopener"><img class="uwaga-miniatura" src="/api/uwagi/${esc(u.id)}/zdjecie" alt="Zrzut ekranu do uwagi #${u.numer}" loading="lazy"></a>` : ''}
    ${kontekst(u.kontekst)}
    <div class="uwaga-odpowiedz">
      <textarea class="tekst" rows="2" id="odp-${esc(u.id)}" placeholder="${u.autor.login ? 'Odpowiedź dla testera (zobaczy ją w powiadomieniach)' : 'Notatka (gość nie ma konta – odpowiedz mailem)'}">${esc(u.autor.login ? u.odpowiedz : (u.notatka || ''))}</textarea>
      <button class="btn btn-sm" data-akcja="uwaga-odpowiedz" data-id="${esc(u.id)}" data-rodzaj="${u.autor.login ? 'odpowiedz' : 'notatka'}">${u.autor.login ? 'Wyślij odpowiedź' : 'Zapisz notatkę'}</button>
    </div>
  </div>`;
  return `<section class="panel">
    <div class="uwagi-naglowek"><h1>Uwagi testerów</h1>
      <div class="opcje">
        <button class="btn btn-sm btn-primary" data-akcja="uwagi-kopiuj" title="Zestawienie otwartych uwag w formacie Markdown">Kopiuj zestawienie</button>
        <a class="btn btn-sm" href="/api/uwagi/eksport.md?wszystkie=1" download="uwagi-konfigurator.md">Pobierz wszystkie (.md)</a>
      </div></div>
    <div class="opcje" style="margin:10px 0">${[['otwarte', 'Otwarte'], ['nowa', 'Nowe'], ['w-trakcie', 'W trakcie'], ['zrobione', 'Zrobione'], ['odrzucone', 'Odrzucone'], ['wszystkie', 'Wszystkie']]
      .map(([f, n]) => opcjaAkcja('uwagi-filtr', f, n, String(ile(f)), filtr === f)).join('')}</div>
    ${widoczne.length ? widoczne.map(karta).join('') : `<p class="muted">${wszystkie.length ? 'Brak uwag w tym filtrze.' : 'Nikt jeszcze nie zgłosił uwagi. Testerzy widzą przycisk „Zgłoś uwagę” w prawym dolnym rogu.'}</p>`}
  </section>`;
}

// ---------- Akcje (wywoływane z app.js) ----------
async function akcjeUwag(a, el) {
  switch (a) {
    case 'uwaga-otworz': otworzUwagi(); return 'bez';
    case 'uwaga-zamknij': zachowajTekst(); zamknijUwagi(); return 'bez';
    case 'uwaga-kolejna': U.wyslano = null; U.typ = 'blad'; renderUwagi(); return 'bez';
    case 'uwaga-typ': zachowajTekst(); U.typ = el.dataset.wartosc; renderUwagi(); return 'bez';
    case 'uwaga-usun-zrzut': zachowajTekst(); U.zdjecie = null; renderUwagi(); return 'bez';
    case 'uwaga-wyslij': await wyslijUwage(); return 'bez';
    case 'uwagi-filtr': S.filtrUwag = el.dataset.wartosc; return true;
    case 'uwagi-kopiuj': {
      try {
        const r = await fetch('/api/uwagi/eksport.md');
        const md = await r.text();
        await navigator.clipboard.writeText(md);
        toast('Skopiowano zestawienie otwartych uwag');
      } catch (e) { toast('Nie udało się skopiować: ' + e.message); }
      return 'bez';
    }
    case 'uwaga-odpowiedz': {
      const pole = el.dataset.rodzaj, wartosc = ($('#odp-' + el.dataset.id) || {}).value || '';
      try { await api('/api/uwagi/' + el.dataset.id, { method: 'POST', body: { [pole]: wartosc } }); toast(pole === 'odpowiedz' ? 'Odpowiedź wysłana' : 'Zapisano notatkę'); }
      catch (e) { toast(e.message); }
      odswiezDane('uwagi');
      return true;
    }
    case 'uwaga-usun': {
      if (!confirm(`Usunąć uwagę #${el.dataset.numer}? Tego nie da się cofnąć.`)) return 'bez';
      try { await api('/api/uwagi/' + el.dataset.id, { method: 'DELETE' }); toast('Usunięto'); } catch (e) { toast(e.message); }
      odswiezDane('uwagi'); await wczytajKonto();
      return true;
    }
  }
  return false;
}

// ---------- Zdarzenia okienka ----------
document.addEventListener('input', e => {
  const p = e.target.dataset && e.target.dataset.uwagaPole;
  if (p === 'tekst' || p === 'email') U[p] = e.target.value;
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset && el.dataset.uwagaPole === 'kontekst') { U.kontekst = el.checked; return; }
  if (el.dataset && el.dataset.akcjaZmiana === 'uwaga-status') {
    try { await api('/api/uwagi/' + el.dataset.id, { method: 'POST', body: { status: el.value } }); toast('Zmieniono status'); }
    catch (err) { toast(err.message); }
    odswiezDane('uwagi'); await wczytajKonto(); render();
  }
});
// Wklejenie zrzutu ekranu (Ctrl+V) w otwartym okienku
document.addEventListener('paste', e => {
  if (!U.otwarte || U.wyslano) return;
  const obraz = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
  if (!obraz) return;
  e.preventDefault();
  dodajZrzut(obraz.getAsFile());
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && U.otwarte) { zachowajTekst(); zamknijUwagi(); } });
document.addEventListener('mousedown', e => { if (e.target.id === 'uwaga-tlo') { zachowajTekst(); zamknijUwagi(); } });
