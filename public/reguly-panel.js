/* Panel Dane → Reguły doboru: pobieranie, wgrywanie (ze sprawdzeniem i podglądem zmian), historia kopii */
'use strict';

// wgrywany plik czeka tu między „sprawdź” a „zastosuj”
const RG = { plik: null, tekst: null, ocena: null, zAktualizacji: false, trwa: false };

const dataGodz = d => d ? new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function sekcjaRegul() {
  const st = daneWidoku('reguly-stan', '/api/reguly/stan');
  if (!st) return `<section class="panel"><h2>Reguły doboru</h2>${ladowanieHtml}</section>`;

  const zrodlo = st.wgrano
    ? `wgrane w panelu ${dataGodz(st.wgrano)}${st.wgral ? ` przez ${esc(st.wgral)}` : ''}`
    : 'dostarczone z aplikacją';
  const aktualizacja = st.zAktualizacji ? `<div class="komunikat">
      <b>Aktualizacja aplikacji zawiera nową wersję reguł${st.zAktualizacji.wersja ? ` (${esc(st.zAktualizacji.wersja)})` : ''}.</b>
      Teraz działają reguły wgrane przez Ciebie – nowe czekają na Twoją decyzję.
      <div class="opcje" style="margin-top:8px">
        <button class="btn btn-sm btn-primary" data-akcja="reguly-aktualizacja-pokaz">Pokaż zmiany</button>
        <a class="btn btn-sm" href="/api/reguly/aktualizacja/plik" download>Pobierz nowe</a>
        <button class="btn btn-sm" data-akcja="reguly-aktualizacja-odrzuc">Zostaw moje</button>
      </div></div>` : '';

  return `<section class="panel">
    <h2>Reguły doboru</h2>
    <p class="muted" style="margin:0 0 10px">Serie, zakresy wysokości, wielkości puszek, rekomendacje kreatora, zamienniki SF → KFR i lista modułów K45 – plik <code>reguly.json</code>.
      Obecne reguły: <b>${esc(st.wersja || 'bez numeru wersji')}</b>, ${zrodlo}.</p>
    ${aktualizacja}
    <div class="opcje" style="margin-bottom:12px">
      <a class="btn btn-sm" href="/api/reguly/plik" download>⬇ Pobierz obecne reguły (.json)</a>
    </div>
    <p class="small muted" style="margin:0 0 6px">Aby zmienić reguły: pobierz plik, popraw go (np. w Notatniku) i wgraj poniżej. Najpierw pokażemy błędy i listę zmian – nic się nie zmieni, dopóki nie klikniesz „Zastosuj”.</p>
    <div class="upload" data-upload="reguly"><p>Przeciągnij plik reguł (.json) tutaj lub</p><input type="file" accept=".json,application/json" data-plik="reguly"></div>
    ${ocenaHtml()}
    ${historiaHtml(st.kopie)}
  </section>`;
}

