// Reguły doboru (data/reguly.json): sprawdzanie, wgrywanie z panelu Dane, kopie i przywracanie
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const PLIK = path.join(DATA, 'reguly.json');
const KOPIE = path.join(DATA, 'reguly-kopie');
const Z_AKTUALIZACJI = path.join(DATA, 'reguly-z-aktualizacji.json'); // nowsze reguły z paczki, gdy działają wgrane w panelu

// serie, dla których konfigurator ma logikę – nie można ich usunąć ani dodać nowych samym plikiem
const SERIE = ['KFR', 'KGH', 'KGT', 'FB', 'KFP'];
const PODLOGI = ['wylewka', 'techniczna'];

const czytajJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const obecne = () => czytajJson(PLIK) || {};
function blad(t, status = 400) { const e = new Error(t); e.status = status; return e; }

// ---------- Sprawdzenie ----------
function sprawdz(R, produkty) {
  const bledy = [], ostrzezenia = [];
  const B = t => bledy.push(t), O = t => ostrzezenia.push(t);
  const obiekt = v => v && typeof v === 'object' && !Array.isArray(v);
  const liczba = v => typeof v === 'number' && isFinite(v);
  const para = v => Array.isArray(v) && v.length === 2 && v.every(liczba) && v[0] <= v[1];
  const listaSerii = (v, gdzie) => {
    if (!Array.isArray(v) || !v.length) return B(`${gdzie}: potrzebna lista serii, np. ["KFR"]`);
    v.filter(id => !SERIE.includes(id)).forEach(id => B(`${gdzie}: nieznana seria „${id}” (dozwolone: ${SERIE.join(', ')})`));
  };

  if (!obiekt(R)) return { bledy: ['Plik nie zawiera obiektu JSON z regułami.'], ostrzezenia };
  if (!liczba(R.vat) || R.vat < 0 || R.vat > 1) B('vat: podaj ułamek, np. 0.23');
  if (!obiekt(R.serie)) B('Brak sekcji „serie”.');
  else {
    SERIE.filter(id => !R.serie[id]).forEach(id => B(`serie: brak serii ${id} – konfigurator jej potrzebuje`));
    Object.keys(R.serie).filter(id => !SERIE.includes(id)).forEach(id => B(`serie: nowa seria „${id}” – konfigurator nie ma dla niej logiki (dodanie serii wymaga zmiany programu)`));
    for (const id of SERIE) {
      const s = R.serie[id];
      if (!obiekt(s)) continue;
      const g = `serie.${id}`;
      if (!Array.isArray(s.podlogi) || !s.podlogi.length || s.podlogi.some(p => !PODLOGI.includes(p))) B(`${g}.podlogi: lista z „wylewka” i/lub „techniczna”`);
      else s.podlogi.forEach(p => { if (!s.wysokosc || !para(s.wysokosc[p])) B(`${g}.wysokosc.${p}: zakres [od, do] w mm`); });
      if (!para(s.moduly)) B(`${g}.moduly: zakres [min, max] modułów K45`);
      if (!Array.isArray(s.rozmiary) || !s.rozmiary.length) B(`${g}.rozmiary: brak wielkości puszek`);
      else s.rozmiary.forEach((r, i) => { if (!liczba(r.k45)) B(`${g}.rozmiary[${i}].k45: liczba modułów`); });
      if (!obiekt(s.kolory) || !Object.keys(s.kolory).length) B(`${g}.kolory: brak kolorów`);
      if (!obiekt(s.wykonczenie)) B(`${g}.wykonczenie: brak opisu wykończenia pokrywy`);
      if (typeof s.zamek !== 'boolean') B(`${g}.zamek: true lub false`);
      if (typeof s.nazwa !== 'string' || typeof s.podtytul !== 'string') B(`${g}: brak nazwy lub podtytułu`);
    }
  }
  listaSerii(R.rekomendowane, 'rekomendowane');
  listaSerii(R.rekomendowaneMokre, 'rekomendowaneMokre');

  const RK = R.rekomendacjeKreatora;
  if (!obiekt(RK)) B('Brak sekcji „rekomendacjeKreatora”.');
  else {
    listaSerii(RK.podloga, 'rekomendacjeKreatora.podloga');
    listaSerii(RK.zamek, 'rekomendacjeKreatora.zamek');
    if (!obiekt(RK.wykonczenie)) B('rekomendacjeKreatora.wykonczenie: brak');
    else {
      Object.keys(RK.wykonczenie).filter(k => !['cienkie', '12', 'grube'].includes(k)).forEach(k => B(`rekomendacjeKreatora.wykonczenie: nieznana grubość „${k}” (dozwolone: cienkie = 5 mm, 12, grube = 20 mm)`));
      for (const [k, v] of Object.entries(RK.wykonczenie)) listaSerii(v, `rekomendacjeKreatora.wykonczenie.${k}`);
    }
    if (!obiekt(RK.miejsce)) B('rekomendacjeKreatora.miejsce: brak');
    else {
      Object.keys(RK.miejsce).filter(k => !['mokre', 'zewnatrz', 'suche'].includes(k)).forEach(k => B(`rekomendacjeKreatora.miejsce: nieznane miejsce „${k}”`));
      for (const [k, v] of Object.entries(RK.miejsce)) listaSerii(v, `rekomendacjeKreatora.miejsce.${k}`);
    }
  }

  const M = R.moduly;
  if (!obiekt(M) || !Array.isArray(M.lista) || !Array.isArray(M.grupy) || !obiekt(M.kolory)) B('moduly: potrzebne „grupy”, „lista” i „kolory”');
  else {
    const grupy = M.grupy.map(g => g.id), ids = new Set();
    M.lista.forEach((m, i) => {
      const g = `moduly.lista[${i}]${m && m.id ? ` (${m.id})` : ''}`;
      if (!m || !m.id || !m.baza || !m.nazwa) return B(`${g}: potrzebne id, baza i nazwa`);
      if (ids.has(m.id)) B(`${g}: powtórzone id`);
      ids.add(m.id);
      if (!grupy.includes(m.grupa)) B(`${g}: nieznana grupa „${m.grupa}”`);
      if (![0.5, 1].includes(m.szer)) B(`${g}.szer: 1 (45×45) albo 0.5 (22,5×45)`);
    });
    M.lista.filter(m => m && m.zaslepkaPolowki && !ids.has(m.zaslepkaPolowki)).forEach(m => B(`moduly.lista (${m.id}): zaslepkaPolowki wskazuje nieistniejący moduł „${m.zaslepkaPolowki}”`));
  }

  if (R.keystone && (!obiekt(R.keystone.opcje) || !R.keystone.opcje[R.keystone.domyslny])) B('keystone: domyślny wkład musi być na liście „opcje”');
  if (R.zamienniki && Object.entries(R.zamienniki).some(([k, v]) => !k.startsWith('_') && typeof v !== 'string')) B('zamienniki: każdy zamiennik to tekst, np. "SF370/1": "KF670/1"');

  if (produkty && !bledy.length) sprawdzSymbole(R, produkty).forEach(s => O(`brak w cenniku: ${s}`));
  return { bledy, ostrzezenia };
}