function ocenaHtml() {
  const o = RG.ocena;
  if (!o) return '';
  const tytul = RG.zAktualizacji ? 'Nowe reguły z aktualizacji' : `Plik: ${esc(RG.plik)}`;
  const bledy = o.bledy.length ? `<div class="komunikat blad"><b>Błędy (${o.bledy.length}) – pliku nie można wgrać:</b><ul class="powody">${o.bledy.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '';
  const ostrz = o.ostrzezenia.length ? `<details class="komunikat"><summary><b>Ostrzeżenia (${o.ostrzezenia.length})</b> – można wgrać, ale sprawdź</summary><ul class="powody">${o.ostrzezenia.map(b => `<li>${esc(b)}</li>`).join('')}</ul></details>` : '';
  const zmiany = !o.bledy.length ? (o.zmiany.length
    ? `<h3 style="margin:12px 0 6px">Co się zmieni (${o.zmiany.length})</h3>
       <div style="overflow-x:auto;max-height:360px"><table class="tabela reguly-zmiany"><thead><tr><th>Miejsce w pliku</th><th>Teraz</th><th>Po wgraniu</th></tr></thead>
       <tbody>${o.zmiany.map(z => `<tr><td><code>${esc(z.sciezka)}</code></td><td class="small">${esc(z.przed)}</td><td class="small"><b>${esc(z.po)}</b></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="komunikat info">Plik jest taki sam jak obecne reguły – nic się nie zmieni.</p>') : '';
  const mozna = !o.bledy.length && o.zmiany.length;
  return `<div class="reguly-ocena">
    <h3 style="margin:14px 0 6px">${tytul}${o.wersja ? ` <span class="muted small">wersja ${esc(o.wersja)}</span>` : ''}</h3>
    ${!o.bledy.length ? '<p class="komunikat ok" style="margin:0 0 8px">Plik przeszedł sprawdzenie.</p>' : ''}
    ${bledy}${ostrz}${zmiany}
    <div class="opcje" style="margin-top:10px">
      ${mozna ? `<button class="btn btn-primary" data-akcja="reguly-zastosuj" ${RG.trwa ? 'disabled' : ''}>Zastosuj reguły</button>` : ''}
      <button class="btn" data-akcja="reguly-anuluj">${mozna ? 'Anuluj' : 'Zamknij'}</button>
    </div>
  </div>`;
}

function historiaHtml(kopie) {
  if (!kopie || !kopie.length) return '';
  return `<details class="reguly-historia" style="margin-top:14px"><summary><b>Poprzednie wersje (${kopie.length})</b> – kopia zapisuje się przy każdej zmianie</summary>
    <table class="tabela"><tbody>${kopie.map(k => `<tr>
      <td class="small">${dataGodz(k.data)}</td>
      <td class="small">${esc(k.wersja || '')}${k.wgrano ? ` · wgrane ${dataGodz(k.wgrano)}${k.wgral ? ' przez ' + esc(k.wgral) : ''}` : ' · z aplikacji'}<div class="muted">${esc(k.powod)}</div></td>
      <td class="num"><a class="btn btn-sm" href="/api/reguly/kopie/${encodeURIComponent(k.nazwa)}" download>Pobierz</a>
        <button class="btn btn-sm" data-akcja="reguly-przywroc" data-nazwa="${esc(k.nazwa)}">Przywróć</button></td></tr>`).join('')}</tbody></table>
  </details>`;
}

async function wczytajPlikRegul(plik) {
  if (!plik) return;
  if (plik.size > 5 * 1024 * 1024) { toast('Plik reguł jest za duży'); return; }
  RG.plik = plik.name; RG.tekst = await plik.text(); RG.zAktualizacji = false;
  await ocenRegul({ tekst: RG.tekst });
}

async function ocenRegul(body) {
  try { RG.ocena = await api('/api/reguly/sprawdz', { method: 'POST', body }); }
  catch (e) { RG.ocena = { bledy: [e.message], ostrzezenia: [], zmiany: [] }; }
  render();
  const el = document.querySelector('.reguly-ocena');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function poZmianieRegul(komunikat) {
  Object.assign(RG, { plik: null, tekst: null, ocena: null, zAktualizacji: false, trwa: false });
  odswiezDane('reguly-stan');
  await wczytajDane(); // nowe reguły działają od razu w tej karcie
  toast(komunikat);
}

async function akcjeRegul(a, el) {
  switch (a) {
    case 'reguly-anuluj': Object.assign(RG, { plik: null, tekst: null, ocena: null, zAktualizacji: false }); return true;
    case 'reguly-zastosuj': {
      RG.trwa = true; render();
      try {
        if (RG.zAktualizacji) await api('/api/reguly/aktualizacja', { method: 'POST' });
        else await api('/api/reguly', { method: 'POST', body: { tekst: RG.tekst } });
        await poZmianieRegul('Nowe reguły działają – pozostali zobaczą je po odświeżeniu strony');
      } catch (e) { RG.trwa = false; toast(e.message); }
      return true;
    }
    case 'reguly-aktualizacja-pokaz': RG.plik = null; RG.zAktualizacji = true; await ocenRegul({ zAktualizacji: true }); return 'bez';
    case 'reguly-aktualizacja-odrzuc':
      if (!confirm('Zostawić obecne reguły i odrzucić wersję z aktualizacji?')) return 'bez';
      await api('/api/reguly/aktualizacja', { method: 'DELETE' }).catch(e => toast(e.message));
      odswiezDane('reguly-stan');
      return true;
    case 'reguly-przywroc':
      if (!confirm('Przywrócić tę wersję reguł? Obecne reguły zostaną zapisane jako kopia.')) return 'bez';
      try { await api('/api/reguly/przywroc', { method: 'POST', body: { nazwa: el.dataset.nazwa } }); await poZmianieRegul('Przywrócono poprzednią wersję reguł'); }
      catch (e) { toast(e.message); }
      return true;
  }
  return false;
}