// Symbole z reguł, których nie ma w cenniku (także: npm run sprawdz)
function sprawdzSymbole(R, produkty) {
  const braki = [];
  const ok = s => { if (s && !produkty[s]) braki.push(s); };
  const kfr = R.serie.KFR;
  for (const r of kfr.rozmiary) {
    for (const g of Object.keys(r.puszka || {})) for (const k of Object.keys(kfr.kolory)) ok(r.puszka[g] + k);
    for (const g of Object.keys(r.puszkaS500 || {})) for (const k of ['-035', '-038']) ok(r.puszkaS500[g] + k);
    ok(r.kasetaTworzywo); ok(r.kasetaMetal);
    if (r.nakladka) for (const k of Object.keys(kfr.kolory)) ok(r.nakladka + k);
    ok(r.nakladkaInox);
  }
  for (const r of R.serie.KGH.rozmiary) { ok(r.puszka); ok(r.pokrywa); }
  for (const r of R.serie.KGT.rozmiary) for (const p of Object.values(r.puszka || {})) for (const k of Object.keys(R.serie.KGT.kolory)) ok(p + k);
  const fb = R.serie.FB;
  for (const r of fb.rozmiary) { Object.values(r.puszka || {}).forEach(ok); Object.keys(r.kasety || {}).forEach(ok); ok(r.szalunek); }
  [fb.ramkaK45, fb.ramkaS500, fb.oslona, fb.stopki].forEach(ok);
  for (const r of R.serie.KFP.rozmiary) { ok(r.puszka); ok(r.kaseta); ok(r.nakladka); }
  for (const m of R.moduly.lista) {
    const kol = Object.keys(produkty).filter(s => s.startsWith(m.baza + '/')).map(s => s.slice(m.baza.length));
    if (!kol.length) braki.push(m.baza + ' (moduł)');
    else if (!kol.includes(m.kolor)) braki.push(`${m.baza}${m.kolor} (domyślny kolor; dostępne: ${kol.join(' ')})`);
  }
  return [...new Set(braki)];
}

// ---------- Różnice (co się zmieni) ----------
function roznice(a, b, sciezka = '', wynik = []) {
  const krotko = v => { const s = v === undefined ? '—' : JSON.stringify(v); return s.length > 90 ? s.slice(0, 87) + '…' : s; };
  const zwykla = v => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every(x => x === null || typeof x !== 'object'));
  if (JSON.stringify(a) === JSON.stringify(b)) return wynik;
  if (zwykla(a) || zwykla(b) || Array.isArray(a) !== Array.isArray(b)) {
    wynik.push({ sciezka: sciezka || '(całość)', przed: krotko(a), po: krotko(b) });
    return wynik;
  }
  const klucze = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !String(k).startsWith('_'));
  for (const k of klucze) roznice(a[k], b[k], Array.isArray(a) ? `${sciezka}[${k}]` : (sciezka ? `${sciezka}.${k}` : k), wynik);
  return wynik;
}

// ---------- Wgrywanie, kopie, przywracanie ----------
function parsuj(tekst) {
  try { return JSON.parse(String(tekst || '').replace(/^﻿/, '')); }
  catch (e) { throw blad(`To nie jest poprawny plik JSON: ${e.message}`); }
}

function ocen(tekst, produkty) {
  const R = parsuj(tekst);
  const { bledy, ostrzezenia } = sprawdz(R, produkty);
  const zmiany = bledy.length ? [] : roznice(obecne(), R);
  return { R, bledy, ostrzezenia, zmiany, wersja: R._wersja || null };
}

function zrobKopie(opis) {
  if (!fs.existsSync(PLIK)) return;
  fs.mkdirSync(KOPIE, { recursive: true });
  const R = obecne();
  const nazwa = `reguly-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(KOPIE, nazwa), JSON.stringify({ ...R, _kopia: { data: new Date().toISOString(), powod: opis } }, null, 1));
  // zostaw 30 ostatnich kopii
  fs.readdirSync(KOPIE).filter(f => f.endsWith('.json')).sort().slice(0, -30).forEach(f => fs.rmSync(path.join(KOPIE, f), { force: true }));
}

function zapiszNowe(R, konto, powod) {
  const bazowa = obecne()._wersja || null;
  zrobKopie(powod);
  const { _kopia, ...czyste } = R;
  // _wersja = wersja reguł z aplikacji, na której oparto plik (do porównania przy aktualizacji serwera)
  const zapis = { ...czyste, _wersja: czyste._wersja || bazowa, _wgrano: new Date().toISOString(), _wgral: konto ? konto.login : null };
  fs.writeFileSync(PLIK, JSON.stringify(zapis, null, 2));
  return zapis;
}

function wgraj(tekst, produkty, konto) {
  const o = ocen(tekst, produkty);
  if (o.bledy.length) throw Object.assign(blad('Plik ma błędy – popraw je przed wgraniem.'), { bledy: o.bledy });
  zapiszNowe(o.R, konto, 'przed wgraniem nowego pliku');
  // wgrane ręcznie reguły zastępują też oczekujące reguły z aktualizacji
  fs.rmSync(Z_AKTUALIZACJI, { force: true });
  return o;
}

const bezpiecznaKopia = nazwa => {
  if (!/^reguly-[\w-]+\.json$/.test(String(nazwa))) throw blad('Nieprawidłowa nazwa kopii.');
  const p = path.join(KOPIE, nazwa);
  if (!fs.existsSync(p)) throw blad('Nie ma takiej kopii.', 404);
  return p;
};

function kopie() {
  if (!fs.existsSync(KOPIE)) return [];
  return fs.readdirSync(KOPIE).filter(f => f.endsWith('.json')).sort().reverse().map(nazwa => {
    const R = czytajJson(path.join(KOPIE, nazwa)) || {};
    return { nazwa, data: (R._kopia && R._kopia.data) || null, powod: (R._kopia && R._kopia.powod) || '', wersja: R._wersja || null, wgral: R._wgral || null, wgrano: R._wgrano || null };
  });
}

function przywroc(nazwa, produkty, konto) {
  const R = czytajJson(bezpiecznaKopia(nazwa));
  if (!R) throw blad('Kopia jest uszkodzona.');
  const { bledy } = sprawdz(R, null);
  if (bledy.length) throw Object.assign(blad('Ta kopia nie przechodzi sprawdzenia.'), { bledy });
  return zapiszNowe(R, konto, `przed przywróceniem kopii ${nazwa}`);
}

function stan() {
  const R = obecne();
  const nowe = czytajJson(Z_AKTUALIZACJI);
  return {
    wersja: R._wersja || null, wgrano: R._wgrano || null, wgral: R._wgral || null,
    zAktualizacji: nowe ? { wersja: nowe._wersja || null } : null,
    kopie: kopie()
  };
}

const tekstZAktualizacji = () => { if (!fs.existsSync(Z_AKTUALIZACJI)) throw blad('Brak nowych reguł z aktualizacji.', 404); return fs.readFileSync(Z_AKTUALIZACJI, 'utf8'); };
function zastosujZAktualizacji(produkty, konto) {
  const o = ocen(tekstZAktualizacji(), produkty);
  if (o.bledy.length) throw Object.assign(blad('Reguły z aktualizacji mają błędy.'), { bledy: o.bledy });
  // to znowu reguły „z aplikacji” – kolejne aktualizacje będą je podmieniać automatycznie
  zrobKopie('przed zastosowaniem reguł z aktualizacji');
  const { _wgrano, _wgral, ...czyste } = o.R;
  fs.writeFileSync(PLIK, JSON.stringify(czyste, null, 2));
  fs.rmSync(Z_AKTUALIZACJI, { force: true });
  return o;
}
const odrzucZAktualizacji = () => fs.rmSync(Z_AKTUALIZACJI, { force: true });

module.exports = { SERIE, sprawdz, sprawdzSymbole, roznice, ocen, wgraj, kopie, bezpiecznaKopia, przywroc, stan, tekstZAktualizacji, zastosujZAktualizacji, odrzucZAktualizacji, PLIK };
