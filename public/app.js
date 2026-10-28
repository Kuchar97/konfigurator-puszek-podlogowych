/* Konfigurator puszek podłogowych Kontakt-Simon – prototyp lokalny */
'use strict';

// ---------- Dane i stan ----------
let P = {};          // produkty z cennika: symbol -> {nazwa, cena, ...}
let R = {};          // reguły serii z data/reguly.json
let META = {};
let KATALOGI = [];
const INFO = {};     // cache /api/produkt
const STAN = {};     // cache /api/stan

const KLUCZ = 'konfigurator-puszek-v1';
const KROKI = [
  { id: 'seria', nazwa: 'Seria' },
  { id: 'wariant', nazwa: 'Wariant puszki' },
  { id: 'osprzet', nazwa: 'Osprzęt' },
  { id: 'podsumowanie', nazwa: 'Podsumowanie' },
  { id: 'oferta', nazwa: 'Oferta' }
];

const nowyStan = () => ({
  widok: 'start',
  odp: { podloga: null, miejsce: null, wykonczenie: null, potrzeby: { zas: 0, data: 0, rj: 0, usb: 0, hdmi: 0 }, wysokosc: '', charakter: null, zamek: null },
  kreator: false,
  opis: '',
  rozpoznane: null,
  seria: null,
  cfg: {},
  moduly: {},
  kolorOsprzetu: '/9',
  keystone: null,
  zaslepkiKs: { symbol: null, ilosc: 0 },
  zaslepki: true,
  pelnaLista: false,
  nazwaZestawu: '',
  liczbaPuszek: 1,
  edytowany: null,
  oferta: { projekt: '', klient: '', rabat: 0, zestawy: [] }
});
let S = nowyStan();
try { const z = JSON.parse(localStorage.getItem(KLUCZ)); if (z && z.odp) S = Object.assign(nowyStan(), z); } catch { /* brak zapisu */ }
const zapisz = () => { try { localStorage.setItem(KLUCZ, JSON.stringify(S)); } catch { /* prywatne okno */ } };

// ---------- Narzędzia ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zl = n => (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const brutto = n => Math.round(n * (1 + (R.vat ?? 0.23)) * 100) / 100;
const dzis = () => new Date().toLocaleDateString('pl-PL');
const seria = id => R.serie[id];
const cena = s => (P[s] && P[s].cena) || 0;
const nazwaProd = s => (P[s] ? P[s].nazwa : 'Brak w cenniku');

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('pokaz');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('pokaz'), 2200);
}

function pobierz(obj, sciezka) { return sciezka.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function ustaw(obj, sciezka, wart) {
  const k = sciezka.split('.');
  let o = obj;
  k.slice(0, -1).forEach(x => { if (o[x] == null || typeof o[x] !== 'object') o[x] = {}; o = o[x]; });
  o[k[k.length - 1]] = wart;
}

const KOLORY_HEX = { '/9': '#ffffff', '/14': '#2b2d31', '/6': '#d32f2f', '/7': '#ef7c00', '/27': '#2e8b57', '/8': '#b9bcc2', '/1': '#8a8c91', '/72': '#c9ccd1', '/74': '#1c1c1c' };
const kropka = k => `<span class="kolor-kropka" style="background:${KOLORY_HEX[k] || '#ccc'}"></span>`;

function kolorZSymbolu(s, seriaId) {
  const m = s.match(/(\/\d+|-0\d\d)$/);
  if (!m) return '';
  const k = m[1];
  // ten sam sufiks znaczy co innego w puszkach i modułach (np. /8 = stal nierdzewna w KGH, aluminium w K45)
  const wlasna = R.serie[seriaId] && R.serie[seriaId].kolory;
  // wykończenie ze stali nierdzewnej (np. nakładki KF…01/8 do KFR) – z nazwy produktu, bo /8 w osprzęcie K45 to aluminium
  if (/stal[ia]? nierdzewn|inox/i.test((P[s] || {}).nazwa || '')) return 'stal nierdzewna';
  const mapy = wlasna ? [wlasna, R.moduly.kolory] : [R.moduly.kolory, ...Object.values(R.serie).map(x => x.kolory)];
  for (const mp of mapy) if (mp && mp[k]) return mp[k];
  return { '-035': 'szary', '-038': 'grafit', '-030': 'biały', '-033': 'aluminium' }[k] || k;
}

// ---------- Kreator: potrzeby -> liczba modułów ----------
function potrzebneModuly(p) {
  return (p.zas || 0) + (p.data || 0) + Math.ceil((p.rj || 0) / 2) + (p.usb || 0) + (p.hdmi || 0);
}

function kgtDobor(p) {
  const gniazda = (p.zas || 0) + (p.data || 0);
  const inne = (p.usb || 0) + (p.hdmi || 0);
  const rj = p.rj || 0;
  if (gniazda > 2) return { ok: false, powod: 'KGT mieści maks. 2 gniazda 230 V' };
  if (gniazda > 0 && inne > 0) return { ok: false, powod: 'wkład KGT z gniazdem nie ma miejsca na USB/HDMI' };
  if (inne > 2) return { ok: false, powod: 'KGT mieści maks. 2 moduły K45' };
  if (rj > 2) return { ok: false, powod: 'KGT mieści maks. 2 złącza RJ45' };
  const rozmiar = (gniazda === 2 || inne === 2 || rj === 2) ? 1 : 0;
  return { ok: true, rozmiar };
}

// ---------- Dopasowanie serii do odpowiedzi ----------
// Reguły rekomendacji kreatora (reguly.json → rekomendacjeKreatora). Bez odpowiedzi – brak rekomendacji.
// Każda odpowiedź zawęża rekomendację; gdy ją wyklucza, decyduje nowsza. Miejsce montażu na końcu (najważniejsze).
function serieZOdpowiedzi(o) {
  const RK = R.rekomendacjeKreatora || {};
  let rek = null;
  const zastosuj = zbior => {
    if (!zbior || !zbior.length) return;
    const wspolne = rek ? rek.filter(id => zbior.includes(id)) : [];
    rek = wspolne.length ? wspolne : zbior.slice();
  };
  if (o.podloga) zastosuj(RK.podloga);
  if (o.wykonczenie) zastosuj((RK.wykonczenie || {})[o.wykonczenie]);
  if (o.zamek === 'tak') zastosuj(RK.zamek);
  if (o.miejsce) zastosuj((RK.miejsce || {})[o.miejsce]);
  return rek || [];
}

const KGT_POKRYWA = 'Seria <b>KGT</b> ma stalową pokrywę <b>zlicowaną z podłogą</b> – <b>nie można w nią nic wsadzić</b> (płytek, wykładziny ani innego materiału podłogi).';

// Grubości wykończenia możliwe w serii (z reguly.json → wykonczenie):
// KGT – pokrywa zlicowana, nic się nie wkłada; KGH – tylko 20 mm; FB – pokrywa 5 lub 12 mm; KFR/KFP – każda (grubsza z nakładką)
function grubosciSerii(id) {
  const w = seria(id).wykonczenie || {};
  if (w.dowolne) return [];
  if (w.min) return ['grube'];
  if (w.warianty) return [['cienkie', 5], ['12', 12], ['grube', 20]].filter(([, mm]) => w.warianty.includes(mm)).map(([k]) => k);
  return ['cienkie', '12', 'grube'];
}
// Grubości do pokazania w kreatorze: tylko te, które mają serie rekomendowane na podstawie pozostałych odpowiedzi
// (null = wszystkie, np. przed pierwszą odpowiedzią)
function dozwoloneGrubosci(o) {
  const rek = serieZOdpowiedzi({ ...o, wykonczenie: null });
  if (!rek.length) return null;
  return { rek, grubosci: [...new Set(rek.flatMap(grubosciSerii))] };
}

function dopasuj(o) {
  const dg = o.wykonczenie && o.wykonczenie !== 'brak' ? dozwoloneGrubosci(o) : null;
  if (dg && !dg.grubosci.includes(o.wykonczenie)) o = { ...o, wykonczenie: null };
  const n = potrzebneModuly(o.potrzeby);
  const h = parseFloat(o.wysokosc);
  const rek = serieZOdpowiedzi(o);
  const wyniki = Object.entries(R.serie).map(([id, s]) => {
    const plus = [], minus = [], uwagi = [];
    let wynik = 0;
    if (rek.includes(id)) wynik += 10;
    if (o.seriaWskazana === id) { wynik += 50; plus.push('seria wskazana w opisie'); }
    const zam = zamiennikKFR(o.symbolWskazany);
    if (zam) {
      if (id === 'KFR') { wynik += 80; plus.push(`zamiennik wycofanej ${zam.sf} → ${zam.kf}`); }
      else minus.push(`${zam.sf} zastępuje seria KFR`);
    }
    const kasSeria = seriaKasety(o.kasetaIstniejaca);
    if (kasSeria) {
      if (id === kasSeria) { wynik += 60; plus.push(`pasuje do zamontowanej kasety ${String(o.kasetaIstniejaca).toUpperCase()}`); }
      else minus.push(`nie pasuje do zamontowanej kasety ${String(o.kasetaIstniejaca).toUpperCase()}`);
    }

    if (o.podloga) {
      if (s.podlogi.includes(o.podloga)) plus.push(o.podloga === 'wylewka' ? 'podłoga wylewana' : 'podłoga techniczna');
      else minus.push(o.podloga === 'wylewka' ? 'nie do podłóg wylewanych' : 'nie do podłóg technicznych');
    }
    if (o.miejsce === 'zewnatrz') {
      if (id === 'KGT') { plus.push('IP66 – zadaszone na zewnątrz'); uwagi.push('na zewnątrz tylko wersja stal inox (/72)'); wynik += 40; }
      else minus.push('tylko do wnętrz (IP40)');
    } else if (o.miejsce === 'mokre') {
      if (id === 'KGT') { plus.push('IP66 – odporna na wodę'); wynik += 40; }
      else if (id === 'KGH') { plus.push('stal nierdzewna, szczelna rama'); wynik += 30; uwagi.push('IP40 – potwierdź z przedstawicielem handlowym'); }
      else uwagi.push('przy myciu na mokro skontaktuj się z przedstawicielem handlowym');
    }

    if (s.wykonczenie.dowolne) uwagi.push('pokrywa zlicowana z podłogą – nie można w nią nic wsadzić');
    if (o.wykonczenie) {
      const w = s.wykonczenie;
      if (w.dowolne) { /* KGT – informacja poniżej, zawsze */ }
      else if (w.warianty) {
        if (o.wykonczenie === 'cienkie') plus.push('pokrywa na wykończenie 5 mm');
        else if (o.wykonczenie === '12') plus.push('pokrywa na wykończenie 12 mm');
        else if (o.wykonczenie === 'grube') minus.push('pokrywa tylko na 5 lub 12 mm');
      } else if (w.min) {
        if (o.wykonczenie === 'grube') plus.push(`wypełnienie pokrywy ${w.min}–${w.max} mm`);
        else if (o.wykonczenie !== 'brak') minus.push(`pokrywa wymaga wypełnienia ${w.min}–${w.max} mm`);
      } else if (w.max) {
        if (o.wykonczenie === 'cienkie') plus.push(`wykończenie do ${String(w.max).replace('.', ',')} mm w pokrywie`);
        else if (o.wykonczenie !== 'brak') uwagi.push('grubsze wykończenie – z nakładką wykończeniową');
      }
    }

    if (n > 0) {
      if (id === 'KGT') {
        const k = kgtDobor(o.potrzeby);
        if (k.ok) plus.push(`${n} ${n === 1 ? 'moduł' : 'moduły'} – gotowy wkład`); else minus.push(k.powod);
      } else if (n > s.moduly[1]) minus.push(`maks. ${s.moduly[1]} modułów K45 (potrzeba ${n})`);
      else plus.push(`mieści ${n} mod. K45 (${s.moduly[0]}–${s.moduly[1]})`);
    }

    if (!isNaN(h) && h > 0) {
      const podl = o.podloga ? [o.podloga] : s.podlogi;
      const zakresy = podl.filter(p => s.wysokosc[p]).map(p => s.wysokosc[p]);
      const miesci = zakresy.some(([a, b]) => h >= a && h <= b);
      const opis = zakresy.map(([a, b]) => (b >= 999 ? `od ${a}` : `${a}–${b}`)).join(' / ') + ' mm';
      if (miesci) plus.push(`wysokość ${h} mm (${opis})`); else minus.push(`wysokość ${h} mm poza zakresem ${opis}`);
    }

    if (o.zamek === 'tak') {
      if (s.zamek) plus.push(id === 'KGT' ? 'zamek na klucz imbusowy' : 'pokrywa z zamkiem'); else minus.push('brak wersji z zamkiem');
    }

    if (o.charakter === 'estetyczna') {
      wynik += { KGH: 25, KGT: 10, KFR: 8 }[id] || 0;
      if (id === 'KGH') plus.push('stal nierdzewna, ukryta rama');
      if (id === 'KFR') uwagi.push('estetycznie z nakładką ze stali nierdzewnej');
    } else if (o.charakter === 'budzet') {
      wynik += { KFR: 15, FB: 10, KFP: 10 }[id] || 0;
      if (id === 'KGH') wynik -= 15;
    }
    wynik += plus.length * 2;
    return { id, pasuje: minus.length === 0, wynik, plus, minus, uwagi, rekomendowana: false };
  });
  // rekomendowane tylko serie, które mieszczą moduły i spełniają pozostałe warunki;
  // gdy żadna z reguł nie pasuje – najlepiej dopasowana seria
  if (rek.length) {
    let wybrane = wyniki.filter(w => rek.includes(w.id) && w.pasuje);
    if (!wybrane.length) {
      const zastepcza = wyniki.filter(w => w.pasuje).sort((a, b) => b.wynik - a.wynik)[0];
      if (zastepcza) {
        wybrane = [zastepcza];
        zastepcza.uwagi.unshift(`rekomendowana zamiast ${rek.join(' / ')}, ${rek.length > 1 ? 'które nie spełniają' : 'która nie spełnia'} Twoich warunków`);
      }
    }
    wybrane.forEach(w => { w.rekomendowana = true; });
  }
  return wyniki.sort((a, b) => (b.rekomendowana - a.rekomendowana) || (b.pasuje - a.pasuje) || (b.wynik - a.wynik));
}

// ---------- Dobór z opisu (reguły słów kluczowych, działa offline) ----------
const LICZEBNIKI = { jeden: 1, jedno: 1, jedna: 1, jednego: 1, jednej: 1, dwa: 2, dwie: 2, dwóch: 2, dwoch: 2, trzy: 3, trzech: 3, cztery: 4, czterech: 4, 'pięć': 5, piec: 5, 'pięciu': 5, 'sześć': 6, szesc: 6, 'sześciu': 6, siedem: 7, osiem: 8, ośmiu: 8, dziewięć: 9, dziesięć: 10, dwanaście: 12, 'kilka': 3 };

function rozpoznajOpis(tekst) {
  const t = ' ' + tekst.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const odp = { ...nowyStan().odp, potrzeby: { zas: 0, data: 0, rj: 0, usb: 0, hdmi: 0 } };
  const rozp = [];
  const ma = re => re.test(t);

  // podłoga
  if (ma(/techniczn|podniesion|podwyższon|serwerowni|na wspornik/)) { odp.podloga = 'techniczna'; rozp.push('podłoga techniczna'); }
  else if (ma(/wylew|beton|jastrych|posadzk/)) { odp.podloga = 'wylewka'; rozp.push('podłoga wylewana'); }

  // warunki
  if (ma(/zewn|taras|wiat[ay]|na dworze|plener|ogród|ogrod/)) { odp.miejsce = 'zewnatrz'; rozp.push('zadaszone na zewnątrz'); }
  else if (ma(/mokr|myt[ae]|mycie|zmywan|szoruj|szpital|basen|gastronom|kuchni|hal[ai] |hala |produkcj|wod[aęy]/)) { odp.miejsce = 'mokre'; rozp.push('mycie na mokro'); }

  // wykończenie podłogi
  if (ma(/gres|gruby parkiet|grube płytki|17 ?mm|20 ?mm/)) { odp.wykonczenie = 'grube'; rozp.push('wykończenie 20 mm (gres)'); }
  else if (ma(/płyt(k|ki|kach)|terakot|parkiet|kamie[nń]|marmur|deski|12 ?mm/)) { odp.wykonczenie = '12'; rozp.push('wykończenie 12 mm'); }
  else if (ma(/wykładzin|wykladzin|panel|pcv|linoleum|winyl|wykładzina/)) { odp.wykonczenie = 'cienkie'; rozp.push('wykończenie 5 mm'); }

  // wysokość: „100 mm”, „10 cm”, „wylewka 90”
  const mm = [...t.matchAll(/(\d{2,3})\s*mm/g)].map(m => +m[1]).filter(v => v >= 40 && v !== 12 && v !== 17 && v !== 20);
  const cm = [...t.matchAll(/(\d{1,2}(?:[.,]\d)?)\s*cm/g)].map(m => Math.round(parseFloat(m[1].replace(',', '.')) * 10)).filter(v => v >= 40);
  const wys = mm[0] || cm[0] || (t.match(/(?:wylewk\w*|wysoko\w*|głęboko\w*)\D{0,12}(\d{2,3})/) || [])[1];
  if (wys) { odp.wysokosc = String(wys); rozp.push(`wysokość ${wys} mm`); }

  // zamek
  if (ma(/zamk|zamek|na klucz|zamykan|postronn/)) { odp.zamek = 'tak'; rozp.push('pokrywa z zamkiem'); }

  // liczby gniazd/złączy: „3 gniazda”, „dwa gniazda UPS”, „4x RJ45”, „2 × USB”
  // dla każdej liczby sprawdzamy, co stoi bezpośrednio po niej
  const liczba = s => (/^\d+$/.test(s) ? +s : LICZEBNIKI[s] || 0);
  const reLiczba = new RegExp(`(?:^|[^0-9a-ząćęłńóśźż])(\\d{1,2}|${Object.keys(LICZEBNIKI).join('|')})(?![0-9a-ząćęłńóśźż])\\s*(?:x|×|szt\\.?)?\\s*`, 'g');
  const KLASY = [
    ['data', /^(gniazd\w*\s+)?(230\s*v\s+)?(ups|data|dedykowan)|^gniazd\w*\s+\S+\s+(ups|data|dedykowan)/],
    ['rj', /^(złącz\w*\s+|gniazd\w*\s+|wkład\w*\s+|port\w*\s+)?(rj|lan|sieciow|komputer|internet|ethernet)/],
    ['usb', /^(ładowar\w*\s+|gniazd\w*\s+)?usb|^ładowar/],
    ['hdmi', /^(złącz\w*\s+|gniazd\w*\s+)?hdmi/],
    ['zas', /^(gniazd|230\s*v|zasilan)/]
  ];
  const znalezione = { zas: 0, data: 0, rj: 0, usb: 0, hdmi: 0 };
  let m;
  while ((m = reLiczba.exec(t))) {
    const n = liczba(m[1]);
    const okno = t.slice(reLiczba.lastIndex, reLiczba.lastIndex + 30);
    const k = n && (KLASY.find(([, re]) => re.test(okno)) || [])[0];
    if (k) znalezione[k] += n;
  }
  // wzmianki bez liczby
  if (!znalezione.rj && ma(/rj ?-?45|internet|lan |sieć komputer|siec komputer/)) znalezione.rj = 1;
  if (!znalezione.usb && ma(/usb|ładowark/)) znalezione.usb = 1;
  if (!znalezione.hdmi && ma(/hdmi/)) znalezione.hdmi = 1;
  if (!znalezione.data && ma(/ ups|gniazd\w* data|dedykowan/)) znalezione.data = 1;
  if (!znalezione.zas && ma(/gniazd|230 ?v|zasilani|prąd|prad/)) znalezione.zas = 1;
  odp.potrzeby = znalezione;
  const opisy = { zas: 'gniazda 230 V', data: 'gniazda DATA (UPS)', rj: 'złącza RJ45', usb: 'ładowarki USB', hdmi: 'HDMI' };
  for (const [k, v] of Object.entries(znalezione)) if (v) rozp.push(`${opisy[k]}: ${v}`);
  if (!Object.values(znalezione).some(Boolean)) odp.potrzeby = { ...nowyStan().odp.potrzeby };

  // wprost wskazana seria
  const s = t.match(/\b(kgt|kgh|kfr|kfp|fb)\b/);
  if (s) { odp.seriaWskazana = s[1].toUpperCase(); rozp.push(`seria ${odp.seriaWskazana}`); }

  // wycofana puszka SF (np. „SF370 szary /1-035”) → zamiennik KFR
  const sf = t.match(/\bsf\s?-?(\d{3})\s*(?:[a-ząćęłńóśźż ]{0,20})?(\/\s?14|\/\s?1|-038|-035)?/);
  if (sf) {
    const kolorSf = sf[2] && /14|038/.test(sf[2]) ? '/14' : (ma(/grafit/) && !sf[2] ? '/14' : '/1');
    const z = zamiennikKFR(`SF${sf[1]}${kolorSf}`);
    if (z) { odp.symbolWskazany = z.sf; odp.seriaWskazana = 'KFR'; rozp.push(`wycofana ${z.sf} → zamiennik ${z.kf}`); }
  }

  // zamontowana już kaseta (np. „kupił kasety G33, zamontowane”)
  const kas = t.match(/\b(g ?(?:11|22|33|44|66|300|400|600|201|301c|401)|gfb ?\d{3})\b/);
  if (kas && ma(/zamontowan|zainstalowan|kupi|posiada|mamy kaset|ma kaset|istniejąc|istniejac|wylane/)) {
    odp.kasetaIstniejaca = kas[1].replace(/\s/g, '').toUpperCase();
    odp.podloga = odp.podloga || 'wylewka';
    rozp.push(`kaseta ${odp.kasetaIstniejaca} już zamontowana (bez kasety w zestawie)`);
  }

  // nakładka, kolor puszki, liczba sztuk
  if (ma(/nakładk|nakladk/)) {
    odp.nakladka = ma(/inox|nierdzewn/) ? 'inox' : 'standard';
    rozp.push(odp.nakladka === 'inox' ? 'nakładka ze stali nierdzewnej' : 'nakładka wykończeniowa');
  }
  if (ma(/grafit/)) { odp.kolorPuszki = 'grafit'; rozp.push('kolor grafit'); }
  else if (ma(/szar/)) { odp.kolorPuszki = 'szary'; rozp.push('kolor szary'); }
  const szt = t.match(/(\d{1,4})\s*(?:szt|sztuk|puszek|kompl|kpl)/);
  if (szt && +szt[1] > 0) { odp.liczba = +szt[1]; rozp.push(`liczba puszek: ${odp.liczba}`); }

  // zamówienie samych puszek (zamiennik / kaseta już jest) – nie zakładamy domyślnego osprzętu
  if ((odp.symbolWskazany || odp.kasetaIstniejaca) && !Object.values(znalezione).some(Boolean)) odp.potrzeby = { zas: 0, data: 0, rj: 0, usb: 0, hdmi: 0 };

  return { odp, rozpoznane: rozp };
}

// ---------- Domyślna konfiguracja serii ----------
function najmniejszyRozmiar(s, n) {
  const i = s.rozmiary.findIndex(r => r.k45 >= n);
  return i < 0 ? s.rozmiary.length - 1 : i;
}

// Wycofana puszka SF → zamiennik KFR: {sf, kf, rozmiar (indeks), glebokosc ('70'|'93'), kolor}
function zamiennikKFR(symbol) {
  if (!symbol || !R.zamienniki) return null;
  const sf = String(symbol).toUpperCase().replace(/\s+/g, '').replace(/-035$/, '/1').replace(/-038$/, '/14');
  const kf = R.zamienniki[sf] || R.zamienniki[sf.includes('/') ? sf : sf + '/1'];
  if (!kf) return null;
  const [baza, kol] = kf.split('/');
  const roz = seria('KFR').rozmiary.findIndex(r => r.puszka['70'] === baza || r.puszka['93'] === baza);
  if (roz < 0) return null;
  return { sf: sf.includes('/') ? sf : sf + '/1', kf, rozmiar: roz, glebokosc: seria('KFR').rozmiary[roz].puszka['70'] === baza ? '70' : '93', kolor: '/' + kol };
}

// Do której serii należy zamontowana już kaseta (np. G33 → KFR)
function seriaKasety(symbol) {
  if (!symbol) return null;
  const k = String(symbol).toUpperCase();
  if (/^G(11|22|33|44|66|300|400|600)$/.test(k)) return 'KFR';
  if (/^G(201|301C|401)$/.test(k)) return 'KFP';
  if (/^GFB\d{3}$/.test(k)) return 'FB';
  return null;
}

function domyslnaKonfiguracja(id, o) {
  const s = seria(id);
  const n = S.kreator ? potrzebneModuly(o.potrzeby) : 0;
  const h = parseFloat(o.wysokosc);
  const podloga = o.podloga && s.podlogi.includes(o.podloga) ? o.podloga : (o.kasetaIstniejaca ? 'wylewka' : s.podlogi[0]);
  const cfg = { podloga, osprzet: 'K45', rozmiar: najmniejszyRozmiar(s, n), bezKasety: !!o.kasetaIstniejaca };
  const grube = o.wykonczenie === '12' || o.wykonczenie === 'grube';
  if (id === 'KFR') {
    const wyk = o.nakladka === 'inox' ? 'inox' : (o.nakladka === 'standard' ? 'nakladka' : (grube ? (o.charakter === 'estetyczna' ? 'inox' : 'nakladka') : 'wypelnienie'));
    Object.assign(cfg, { glebokosc: !isNaN(h) && h > 105 ? '93' : '70', kolor: o.kolorPuszki === 'grafit' ? '/14' : '/1', kaseta: 'tworzywo', wykonczenie: wyk });
    const kas = String(o.kasetaIstniejaca || '').toUpperCase();
    if (/^G(300|400|600)$/.test(kas)) cfg.kaseta = 'metal';
    // zamiennik wycofanej puszki SF: wielkość, głębokość i kolor z tabeli zamienników
    const z = zamiennikKFR(o.symbolWskazany);
    if (z) Object.assign(cfg, { rozmiar: z.rozmiar, glebokosc: z.glebokosc, kolor: z.kolor, zamiennik: z });
    else if (/^G(11|22|33|44|66|300|400|600)$/.test(kas)) {
      // rozmiar wynika z zamontowanej kasety
      const i = s.rozmiary.findIndex(r => r.kasetaTworzywo === kas || r.kasetaMetal === kas);
      if (i >= 0) cfg.rozmiar = i;
    }
  } else if (id === 'KGT') {
    const k = kgtDobor(o.potrzeby);
    const p = o.potrzeby;
    Object.assign(cfg, {
      rozmiar: S.kreator && k.ok ? k.rozmiar : 0, kolor: '/72', zamek: o.zamek === 'tak' ? 'imbus' : 'latwy',
      gniazdo: S.kreator && (p.zas + p.data) === 0 ? 'brak' : 'E', dodatek: S.kreator && p.rj > 0 ? 'rj45kat6' : 'zaslepka', lacznik: false
    });
  } else if (id === 'FB') {
    const fb = s.rozmiary[cfg.rozmiar];
    const kasety = Object.entries(fb.kasety);
    const kas = (!isNaN(h) && kasety.find(([, [a, b]]) => h >= a && h <= b)) || kasety[0];
    Object.assign(cfg, { pokrywa: o.wykonczenie === '12' ? '12' : '5', zamek: o.zamek === 'tak', kaseta: kas[0], oslony: true, szalunek: false, stopki: false });
  } else if (id === 'KFP') {
    Object.assign(cfg, { nakladka: grube });
  }
  return cfg;
}

function domyslneModuly(o) {
  const p = o.potrzeby;
  return {
    'gn-e-szybko': { ilosc: p.zas || 0 },
    'data-e-szybko': { ilosc: p.data || 0 },
    'rj-2': { ilosc: Math.floor((p.rj || 0) / 2) },
    'rj-1': { ilosc: (p.rj || 0) % 2 },
    'usb-ac65': { ilosc: p.usb || 0 },
    'hdmi': { ilosc: p.hdmi || 0 }
  };
}

function wybierzSerie(id) {
  S.seria = id;
  S.cfg = domyslnaKonfiguracja(id, S.odp);
  S.moduly = S.kreator ? domyslneModuly(S.odp) : {};
  if (id === 'KGT' && S.cfg.gniazdo !== 'brak') S.moduly = S.kreator ? { 'usb-ac65': { ilosc: S.odp.potrzeby.usb }, 'hdmi': { ilosc: S.odp.potrzeby.hdmi } } : {};
  S.kolorOsprzetu = '/9';
  S.liczbaPuszek = S.kreator && S.odp.liczba ? S.odp.liczba : 1;
  // wolne miejsca zawsze uzupełniamy zaślepkami – poza zamówieniem samych puszek na wymianę
  // (zamiennik SF albo już zamontowana kaseta, bez osprzętu)
  S.zaslepki = !(S.kreator && potrzebneModuly(S.odp.potrzeby) === 0 && (S.odp.symbolWskazany || S.odp.kasetaIstniejaca));
  S.nazwaZestawu = '';
  S.edytowany = null;
  S.widok = 'wariant';
  if (id === 'KGT') kgtNapraw();
}

// ---------- KGT: symbol wkładu i dozwolone kombinacje ----------
function kgtWklad(c, zmiany = {}) {
  const s = seria('KGT'), x = { ...c, ...zmiany }, r = s.rozmiary[x.rozmiar];
  return r.wklad + s.wkladGniazdo[x.gniazdo] + s.wkladDodatek[x.dodatek].kod + s.zamki[x.zamek].sufiks + x.kolor;
}

// Po zmianie gniazda/zamka/koloru dobiera istniejącą w cenniku kombinację wkładu
function kgtNapraw() {
  const s = seria('KGT'), c = S.cfg;
  if (P[kgtWklad(c)]) return;
  const dod = Object.keys(s.wkladDodatek).find(d => P[kgtWklad(c, { dodatek: d })]);
  if (dod) { c.dodatek = dod; return; }
  const zam = Object.keys(s.zamki).find(z => Object.keys(s.wkladDodatek).some(d => P[kgtWklad(c, { zamek: z, dodatek: d })]));
  if (zam) { c.zamek = zam; c.dodatek = Object.keys(s.wkladDodatek).find(d => P[kgtWklad(c, { dodatek: d })]); }
}

// ---------- Osprzęt: kolory, pojemność ----------
function dostepneKolory(baza) {
  return Object.keys(P).filter(s => s.startsWith(baza + '/')).map(s => s.slice(baza.length));
}

function kolorModulu(m) {
  const wybr = S.moduly[m.id] && S.moduly[m.id].kolor;
  const dost = dostepneKolory(m.baza);
  const zalecany = m.grupa === 'data' ? '/6' : (m.grupa === 'inne' && m.kolor === '/14' ? '/14' : S.kolorOsprzetu);
  if (wybr && dost.includes(wybr)) return { kolor: wybr, zalecany, zamiennik: false, dost };
  if (dost.includes(zalecany)) return { kolor: zalecany, zalecany, zamiennik: false, dost };
  const kol = ['/9', '/14', '/8', '/6', '/7', '/27'].find(k => dost.includes(k)) || dost[0];
  return { kolor: kol, zalecany, zamiennik: true, dost };
}

function pojemnosc() {
  const s = seria(S.seria);
  const r = s.rozmiary[S.cfg.rozmiar];
  if (S.seria === 'KGT') return { pelne: S.cfg.gniazdo === 'brak' ? r.k45 : 0, polowki: 0 };
  if (S.seria === 'FB' && S.cfg.osprzet === 'S500') return { pelne: 0, polowki: 0 };
  return { pelne: r.k45, polowki: r.k45pol || 0 };
}

// Zajętość puszki. Połówki (22,5×45) trafiają najpierw do miejsc K45/2 (FB, KFP),
// pozostałe parami do miejsc K45. Moduł z 'zaslepkaPolowki' (K129B) razem ze swoją zaślepką 22,5×45 zajmuje całe miejsce K45.
function uzycie() {
  let pelne = 0, pol = 0;
  for (const m of R.moduly.lista) {
    const q = (S.moduly[m.id] && S.moduly[m.id].ilosc) || 0;
    if (!q) continue;
    if (m.szer === 1 || m.zaslepkaPolowki) pelne += q; else pol += q;
  }
  const cap = pojemnosc();
  const polowkiWMiejscachPol = Math.min(pol, cap.polowki);
  const polowkiWPelnych = pol - polowkiWMiejscachPol;
  const zajetePelne = pelne + Math.ceil(polowkiWPelnych / 2);
  return {
    pelne: zajetePelne,
    polowki: polowkiWMiejscachPol,
    nieparzystaPolowka: polowkiWPelnych % 2 === 1,
    // pełne miejsca K45 osobno – dodatkowe miejsca K45/2 (FB, KFP) przyjmują tylko moduły 22,5×45
    jednostkiPelne: pelne + polowkiWPelnych / 2,
    cap
  };
}

// Gniazda na szybkozłączki łączy się łącznikami AC11: n gniazd w obwodzie → n−1 (zwykłe i DATA to osobne obwody)
function liczbaAc11(st = S) {
  if (!R.ac11) return 0;
  const obwody = {};
  for (const m of R.moduly.lista) {
    if (!m.szybkozlacze) continue;
    obwody[m.grupa] = (obwody[m.grupa] || 0) + ((st.moduly[m.id] && st.moduly[m.id].ilosc) || 0);
  }
  return Object.values(obwody).reduce((a, n) => a + Math.max(0, n - 1), 0);
}

function sekcjaAc11() {
  const ile = liczbaAc11();
  if (!ile) return '';
  return `<div class="komunikat info">${checkbox('ac11', S.ac11 !== false, `<b>Łączniki ${esc(R.ac11.symbol)} – rekomendujemy ${ile} szt.</b> · ${zl(cena(R.ac11.symbol))}/szt.`, 'Spinają sąsiednie gniazda na szybkozłączki (K22, K11) w jednym obwodzie: n gniazd → n−1 łączników, osobno dla gniazd zwykłych i DATA.')}</div>`;
}

function portyKeystone(st = S) {
  let n = 0;
  for (const m of R.moduly.lista) if (m.keystone) n += ((st.moduly[m.id] && st.moduly[m.id].ilosc) || 0) * (m.porty || 1);
  if (st.seria === 'KGT' && st.cfg.dodatek === 'keystone') n += seria('KGT').rozmiary[st.cfg.rozmiar].k45 === 2 ? 2 : 1;
  return n;
}
const liczbaPl = x => String(x).replace('.', ',');

// ---------- Zestaw (lista materiałowa) ----------
function zestaw(st = S) {
  const id = st.seria, c = st.cfg, s = seria(id);
  const r = s.rozmiary[c.rozmiar];
  const poz = [], bledy = [], uwagi = [];
  // ten sam symbol (np. K105 dodany ręcznie i do adaptera HDMI K129B) – jedna pozycja z sumą sztuk
  const dodaj = (symbol, ilosc, rola, opis) => {
    if (!(ilosc > 0)) return;
    const jest = poz.find(p => p.symbol === symbol && p.rola === rola);
    if (!jest) return poz.push({ symbol, ilosc, rola, opis });
    jest.ilosc += ilosc;
    if (jest.opis !== opis && / do /.test(jest.opis)) jest.opis = opis; // ogólna nazwa zamiast „… do K129B”
  };

  if (id === 'KFR') {
    if (c.osprzet === 'S500') {
      dodaj(r.puszkaS500[c.glebokosc] + (c.kolor === '/14' ? '-038' : '-035'), 1, 'puszka', 'Puszka podłogowa (Simon 500)');
      const adapter = '50012088' + ({ '/14': '-038', '/8': '-033' }[st.kolorOsprzetu] || '-030');
      dodaj(adapter, r.k45, 'puszka', 'Adaptery S500 → K45');
    } else dodaj(r.puszka[c.glebokosc] + c.kolor, 1, 'puszka', 'Puszka podłogowa');
    if (c.podloga === 'wylewka' && !c.bezKasety) {
      const kas = c.kaseta === 'metal' && r.kasetaMetal ? r.kasetaMetal : r.kasetaTworzywo;
      dodaj(kas, 1, 'puszka', 'Kaseta do wylewki');
    }
    if (c.zamiennik) uwagi.push(`Zamiennik wycofanej puszki ${c.zamiennik.sf} → ${c.zamiennik.kf}. Puszki KFR pasują do zamontowanych kaset G11–G66 i G300–G600.`);
    if (c.wykonczenie === 'nakladka') dodaj(r.nakladka + c.kolor, 1, 'puszka', 'Nakładka wykończeniowa');
    if (c.wykonczenie === 'inox') dodaj(r.nakladkaInox, 1, 'puszka', 'Nakładka ze stali nierdzewnej');
  } else if (id === 'KGH') {
    dodaj(r.puszka, 1, 'puszka', 'Puszka podłogowa');
    dodaj(r.pokrywa, 1, 'puszka', 'Rama z pokrywą');
  } else if (id === 'KGT') {
    dodaj(r.puszka[c.podloga] + c.kolor, 1, 'puszka', 'Puszka IP66');
    const gn = c.gniazdo || 'E';
    const dod = gn === 'brak' && !['zaslepka', 'keystone'].includes(c.dodatek) ? 'zaslepka' : c.dodatek;
    const wklad = r.wklad + s.wkladGniazdo[gn] + s.wkladDodatek[dod].kod + s.zamki[c.zamek].sufiks + c.kolor;
    if (P[wklad]) dodaj(wklad, 1, 'puszka', 'Wkład z pokrywą');
    else {
      const alt = Object.keys(P).filter(x => x.startsWith(r.wklad) && x.endsWith(c.kolor) && x.includes(s.zamki[c.zamek].sufiks || 'KFH'));
      bledy.push(`Wkład ${wklad} nie występuje w cenniku (ta kombinacja gniazda, dodatku i zamka nie jest produkowana). Zmień wybór.`);
      poz.push({ symbol: wklad, ilosc: 1, rola: 'puszka', opis: 'Wkład – kombinacja niedostępna', brak: true, alt });
    }
    if (c.lacznik && c.podloga === 'wylewka') dodaj(s.akcesoria.laczenie, 1, 'puszka', 'Łącznik puszek');
  } else if (id === 'FB') {
    dodaj(r.puszka[c.pokrywa + (c.zamek ? 'z' : '')], 1, 'puszka', 'Puszka podłogowa');
    dodaj(c.osprzet === 'S500' ? s.ramkaS500 : s.ramkaK45, r.ramki, 'puszka', 'Ramki osprzętowe');
    if (c.oslony) dodaj(s.oslona, r.ramki, 'puszka', 'Osłony ramek');
    if (c.podloga === 'wylewka' && !c.bezKasety) {
      dodaj(c.kaseta, 1, 'puszka', 'Kaseta metalowa do wylewki');
      if (c.szalunek) dodaj(r.szalunek, 1, 'puszka', 'Zestaw szalunkowy');
      if (c.stopki) dodaj(s.stopki, 1, 'puszka', 'Zestaw stopek');
    }
    if (c.osprzet === 'S500') uwagi.push('Mechanizmy Simon 500 do ramek FBA401 dobierz osobno – nie są jeszcze obsługiwane w konfiguratorze.');
  } else if (id === 'KFP') {
    dodaj(r.puszka, 1, 'puszka', 'Puszka podłogowa');
    if (c.podloga === 'wylewka' && !c.bezKasety) dodaj(r.kaseta, 1, 'puszka', 'Kaseta do wylewki');
    if (c.nakladka) dodaj(r.nakladka, 1, 'puszka', 'Nakładka wykończeniowa');
  }

  // Osprzęt K45
  for (const m of R.moduly.lista) {
    const q = (st.moduly[m.id] && st.moduly[m.id].ilosc) || 0;
    if (!q) continue;
    const k = kolorModuluDla(st, m);
    dodaj(m.baza + k.kolor, q, 'osprzet', m.nazwa);
    // np. K129B: kabel HDMI podłącza się pod połówką zaślepki – dokładamy ją w tym samym kolorze
    if (m.zaslepkaPolowki) {
      const z = R.moduly.lista.find(x => x.id === m.zaslepkaPolowki);
      const kol = dostepneKolory(z.baza).includes(k.kolor) ? k.kolor : kolorModuluDla(st, z).kolor;
      dodaj(z.baza + kol, q, 'osprzet', `Zaślepka 22,5×45 do ${m.baza}`);
    }
    // płytki skośne: wkład Keystone montuje się przez adapter MD (np. MD67) – jeden na każde gniazdo
    if (m.adapterMD && (st.keystone || R.keystone.domyslny) !== 'brak') dodaj(m.adapterMD, q * (m.porty || 1), 'osprzet', 'Adaptery MD do wkładów Keystone w płytkach skośnych');
  }
  // Łączniki AC11 do gniazd na szybkozłączki (n−1 w każdym obwodzie)
  const ac = liczbaAc11(st);
  if (ac && st.ac11 !== false) dodaj(R.ac11.symbol, ac, 'osprzet', 'Łączniki gniazd na szybkozłączki');

  // Wkłady RJ45 Keystone do płytek z zatrzaskiem Keystone
  const porty = portyKeystone(st);
  const ks = st.keystone || R.keystone.domyslny;
  const zasl = st.zaslepkiKs || {};
  const iloscZasl = Math.min(zasl.ilosc || 0, porty);
  const symZasl = (R.keystone.zaslepki || {})[zasl.symbol] ? zasl.symbol : Object.keys(R.keystone.zaslepki || {})[0];
  // zaślepione gniazda nie potrzebują wkładu
  if (porty && ks !== 'brak') dodaj(ks, porty - iloscZasl, 'osprzet', 'Wkłady RJ45 Keystone');
  if (porty && iloscZasl && symZasl) dodaj(symZasl, iloscZasl, 'osprzet', 'Zaślepki wolnych gniazd RJ45');

  // Zaślepki na wolne miejsca
  const u = uzycieDla(st);
  const dodajZaslepke = (id, ile, opis) => {
    const zasl = R.moduly.lista.find(m => m.id === id);
    const k = kolorModuluDla(st, zasl);
    const juz = poz.find(p => p.symbol === zasl.baza + k.kolor);
    if (juz) juz.ilosc += ile; else dodaj(zasl.baza + k.kolor, ile, 'osprzet', opis);
  };
  if (st.zaslepki && u.cap.pelne > u.pelne) dodajZaslepke('zasl', u.cap.pelne - u.pelne, 'Zaślepki wolnych miejsc');
  // połówka K105 na wolne pół miejsca K45; dodatkowe miejsca K45/2 w ramkach FB i puszkach KFP
  // są fabrycznie zaślepione (ulotka Simon Connect) – na nie zaślepek nie dokładamy
  const wolnePolowki = u.nieparzystaPolowka && u.pelne <= u.cap.pelne ? 1 : 0;
  if (st.zaslepki && wolnePolowki) dodajZaslepke('zasl-pol', wolnePolowki, 'Zaślepki wolnych połówek 22,5×45');
  if (u.pelne > u.cap.pelne) bledy.push(`Za dużo modułów: ${u.pelne} z ${u.cap.pelne} miejsc K45. Wybierz większą puszkę lub usuń moduły.`);

  // scal duplikaty symboli
  const scal = [];
  for (const p of poz) { const j = scal.find(x => x.symbol === p.symbol); if (j) j.ilosc += p.ilosc; else scal.push({ ...p }); }
  const netto = scal.reduce((a, p) => a + p.ilosc * cena(p.symbol), 0);
  return { pozycje: scal, bledy, uwagi, netto };
}

// Wersje funkcji działające na dowolnym stanie (np. zapisanym zestawie w ofercie)
function kolorModuluDla(st, m) { const bak = S; S = st; try { return kolorModulu(m); } finally { S = bak; } }
function uzycieDla(st) { const bak = S; S = st; try { return uzycie(); } finally { S = bak; } }

function nazwaDomyslnaZestawu(st = S) {
  const s = seria(st.seria), r = s.rozmiary[st.cfg.rozmiar];
  const roz = st.seria === 'KGT' ? r.nazwa : `${r.k45}×K45`;
  return `Puszka ${s.nazwa} ${roz}${st.cfg.podloga ? ' – ' + (st.cfg.podloga === 'wylewka' ? 'wylewka' : 'podł. techniczna') : ''}`;
}

// ---------- Dane z serwera (dostępność, info) ----------
async function info(symbol) {
  if (INFO[symbol]) return INFO[symbol];
  INFO[symbol] = fetch('/api/produkt?symbol=' + encodeURIComponent(symbol)).then(r => r.json()).catch(() => ({}));
  INFO[symbol] = await INFO[symbol];
  return INFO[symbol];
}
async function stan(symbol) {
  if (STAN[symbol]) return STAN[symbol];
  STAN[symbol] = fetch('/api/stan?symbol=' + encodeURIComponent(symbol)).then(r => r.json()).catch(() => ({ blad: true }));
  STAN[symbol] = await STAN[symbol];
  return STAN[symbol];
}

// Przycisk otwierający domyślny program pocztowy z gotowym zapytaniem o dostępność
function mailDostepnosci(symbol, potrzeba, st) {
  const temat = `Zapytanie o dostępność: ${symbol} – ${potrzeba} szt.`;
  const tresc = [
    'Dzień dobry,',
    '',
    'proszę o informację o dostępności i terminie realizacji produktu:',
    '',
    `Symbol: ${symbol}`,
    `Nazwa: ${nazwaProd(symbol)}`,
    `Potrzebna ilość: ${potrzeba} szt.`,
    st && st.znaleziono ? `Stan w monitorze magazynowym: ${st.ilosc} szt.` : null,
    S.oferta.projekt ? `Projekt: ${S.oferta.projekt}` : null,
    '',
    'Z poważaniem'
  ].filter(x => x !== null).join('\n');
  const href = `mailto:${R.email_bok}?subject=${encodeURIComponent(temat)}&body=${encodeURIComponent(tresc)}`;
  return `<a class="btn btn-sm" href="${href}" title="Otwiera program pocztowy z przygotowaną wiadomością do ${R.email_bok}">✉ Zapytaj o dostępność</a>`;
}

// Jeden mail o wszystkie pozycje, których brakuje (lub brak o nich informacji) – lista: [{symbol, potrzeba}]
async function mailBraki(lista) {
  toast('Sprawdzam dostępność wszystkich pozycji…');
  const stany = await Promise.all(lista.map(p => stan(p.symbol)));
  const braki = lista.map((p, i) => ({ ...p, st: stany[i] }))
    .filter(p => !p.st || p.st.blad || !p.st.znaleziono || p.st.ilosc < p.potrzeba);
  if (!braki.length) { toast('Wszystkie pozycje są dostępne na magazynie'); return; }
  const wiersze = braki.map((p, i) => {
    const mag = p.st && p.st.znaleziono ? `na magazynie: ${p.st.ilosc} szt.` : 'brak informacji w monitorze stanów';
    return `${i + 1}. ${p.symbol} – ${nazwaProd(p.symbol)} – potrzeba ${p.potrzeba} szt. (${mag})`;
  });
  const temat = `Zapytanie o dostępność – ${braki.length} ${braki.length === 1 ? 'pozycja' : 'pozycji'}${S.oferta.projekt ? ' – ' + S.oferta.projekt : ''}`;
  const tresc = ['Dzień dobry,', '', 'proszę o informację o dostępności i terminach realizacji poniższych produktów:', '', ...wiersze, '',
    S.oferta.projekt ? `Projekt: ${S.oferta.projekt}` : null, S.oferta.klient ? `Klient: ${S.oferta.klient}` : null, '', 'Z poważaniem']
    .filter(x => x !== null).join('\n');
  toast(`Otwieram pocztę – ${braki.length} brakujących pozycji`);
  otworzMail(`mailto:${R.email_bok}?subject=${encodeURIComponent(temat)}&body=${encodeURIComponent(tresc)}`);
}

// Otwiera domyślny program pocztowy (wydzielone, żeby dało się podmienić np. w nagraniu demo)
function otworzMail(url) {
  window.location.href = url;
}

function opisDostepnosci(st, potrzeba, symbol) {
  const mail = mailDostepnosci(symbol, potrzeba, st);
  if (!st || st.blad) return { klasa: 'brak', html: `<span title="${esc(typeof st?.blad === 'string' ? st.blad : 'Brak połączenia z serwerem')}">Nie udało się sprawdzić</span><br>${mail}` };
  if (!st.znaleziono) return { klasa: 'brak', html: `Brak informacji<br>${mail}` };
  const termin = st.terminPlanowany ? `przewidywany termin: ${esc(st.terminPlanowany)}` : (st.dniRealizacji ? `realizacja ok. ${st.dniRealizacji} dni` : null);
  // brak albo za mało – propozycja produktów podobnych, które są na magazynie
  const podobne = `<br><button class="btn-link small" data-akcja="podobne" data-symbol="${esc(symbol)}" data-potrzeba="${potrzeba}">Pokaż podobne dostępne</button><div class="podobne-lista"></div>`;
  if (st.ilosc >= potrzeba) return { klasa: 'ok', html: `✓ Dostępne (${st.ilosc} szt.)` };
  if (st.ilosc > 0) return { klasa: 'czesc', html: `Dostępne ${st.ilosc} z ${potrzeba} szt.<br>${termin || mail}${podobne}` };
  return { klasa: 'brak', html: `Brak na magazynie<br>${termin || mail}${podobne}` };
}
async function pokazPodobne(el) {
  const lista = el.nextElementSibling;
  el.disabled = true; el.textContent = 'Szukam podobnych…';
  try {
    const r = await (await fetch(`/api/podobne?symbol=${encodeURIComponent(el.dataset.symbol)}&potrzeba=${el.dataset.potrzeba}`)).json();
    el.remove();
    lista.innerHTML = r.podobne && r.podobne.length
      ? `<div class="small"><b>Podobne na magazynie:</b>${r.podobne.map(p => `<div title="${esc(p.nazwa)}"><span class="symbol">${esc(p.symbol)}</span> ${esc(p.nazwa.slice(0, 60))}${p.nazwa.length > 60 ? '…' : ''} – <b>${p.stan.ilosc} szt.</b>${p.cena != null ? ` · ${zl(p.cena)}` : ''}</div>`).join('')}</div>`
      : '<div class="small muted">Brak podobnych produktów na magazynie.</div>';
  } catch { el.disabled = false; el.textContent = 'Pokaż podobne dostępne'; toast('Nie udało się sprawdzić podobnych produktów'); }
}

async function wypelnijAsynchroniczne() {
  document.querySelectorAll('[data-miniatura]').forEach(async el => {
    const i = await info(el.dataset.miniatura);
    if (i && i.zdjecie) { el.src = i.zdjecie; el.classList.remove('pusta'); }
  });
  document.querySelectorAll('[data-dokumenty]').forEach(async el => {
    const i = await info(el.dataset.dokumenty);
    if (!i || !i.strona) { el.innerHTML = '<span class="muted">—</span>'; return; }
    el.innerHTML = [
      i.karta ? `<a href="${esc(i.karta)}" target="_blank" rel="noopener">Karta PDF</a>` : '',
      `<a href="${esc(i.strona)}" target="_blank" rel="noopener">Strona</a>`,
      i.pliki && i.pliki.length ? `<details><summary class="btn-link">Pliki (${i.pliki.length})</summary>${i.pliki.map(p => `<div><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.nazwa)}</a></div>`).join('')}</details>` : ''
    ].join('');
  });
  document.querySelectorAll('[data-stan]').forEach(async el => {
    const st = await stan(el.dataset.stan);
    const d = opisDostepnosci(st, Number(el.dataset.potrzeba) || 1, el.dataset.stan);
    el.className = 'dostepnosc ' + d.klasa;
    el.innerHTML = d.html;
  });
}

// ---------- Widoki ----------
function stepper() {
  const idx = { kreator: 0, seria: 0, wariant: 1, osprzet: 2, podsumowanie: 3, oferta: 4 }[S.widok];
  if (idx == null) return '';
  const maxDost = S.seria ? 3 : 0;
  return `<ol>${KROKI.map((k, i) => {
    const kl = i === idx ? 'active' : (i < idx ? 'done' : '');
    const dost = i <= maxDost || i === 4;
    return `<li class="${kl}"><button ${dost ? `data-akcja="krok" data-krok="${k.id}"` : 'disabled'} title="${k.nazwa}"><span class="nr">${i < idx ? '✓' : i + 1}</span><span class="etykieta">${k.nazwa}</span></button></li>`;
  }).join('')}</ol>`;
}

function pasekAkcji(lewa, prawa) {
  return `<div class="pasek-akcji"><div class="info">${lewa || ''}</div><div class="prawa">${prawa || ''}</div></div>`;
}

// Strona startowa = kreator: pytania od razu na pierwszej stronie, obok lista serii (bez odpowiedzi – wszystkie serie
// z parametrami; każda odpowiedź zawęża listę i wskazuje rekomendowaną). Seria wybierana od razu przyciskiem „Wybierz”.
function widokStart() {
  return `<section class="start start-naglowek">
    <h1>Konfigurator puszek podłogowych</h1>
    <p class="lead">Dobierz puszkę podłogową, kasetę, pokrywę i gniazda – z cenami, dostępnością i dokumentacją.</p>
  </section>
  ${widokKreator(true)}`;
}
// brak jakiejkolwiek odpowiedzi w kreatorze – wybór serii „od razu”, bez rekomendacji z odpowiedzi
const brakOdpowiedzi = o => !o.podloga && !o.miejsce && !o.wykonczenie && !o.zamek && !potrzebneModuly(o.potrzeby) && !o.wysokosc;

function opcja(pole, wart, tytul, pod, wybrana, wylaczona) {
  return `<button class="opcja ${wybrana ? 'wybrana' : ''}" data-akcja="ustaw" data-pole="${pole}" data-wartosc="${esc(wart)}" ${wylaczona ? 'disabled' : ''}>${tytul}${pod ? `<small>${pod}</small>` : ''}</button>`;
}

function opcjaAkcja(akcja, wart, tytul, pod, wybrana) {
  return `<button class="opcja ${wybrana ? 'wybrana' : ''}" data-akcja="${akcja}" data-wartosc="${esc(wart)}">${tytul}${pod ? `<small>${pod}</small>` : ''}</button>`;
}

function licznik(pole, wart, min = 0, max = 99) {
  return `<span class="licznik-ilosci"><button data-akcja="minus" data-pole="${pole}" data-min="${min}" aria-label="mniej">−</button><input type="number" min="${min}" max="${max}" value="${wart}" data-pole="${pole}" data-typ="num"><button data-akcja="plus" data-pole="${pole}" data-max="${max}" aria-label="więcej">+</button></span>`;
}

function widokKreator(naStarcie) {
  if (!naStarcie) return widokStart(); // kreator jest na stronie startowej
  const o = S.odp;
  const n = potrzebneModuly(o.potrzeby);
  const wyniki = dopasuj(o);
  const pasujace = wyniki.filter(w => w.pasuje);
  const rekomendowana = wyniki.find(w => w.rekomendowana);
  const bezOdpowiedzi = brakOdpowiedzi(o);
  const dg = dozwoloneGrubosci(o);
  const grubosciWidoczne = [['cienkie', '5 mm', 'wykładzina, panele, PCV'], ['12', '12 mm', 'płytki, parkiet, kamień'], ['grube', '20 mm', 'gres, gruby parkiet']]
    .filter(([k]) => !dg || dg.grubosci.includes(k));
  const pyt =(nr, tytul, pomoc, tresc) => `<div class="pytanie"><h3><span class="nr">${nr}.</span> ${tytul}</h3>${pomoc ? `<p class="pomoc">${pomoc}</p>` : ''}${tresc}</div>`;
  const pot = [['zas', 'Gniazda 230 V'], ['data', 'Gniazda DATA (UPS)'], ['rj', 'Złącza RJ45'], ['usb', 'Ładowarki USB'], ['hdmi', 'HDMI']]
    .map(([k, t]) => `<div class="potrzeba"><span>${t}</span>${licznik('odp.potrzeby.' + k, o.potrzeby[k] || 0, 0, 12)}</div>`).join('');

  return `<div class="siatka-2">
    <section class="panel">
      <h2 style="margin-top:0">Dobierz puszkę do potrzeb</h2>
      <p class="muted" style="margin:0 0 12px">Pytania nie są obowiązkowe – każda odpowiedź zawęża listę serii po prawej. Możesz też od razu wybrać serię z listy.</p>
      ${S.rozpoznane ? `<div class="komunikat info"><b>Z Twojego opisu rozpoznano:</b>
        ${S.rozpoznane.length ? `<ul class="powody">${S.rozpoznane.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ' nic konkretnego – uzupełnij odpowiedzi poniżej.'}
        <div class="small" style="margin-top:6px">„${esc(S.opis)}” · sprawdź i popraw odpowiedzi poniżej. <button class="btn-link" data-akcja="idz" data-widok="start">Zmień opis</button></div></div>` : ''}
      ${pyt(1, 'Rodzaj podłogi', 'Gdzie zostanie zamontowana puszka?', `<div class="opcje">
        ${opcja('odp.podloga', 'wylewka', 'Podłoga wylewana', 'beton, jastrych', o.podloga === 'wylewka')}
        ${opcja('odp.podloga', 'techniczna', 'Podłoga techniczna', 'podniesiona, na wspornikach', o.podloga === 'techniczna')}
      </div>
      <p class="pomoc" style="margin:12px 0 8px">Warunki w miejscu montażu:</p>
      <div class="opcje">
        ${opcja('odp.miejsce', 'suche', 'Wnętrze, sucho', 'biuro, sala, hotel', o.miejsce === 'suche')}
        ${opcja('odp.miejsce', 'mokre', 'Mycie na mokro', 'szpital, hala, gastronomia', o.miejsce === 'mokre')}
        ${opcja('odp.miejsce', 'zewnatrz', 'Zadaszone na zewnątrz', 'taras, wiata', o.miejsce === 'zewnatrz')}
      </div>`)}
      ${pyt(2, 'Grubość wykończenia podłogi', 'Materiał, którym wypełnia się pokrywę puszki.', `${grubosciWidoczne.length ? `<div class="opcje">
        ${grubosciWidoczne.map(([k, t, p]) => opcja('odp.wykonczenie', k, t, p, o.wykonczenie === k)).join('')}
        ${opcja('odp.wykonczenie', 'brak', 'Nie wiem', 'pokażę wszystkie', o.wykonczenie === 'brak')}
      </div>` : ''}
      ${dg && dg.rek.includes('KGT') ? `<p class="komunikat info" style="margin:${grubosciWidoczne.length ? '10px' : '0'} 0 0">${KGT_POKRYWA}${!grubosciWidoczne.length ? ' Grubość wykończenia nie ma więc znaczenia.' : ''}</p>` : ''}
      ${dg && grubosciWidoczne.length && grubosciWidoczne.length < 3 ? `<p class="small muted" style="margin:8px 0 0">Pokazujemy tylko grubości możliwe w rekomendowanych seriach (${dg.rek.join(', ')}).</p>` : ''}`)}
      ${pyt(3, 'Ile modułów K45 potrzebujesz?', 'Podaj gniazda i złącza – liczbę modułów policzymy (2 złącza RJ45 = 1 moduł).', `<div class="potrzeby">${pot}</div>
        <p class="small" style="margin:8px 0 0">Razem: <b>${n}</b> ${n === 1 ? 'moduł' : 'modułów'} K45</p>`)}
      ${pyt(4, 'Dostępna wysokość w podłodze', 'Wysokość wylewki lub przestrzeni podłogi technicznej (mm). Zostaw puste, jeśli nie wiesz.', `<label class="pole"><input type="number" min="0" max="500" value="${esc(o.wysokosc)}" data-pole="odp.wysokosc" placeholder="np. 90"> mm</label>`)}
      ${pyt(5, 'Czy pokrywa ma mieć zamek?', null, `<div class="opcje">
        ${opcja('odp.zamek', 'nie', 'Nie', null, o.zamek === 'nie')}
        ${opcja('odp.zamek', 'tak', 'Tak', 'ochrona przed osobami postronnymi', o.zamek === 'tak')}
      </div>`)}
    </section>
    <aside class="lepkie">
      <div class="panel">
        <h2>${bezOdpowiedzi ? 'Serie puszek' : `Pasujące serie (${pasujace.length})`}</h2>
        ${bezOdpowiedzi ? '<p class="muted small" style="margin:0 0 10px">Wybierz serię od razu albo zaznacz odpowiedzi po lewej – wskażemy rekomendowaną puszkę.</p>' : ''}
        ${o.miejsce === 'mokre' ? '<p class="komunikat">Przy myciu podłóg na mokro rekomendujemy <b>KGT (IP66)</b> lub <b>KGH</b> (stal nierdzewna). Inne serie też mogą się sprawdzić – skontaktuj się z przedstawicielem handlowym.</p>' : ''}
        <div class="wyniki">${wyniki.map(w => kartaWyniku(w, !bezOdpowiedzi)).join('')}</div>
      </div>
    </aside>
  </div>
  <section class="start start-dol">
    <div class="start-kod">${polePoKodzie()}</div>
    ${S.oferta.zestawy.length ? `<p style="margin-top:16px"><button class="btn" data-akcja="idz" data-widok="oferta">Wróć do oferty (${S.oferta.zestawy.length} ${S.oferta.zestawy.length === 1 ? 'zestaw' : 'zestawy'})</button></p>` : ''}
  </section>
  ${pasekAkcji(bezOdpowiedzi ? '' : '<button class="btn" data-akcja="wyczysc-odpowiedzi" title="Zacznij pytania od nowa">Wyczyść odpowiedzi</button>',
    rekomendowana ? `<span class="muted">Rekomendujemy: <b>${wyniki.filter(w => w.rekomendowana).map(w => w.id).join(' lub ')}</b></span><button class="btn-primary btn" data-akcja="wybierz-serie" data-seria="${rekomendowana.id}">Dalej: ${rekomendowana.id} →</button>`
    : bezOdpowiedzi ? '<span class="muted">Odpowiedz na pytania albo wybierz serię z listy.</span>'
    : pasujace.length ? '<span class="muted">Wybierz serię z listy albo uzupełnij odpowiedzi.</span>'
    : '<span class="muted">Żadna seria nie spełnia wszystkich warunków – zmień odpowiedzi.</span>')}`;
}

function kartaWyniku(w, kompakt) {
  const s = seria(w.id);
  const plak = [
    w.rekomendowana ? '<span class="plakietka niebieska">Rekomendowana</span>' : '',
    w.pasuje ? '' : '<span class="plakietka czerwona">Nie spełnia warunków</span>'
  ].join('');
  const lista = [...w.plus.map(t => `<li>${esc(t)}</li>`), ...w.uwagi.map(t => `<li class="uwaga">${esc(t)}</li>`), ...w.minus.map(t => `<li class="minus">${esc(t)}</li>`)].join('');
  return `<div class="seria-karta ${w.pasuje ? (w.rekomendowana ? 'rekomendowana' : '') : 'odrzucona'}">
    <div>
      <h3>${w.id} ${plak}</h3>
      <p>${esc(s.podtytul)}</p>
      ${!kompakt ? `<div class="parametry">${parametrySerii(w.id)}</div>` : ''}
      ${lista ? `<ul class="powody">${lista}</ul>` : ''}
    </div>
    <div><button class="btn ${w.pasuje ? 'btn-primary' : ''} btn-sm" data-akcja="wybierz-serie" data-seria="${w.id}">Wybierz</button></div>
  </div>`;
}

function parametrySerii(id) {
  const s = seria(id);
  const wys = s.podlogi.map(p => `${p === 'wylewka' ? 'wylewka' : 'techn.'} ${s.wysokosc[p][1] >= 999 ? 'od ' + s.wysokosc[p][0] : s.wysokosc[p][0] + '–' + s.wysokosc[p][1]} mm`).join(' · ');
  const mod = id === 'KGT' ? '1,5 / 2,5 mod.' : `${s.moduly[0]}–${s.moduly[1]} mod. K45`;
  return [s.ip, s.ik, mod, wys, s.zamek ? 'zamek' : null, s.osprzet.includes('S500') ? 'opcja Simon 500' : null]
    .filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('');
}

function widokSeria() {
  const wyniki = S.kreator ? dopasuj(S.odp) : Object.keys(R.serie)
    .map(id => ({ id, pasuje: true, plus: [], minus: [], uwagi: [], rekomendowana: R.rekomendowane.includes(id) }))
    .sort((a, b) => b.rekomendowana - a.rekomendowana);
  return `<section class="panel">
    <h1>Wybierz serię puszki</h1>
    <p class="muted" style="margin:0 0 16px">${S.kreator ? 'Serie ułożone wg dopasowania do Twoich odpowiedzi.' : 'Wszystkie aktualne serie puszek podłogowych Kontakt-Simon.'}
      ${S.kreator ? '<button class="btn-link" data-akcja="idz" data-widok="start">Zmień odpowiedzi</button>' : '<button class="btn-link" data-akcja="idz" data-widok="start">Nie wiesz, którą? Odpowiedz na pytania</button>'}</p>
    <div class="wyniki">${wyniki.map(w => kartaWyniku(w, false)).join('')}</div>
  </section>
  ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="start">← Wstecz</button>', '')}`;
}

// --- Wariant puszki (krok 2) ---
function sekcja(tytul, tresc) { return `<div class="sekcja"><h3>${tytul}</h3>${tresc}</div>`; }
function checkbox(pole, wart, tytul, opis) {
  return `<label class="check"><input type="checkbox" data-pole="${pole}" data-typ="bool" ${wart ? 'checked' : ''}><span>${tytul}${opis ? `<br><span class="muted small">${opis}</span>` : ''}</span></label>`;
}

function widokWariant() {
  const id = S.seria, s = seria(id), c = S.cfg;
  const r = s.rozmiary[c.rozmiar];
  const n = potrzebneModuly(S.odp.potrzeby);
  const podl = s.podlogi.length > 1 ? sekcja('Rodzaj podłogi', `<div class="opcje">${s.podlogi.map(p => opcja('cfg.podloga', p, p === 'wylewka' ? 'Podłoga wylewana' : 'Podłoga techniczna', null, c.podloga === p)).join('')}</div>`) : sekcja('Rodzaj podłogi', '<p class="muted" style="margin:0">Tylko podłoga wylewana.</p>');
  const rozmiary = sekcja('Wielkość puszki', `<div class="opcje">${s.rozmiary.map((x, i) => {
    const tyt = id === 'KGT' ? x.nazwa : (id === 'KFP' ? `${x.k45}×K45 – ${x.ksztalt}` : `${x.k45}×K45${x.k45pol ? ` + ${x.k45pol}×K45/2` : ''}`);
    const pod = [x.obciazenie ? `do ${x.obciazenie} kg` : null, S.kreator && id !== 'KGT' && n > x.k45 ? `za mała (potrzeba ${n})` : null].filter(Boolean).join(' · ');
    return opcja('cfg.rozmiar', i, tyt, pod, c.rozmiar === i);
  }).join('')}</div>`);
  let tresc = podl + rozmiary;

  const kasetaZamontowana = checkbox('cfg.bezKasety', c.bezKasety, 'Kaseta jest już zamontowana', 'nie dodawaj kasety do zestawu (np. wymiana puszki na zamiennik)');
  if (id === 'KFR') {
    if (c.zamiennik) tresc = `<p class="komunikat ok">Zamiennik wycofanej puszki <b>${esc(c.zamiennik.sf)}</b> → <b>${esc(c.zamiennik.kf)}</b> (ta sama wielkość, zakres głębokości i kolor). Puszki KFR pasują do zamontowanych kaset G11–G66 i G300–G600, a nakładki S105–S605 bez zmian.</p>` + tresc;
    tresc += sekcja('Standard osprzętu', `<div class="opcje">${opcja('cfg.osprzet', 'K45', 'K45 (zalecane)', 'moduły montowane bezpośrednio', c.osprzet === 'K45')}${opcja('cfg.osprzet', 'S500', 'Simon 500', 'puszka S500 + adaptery do K45', c.osprzet === 'S500')}</div>`);
    tresc += sekcja('Zakres głębokości', `<div class="opcje">${Object.entries(s.glebokosci).map(([k, g]) => opcja('cfg.glebokosc', k, g.nazwa, 'regulowana', c.glebokosc === k)).join('')}</div>`);
    tresc += sekcja('Kolor puszki', `<div class="opcje">${Object.entries(s.kolory).map(([k, t]) => opcja('cfg.kolor', k, `${kropka(k)}${t}`, null, c.kolor === k)).join('')}</div>`);
    if (c.podloga === 'wylewka') {
      tresc += sekcja('Kaseta do wylewki', `<div class="opcje">
        ${opcja('cfg.kaseta', 'tworzywo', `Z tworzywa – ${r.kasetaTworzywo}`, `${s.kasety.tworzywo.zakres[r.kasetaTworzywo].join('–')} mm`, c.kaseta !== 'metal' || !r.kasetaMetal)}
        ${opcja('cfg.kaseta', 'metal', r.kasetaMetal ? `Metalowa – ${r.kasetaMetal}` : 'Metalowa', r.kasetaMetal ? `${s.kasety.metal.zakres[r.kasetaMetal].join('–')} mm` : 'od 6×K45', c.kaseta === 'metal' && !!r.kasetaMetal, !r.kasetaMetal)}
      </div>${kasetaZamontowana}`);
    }
    tresc += sekcja('Wykończenie pokrywy', `<div class="opcje">
      ${opcja('cfg.wykonczenie', 'wypelnienie', 'Materiał podłogi w pokrywie', 'do 5 mm (wykładzina, panele)', c.wykonczenie === 'wypelnienie')}
      ${opcja('cfg.wykonczenie', 'nakladka', `Nakładka ${r.nakladka}${c.kolor}`, 'antypoślizgowa, gdy podłoga > 5 mm', c.wykonczenie === 'nakladka')}
      ${opcja('cfg.wykonczenie', 'inox', `Nakładka inox ${r.nakladkaInox}`, 'stal nierdzewna – wersja estetyczna', c.wykonczenie === 'inox')}
    </div>`);
  } else if (id === 'KGT') {
    tresc += sekcja('Pokrywa', `<p class="komunikat info" style="margin:0">${KGT_POKRYWA}</p>`);
    tresc += sekcja('Kolor pokrywy', `<div class="opcje">${Object.entries(s.kolory).map(([k, t]) => opcja('cfg.kolor', k, `${kropka(k)}${t}`, k === '/74' ? 'tylko wewnątrz' : 'wewnątrz i na zewnątrz', c.kolor === k, k === '/74' && S.odp.miejsce === 'zewnatrz')).join('')}</div>`);
    tresc += sekcja('Zamek pokrywy', `<div class="opcje">${Object.entries(s.zamki).map(([k, z]) => opcja('cfg.zamek', k, k === 'latwy' ? 'Ułatwiony dostęp' : 'Bezpieczny (imbus)', z.nazwa, c.zamek === k)).join('')}</div>`);
    tresc += sekcja('Gniazdo we wkładzie', `<div class="opcje">
      ${opcja('cfg.gniazdo', 'E', `${r.k45 === 2 ? '2× ' : ''}Gniazdo z bolcem (typ E)`, 'zalecane', c.gniazdo === 'E')}
      ${opcja('cfg.gniazdo', 'F', `${r.k45 === 2 ? '2× ' : ''}Gniazdo Schuko (typ F)`, null, c.gniazdo === 'F')}
      ${opcja('cfg.gniazdo', 'brak', 'Bez gniazda', `puste miejsce na ${r.k45} mod. K45`, c.gniazdo === 'brak')}
    </div>`);
    const dodatki = Object.entries(s.wkladDodatek).filter(([k]) => c.gniazdo !== 'brak' || ['zaslepka', 'keystone'].includes(k));
    tresc += sekcja('Moduł 22,5×45 we wkładzie', `<div class="opcje">${dodatki.map(([k, d]) => {
      const istnieje = !!P[kgtWklad(c, { dodatek: k })];
      return opcja('cfg.dodatek', k, d.nazwa, istnieje ? null : `niedostępne z zamkiem ${c.zamek === 'imbus' ? 'imbusowym' : 'ułatwionym'}`, c.dodatek === k, !istnieje);
    }).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">Wkład: <span class="symbol">${esc(kgtWklad(c))}</span> – ${esc(nazwaProd(kgtWklad(c)))}</p>`);
    if (c.podloga === 'wylewka') tresc += sekcja('Akcesoria', checkbox('cfg.lacznik', c.lacznik, `Łącznik puszek ${s.akcesoria.laczenie}`, 'do zespolenia kilku puszek w wylewce'));
    tresc += '<p class="komunikat info" style="margin-top:12px">Osłony IP54 (KFA1001/KFA2001) i śruby poziomujące (KFA1003) zostaną dodane, gdy pojawią się w cenniku.</p>';
  } else if (id === 'FB') {
    tresc += sekcja('Standard osprzętu', `<div class="opcje">${opcja('cfg.osprzet', 'K45', 'K45 (zalecane)', `ramki ${s.ramkaK45}`, c.osprzet === 'K45')}${opcja('cfg.osprzet', 'S500', 'Simon 500', `ramki ${s.ramkaS500}`, c.osprzet === 'S500')}</div>`);
    tresc += sekcja('Pokrywa', `<div class="opcje">${opcja('cfg.pokrywa', '5', 'Na wykończenie 5 mm', 'wykładzina', c.pokrywa === '5')}${opcja('cfg.pokrywa', '12', 'Na wykończenie 12 mm', 'płytki, parkiet, kamień', c.pokrywa === '12')}</div>` + checkbox('cfg.zamek', c.zamek, 'Pokrywa z zamkiem', 'klucz trójkątny 6,5 mm – wykonanie na zamówienie'));
    tresc += sekcja('Wyposażenie', checkbox('cfg.oslony', c.oslony, `Osłony ramek ${s.oslona}`, 'zabezpieczają gniazda od spodu'));
    if (c.podloga === 'wylewka') {
      tresc += sekcja('Kaseta metalowa do wylewki', `<div class="opcje">${Object.entries(r.kasety).map(([k, [a, b]]) => opcja('cfg.kaseta', k, k, `${a}–${b} mm`, c.kaseta === k)).join('')}</div>` +
        kasetaZamontowana + checkbox('cfg.szalunek', c.szalunek, `Zestaw szalunkowy ${r.szalunek}`) + checkbox('cfg.stopki', c.stopki, `Zestaw stopek ${s.stopki}`, 'podwyższenie kasety'));
    }
  } else if (id === 'KFP') {
    if (c.podloga === 'wylewka') tresc += sekcja('Kaseta do wylewki', `<p style="margin:0">Kaseta <b>${r.kaseta}</b> (54,5–90 mm) – dodawana automatycznie.</p>${kasetaZamontowana}`);
    tresc += sekcja('Wykończenie pokrywy', checkbox('cfg.nakladka', c.nakladka, `Nakładka wykończeniowa ${r.nakladka}`, 'gdy nie wypełniasz pokrywy materiałem podłogi (do 5,5 mm)'));
  } else if (id === 'KGH') {
    tresc += sekcja('Wykończenie pokrywy', '<p style="margin:0">Pokrywę ze stali nierdzewnej wypełnia się materiałem podłogi: 17 mm, a po wyjęciu blachy wzmacniającej 20 mm. Rama z pokrywą zawiera ramkę K45, śruby poziomujące i płytkę separacyjną.</p>');
  }

  const z = zestaw();
  return `<div class="siatka-2">
    <section class="panel">
      <h1>${esc(s.nazwa)} <span class="muted" style="font-weight:400;font-size:16px">– ${esc(s.podtytul)}</span></h1>
      <p class="muted" style="margin:0 0 8px">${esc(s.opis)}</p>
      <div class="parametry" style="margin-bottom:14px">${parametrySerii(id)}</div>
      ${tresc}
    </section>
    <aside class="lepkie">${panelZestawu(z, false)}</aside>
  </div>
  ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="seria">← Wstecz</button>', `<button class="btn btn-primary" data-akcja="idz" data-widok="osprzet">Dalej: osprzęt →</button>`)}`;
}

function panelZestawu(z, pelny) {
  const wiersze = z.pozycje.map(p => `<tr><td><span class="symbol">${esc(p.symbol)}</span><div class="small muted">${esc(p.opis || '')}</div></td><td class="num">${p.ilosc}</td><td class="num">${P[p.symbol] ? zl(p.ilosc * cena(p.symbol)) : '—'}</td></tr>`).join('');
  return `<div class="panel">
    <h2>Twój zestaw</h2>
    ${z.bledy.map(b => `<p class="komunikat blad">${esc(b)}</p>`).join('')}
    <table class="tabela"><thead><tr><th>Symbol</th><th class="num">Szt.</th><th class="num">Netto</th></tr></thead><tbody>${wiersze || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody></table>
    <div class="suma-box" style="margin-top:12px">
      <div class="wiersz"><span class="muted">Razem netto (1 puszka)</span><b>${zl(z.netto)}</b></div>
      <div class="wiersz"><span class="muted">Razem brutto</span><span>${zl(brutto(z.netto))}</span></div>
    </div>
    ${pelny ? '' : '<p class="small muted" style="margin:10px 0 0">Ceny katalogowe wg ' + esc(META.cennik || 'cennika') + '.</p>'}
  </div>`;
}

// Rekomendacja wkładów RJ45 Keystone do płytek K76/KB76/KB80 i wkładów KGT z modułem Keystone
function sekcjaKeystone() {
  const porty = portyKeystone();
  if (!porty) return '';
  const wybr = S.keystone || R.keystone.domyslny;
  const opcje = Object.entries(R.keystone.opcje).map(([sym, opis]) =>
    opcja('keystone', sym, `${sym}${sym === R.keystone.domyslny ? ' (zalecany)' : ''}`, `${opis} · ${zl(cena(sym))}`, wybr === sym, !P[sym])).join('');
  const zs = R.keystone.zaslepki || {};
  const z = S.zaslepkiKs || {};
  const symZ = zs[z.symbol] ? z.symbol : Object.keys(zs)[0];
  const zaslepki = symZ ? `<div class="sekcja" style="margin-top:10px;padding-bottom:0;border-color:#bfe8cf">
      <b>Opcja: zaślepki wolnych gniazd RJ45</b>
      <span class="small muted" style="display:block;margin:2px 0 8px">Gdy nie wszystkie gniazda płytki będą wykorzystane${R.keystone.zaslepkiDoWeryfikacji ? ' · <span class="plakietka pomaranczowa">symbol do weryfikacji zgodności</span>' : ''}</span>
      <div class="opcje" style="align-items:center">
        <select class="kolor-select" data-pole="zaslepkiKs.symbol" aria-label="Zaślepka">${Object.entries(zs).map(([sym, opis]) => `<option value="${esc(sym)}" ${sym === symZ ? 'selected' : ''} ${P[sym] ? '' : 'disabled'}>${esc(sym)} – ${esc(opis)} · ${zl(cena(sym))}</option>`).join('')}</select>
        ${licznik('zaslepkiKs.ilosc', z.ilosc || 0, 0, porty)}
        <span class="small muted">maks. ${porty} szt.</span>
      </div>
    </div>` : '';
  return `<div class="komunikat ok">
    <b>Płytki RJ45 wymagają wkładów Keystone – rekomendujemy ${porty} szt.</b>
    <div class="opcje" style="margin-top:8px">${opcje}${opcja('keystone', 'brak', 'Bez wkładów', 'klient ma własne', wybr === 'brak')}</div>
    ${zaslepki}
  </div>`;
}

// --- Osprzęt (krok 3) ---
function widokOsprzet() {
  const id = S.seria, s = seria(id);
  const u = uzycie();
  const cap = u.cap;
  const z = zestaw();
  if (cap.pelne === 0) {
    const powod = id === 'KGT' ? 'Wkład KGT ma wbudowane gniazdo i moduł 22,5×45 – nie ma miejsca na dodatkowe moduły. Aby dobrać własne moduły K45, wybierz w poprzednim kroku wkład „Bez gniazda”.' : 'Osprzęt Simon 500 do ramek FBA401 nie jest jeszcze obsługiwany w konfiguratorze – dobierz go osobno.';
    return `<div class="siatka-2"><section class="panel"><h1>Osprzęt</h1><p class="komunikat info">${powod}</p>${sekcjaKeystone()}</section><aside class="lepkie">${panelZestawu(z, false)}</aside></div>
      ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="wariant">← Wstecz</button>', '<button class="btn btn-primary" data-akcja="idz" data-widok="podsumowanie">Dalej: podsumowanie →</button>')}`;
  }
  const proc = Math.min(100, Math.round(u.jednostkiPelne / cap.pelne * 100));
  const przekr = u.pelne > cap.pelne;
  const hdmiPol = (S.moduly['hdmi-pol'] && S.moduly['hdmi-pol'].ilosc) || 0;
  const wiekszy = przekr ? s.rozmiary.findIndex(r => r.k45 >= u.pelne) : -1;

  const grupy = R.moduly.grupy.map(g => {
    const mods = R.moduly.lista.filter(m => m.grupa === g.id && (S.pelnaLista || m.podstawowy || (S.moduly[m.id] && S.moduly[m.id].ilosc)));
    if (!mods.length) return '';
    return `<tr class="grupa-wiersz"><td colspan="5">${g.nazwa}</td></tr>` + mods.map(m => {
      const q = (S.moduly[m.id] && S.moduly[m.id].ilosc) || 0;
      const k = kolorModulu(m);
      const sym = m.baza + k.kolor;
      const kolSel = `<select class="kolor-select" data-pole="moduly.${m.id}.kolor" aria-label="Kolor">${k.dost.map(d => `<option value="${d}" ${d === k.kolor ? 'selected' : ''}>${esc(R.moduly.kolory[d] || d)}${d === k.zalecany ? ' (zalecany)' : ''}</option>`).join('')}</select>`;
      return `<tr class="modul-wiersz ${q ? 'aktywny' : ''}">
        <td>${esc(m.nazwa)}${m.opcja ? ' <span class="plakietka">opcja</span>' : ''}${m.szer < 1 ? ' <span class="plakietka">22,5×45</span>' : ''}<div class="small"><span class="symbol">${esc(sym)}</span></div>${k.zamiennik ? `<span class="zamiennik">Brak w kolorze ${esc(R.moduly.kolory[k.zalecany] || k.zalecany)} – proponujemy ${esc(R.moduly.kolory[k.kolor] || k.kolor)}</span>` : ''}</td>
        <td>${kropka(k.kolor)}${kolSel}</td>
        <td class="num">${zl(cena(sym))}</td>
        <td>${licznik(`moduly.${m.id}.ilosc`, q, 0, 24)}</td>
        <td class="num">${q ? zl(q * cena(sym)) : ''}</td>
      </tr>`;
    }).join('');
  }).join('');

  return `<div class="siatka-2">
    <section class="panel">
      <h1>Dobór gniazd i modułów K45</h1>
      <div class="pojemnosc ${przekr ? 'przekroczona' : ''}">
        <div class="pasek"><div class="wypelnienie" style="width:${proc}%"></div></div>
        <div class="opis"><span>Zajęte: <b>${liczbaPl(u.jednostkiPelne)}</b> z ${cap.pelne} miejsc K45 (połówka 22,5×45 = 0,5)</span><span>Wolne: ${liczbaPl(Math.max(0, cap.pelne - u.jednostkiPelne))}</span></div>
        ${cap.polowki ? `<div class="opis small"><span>Dodatkowo ${cap.polowki} ${cap.polowki < 5 ? 'miejsca' : 'miejsc'} K45/2 ${id === 'FB' ? 'w ramkach' : 'w puszce'} – tylko na moduły 22,5×45 (np. ładowarka USB-C 20 W, złącze USB A): zajęte <b>${u.polowki}</b> z ${cap.polowki}. Wolne są <b>fabrycznie zaślepione</b>.</span></div>` : ''}
      </div>
      ${przekr ? `<p class="komunikat blad">Za dużo modułów dla tej puszki. ${wiekszy >= 0 ? `<button class="btn btn-sm" data-akcja="ustaw" data-pole="cfg.rozmiar" data-wartosc="${wiekszy}">Zmień na ${s.rozmiary[wiekszy].k45}×K45</button>` : 'Rozważ drugą puszkę albo serię o większej pojemności.'}</p>` : ''}
      ${sekcjaAc11()}
      ${hdmiPol ? `<p class="komunikat info">Do każdego adaptera HDMI <b>K129B</b> dodajemy <b>zaślepkę 22,5×45 (K105)</b> w tym samym kolorze – kabel HDMI podłącza się pod zaślepką. Razem zajmują pełne miejsce K45 (dodano ${hdmiPol} szt. K105).</p>` : ''}
      ${sekcjaKeystone()}
      <div class="opcje" style="margin-bottom:12px;align-items:center">
        <span class="muted">Kolor osprzętu:</span>
        ${['/9', '/14', '/8'].map(k => opcja('kolorOsprzetu', k, `${kropka(k)}${R.moduly.kolory[k]}`, null, S.kolorOsprzetu === k)).join('')}
        <span class="small muted">Gniazda DATA (UPS) zawsze proponujemy w kolorze czerwonym.</span>
      </div>
      <table class="tabela">
        <thead><tr><th>Moduł</th><th>Kolor</th><th class="num">Cena netto</th><th>Ilość</th><th class="num">Wartość</th></tr></thead>
        <tbody>${grupy}</tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:12px;flex-wrap:wrap">
        <button class="btn" data-akcja="przelacz" data-pole="pelnaLista">${S.pelnaLista ? 'Pokaż tylko podstawowe' : 'Pokaż pełną listę modułów'}</button>
        ${checkbox('zaslepki', S.zaslepki, 'Uzupełnij wolne miejsca zaślepkami', 'K17 na całe miejsca K45, K105 na połówki 22,5×45')}
      </div>
    </section>
    <aside class="lepkie">${panelZestawu(z, false)}</aside>
  </div>
  ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="wariant">← Wstecz</button>', `<button class="btn btn-primary" data-akcja="idz" data-widok="podsumowanie" ${przekr ? 'disabled' : ''}>Dalej: podsumowanie →</button>`)}`;
}

// --- Podsumowanie (krok 4) ---
function wierszeProduktow(pozycje, mnoznik, zDostepnoscia = true) {
  const grupy = [['puszka', 'Puszka i akcesoria'], ['osprzet', 'Osprzęt K45']];
  return grupy.map(([rola, tyt]) => {
    const pp = pozycje.filter(p => p.rola === rola);
    if (!pp.length) return '';
    return `<tr class="grupa-wiersz"><td colspan="8">${tyt}</td></tr>` + pp.map(p => {
      const suma = p.ilosc * mnoznik;
      return `<tr>
        <td><img class="miniatura pusta" data-miniatura="${esc(p.symbol)}" alt=""></td>
        <td><span class="symbol">${esc(p.symbol)}</span></td>
        <td>${esc(nazwaProd(p.symbol))}${p.brak ? '<div class="small" style="color:var(--bad)">Kombinacja niedostępna</div>' : ''}</td>
        <td class="num">${p.ilosc}${mnoznik > 1 ? ` × ${mnoznik} = <b>${suma}</b>` : ''}</td>
        <td class="num">${zl(cena(p.symbol))}</td>
        <td class="num">${zl(suma * cena(p.symbol))}</td>
        <td>${zDostepnoscia && !p.brak ? `<span class="dostepnosc" data-stan="${esc(p.symbol)}" data-potrzeba="${suma}">sprawdzam…</span>` : ''}</td>
        <td><div class="dokumenty" data-dokumenty="${esc(p.symbol)}"><span class="muted small">…</span></div></td>
      </tr>`;
    }).join('');
  }).join('');
}

function widokPodsumowanie() {
  const s = seria(S.seria);
  const z = zestaw();
  const n = Math.max(1, S.liczbaPuszek || 1);
  const netto = z.netto * n;
  const katalogi = [{ nazwa: `Katalog serii ${s.nazwa}`, url: s.katalog }, ...KATALOGI.filter(k => k.seria === S.seria)];
  return `<div class="siatka-2">
    <section class="panel">
      <h1>Podsumowanie zestawu</h1>
      <p class="muted" style="margin:0 0 12px">${esc(s.nazwa)} – ${esc(s.podtytul)}</p>
      ${z.bledy.map(b => `<p class="komunikat blad">${esc(b)}</p>`).join('')}
      ${z.uwagi.map(b => `<p class="komunikat">${esc(b)}</p>`).join('')}
      ${S.odp.miejsce === 'mokre' && !['KGT', 'KGH'].includes(S.seria) && S.kreator ? '<p class="komunikat">Przy myciu na mokro rekomendujemy KGT (IP66) lub KGH. Ta seria też może się sprawdzić – potwierdź z przedstawicielem handlowym.</p>' : ''}
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" data-akcja="mail-braki-zestaw" title="Jeden mail do ${esc(R.email_bok)} z listą pozycji, których brakuje na magazynie">✉ Zapytaj o wszystkie brakujące pozycje</button></div>
      <div style="overflow-x:auto">
      <table class="tabela">
        <thead><tr><th></th><th>Symbol</th><th>Nazwa</th><th class="num">Ilość</th><th class="num">Cena netto</th><th class="num">Wartość netto</th><th>Dostępność</th><th>Dokumenty</th></tr></thead>
        <tbody>${wierszeProduktow(z.pozycje, n)}</tbody>
      </table></div>
      <h3 style="margin-top:18px">Katalogi</h3>
      <div class="dokumenty">${katalogi.map(k => `<a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.nazwa)}</a>`).join('')}</div>
    </section>
    <aside class="lepkie">
      <div class="panel">
        <h2>Zestaw</h2>
        <label class="small muted" for="nazwa-zestawu">Nazwa (np. pomieszczenie)</label>
        <input id="nazwa-zestawu" class="tekst" style="width:100%;margin:4px 0 12px" data-pole="nazwaZestawu" data-bez-renderu value="${esc(S.nazwaZestawu)}" placeholder="${esc(nazwaDomyslnaZestawu())}">
        <div class="potrzeba" style="margin-bottom:12px"><span>Liczba takich puszek</span>${licznik('liczbaPuszek', n, 1, 999)}</div>
        <div class="suma-box">
          <div class="wiersz"><span class="muted">1 puszka netto</span><span>${zl(z.netto)}</span></div>
          <div class="wiersz"><span class="muted">Razem netto</span><b>${zl(netto)}</b></div>
          <div class="wiersz"><span class="muted">VAT ${Math.round(R.vat * 100)}%</span><span>${zl(brutto(netto) - netto)}</span></div>
          <div class="wiersz duzy"><span>Brutto</span><span>${zl(brutto(netto))}</span></div>
        </div>
        <div style="display:grid;gap:8px;margin-top:14px">
          <button class="btn btn-primary" data-akcja="dodaj-do-oferty" ${z.bledy.length ? 'disabled' : ''}>${S.edytowany != null ? 'Zapisz zmiany w ofercie' : 'Dodaj do oferty →'}</button>
          <button class="btn" data-akcja="dodaj-i-kolejna" ${z.bledy.length ? 'disabled' : ''}>+ ${S.edytowany != null ? 'Zapisz i skonfiguruj' : 'Dodaj i skonfiguruj'} kolejną puszkę</button>
          <button class="btn" data-akcja="karta-zestawu">Karta zestawu (PDF)</button>
          <button class="btn" data-akcja="salesforce-zestaw">Kopiuj do Salesforce</button>
        </div>
      </div>
    </aside>
  </div>
  ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="osprzet">← Wstecz</button>', `<button class="btn" data-akcja="dodaj-i-kolejna" ${z.bledy.length ? 'disabled' : ''}>+ Dodaj i skonfiguruj kolejną puszkę</button><button class="btn btn-primary" data-akcja="dodaj-do-oferty" ${z.bledy.length ? 'disabled' : ''}>${S.edytowany != null ? 'Zapisz zmiany w ofercie' : 'Dalej: dodaj do oferty →'}</button>`)}`;
}

// --- Oferta (krok 5) ---
function pozycjeOferty() {
  const mapa = new Map();
  for (const z of S.oferta.zestawy) {
    for (const p of z.pozycje) {
      const k = p.symbol;
      const e = mapa.get(k) || { symbol: k, ilosc: 0, seria: p.rola === 'osprzet' ? 'K45' : z.seria };
      e.ilosc += p.ilosc * z.liczba;
      mapa.set(k, e);
    }
  }
  return [...mapa.values()].map(p => ({ ...p, nazwa: nazwaProd(p.symbol), kolor: kolorZSymbolu(p.symbol, p.seria), jm: (P[p.symbol] && P[p.symbol].jm) || 'szt.', cena: cena(p.symbol) }));
}

function widokOferta() {
  const zs = S.oferta.zestawy;
  const poz = pozycjeOferty();
  const rab = rabatOferty();
  const sumaKat = poz.reduce((a, p) => a + p.ilosc * p.cena, 0);
  const cenaR = c => Math.round(c * (1 - rab / 100) * 100) / 100;
  const sumaN = poz.reduce((a, p) => a + p.ilosc * cenaR(p.cena), 0);
  const zestawyHtml = zs.length ? zs.map((z, i) => `<tr>
      <td><b>${esc(z.nazwa)}</b><div class="small muted">${esc(z.opis)}</div></td>
      <td class="num">${licznik(`oferta.zestawy.${i}.liczba`, z.liczba, 1, 9999)}</td>
      <td class="num">${zl(z.netto * z.liczba)}</td>
      <td class="num"><button class="btn btn-sm" data-akcja="edytuj-zestaw" data-i="${i}">Edytuj</button> <button class="btn btn-sm" data-akcja="duplikuj-zestaw" data-i="${i}">Duplikuj</button> <button class="btn btn-sm" data-akcja="usun-zestaw" data-i="${i}">Usuń</button></td>
    </tr>`).join('') : '<tr><td colspan="4" class="muted">Oferta jest pusta – skonfiguruj puszkę i dodaj ją do oferty.</td></tr>';
  const tabela = poz.map((p, i) => `<tr>
      <td>${i + 1}</td><td>${esc(p.nazwa)}</td><td><span class="symbol">${esc(p.symbol)}</span></td><td>${esc(p.seria)}</td><td>${esc(p.kolor)}</td>
      <td class="num">${p.ilosc}</td><td class="num">${zl(p.cena)}</td><td class="num">${zl(cenaR(p.cena))}</td><td class="num">${zl(p.ilosc * cenaR(p.cena))}</td><td class="num">${zl(brutto(p.ilosc * cenaR(p.cena)))}</td>
      <td><span class="dostepnosc" data-stan="${esc(p.symbol)}" data-potrzeba="${p.ilosc}">…</span></td>
    </tr>`).join('');

  // rabat wpisuje każdy sam – dowolny, 0–100%
  const polRabatu = `<label class="pole">Rabat <input type="number" min="0" max="100" step="0.5" data-pole="oferta.rabat" data-typ="num" value="${rab}"> %</label>`;
  return `<section class="panel">
      <h1>Oferta</h1>
      ${panelWyceny()}
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin:12px 0">
        <label class="pole">Nazwa projektu <input type="text" class="tekst" data-pole="oferta.projekt" data-bez-renderu data-autozapis value="${esc(S.oferta.projekt)}" placeholder="np. Biurowiec A – piętro 2" style="width:260px"></label>
        <label class="pole">Klient (firma / osoba) <input type="text" class="tekst" data-pole="oferta.klient" data-bez-renderu data-autozapis value="${esc(S.oferta.klient)}" style="width:220px" list="lista-klientow" placeholder="np. Elektro-Hurt Łódź"></label>
        ${listaKlientowHtml()}
        ${polRabatu}
      </div>
      <h2>Zestawy</h2>
      <table class="tabela"><thead><tr><th>Zestaw</th><th class="num">Liczba puszek</th><th class="num">Wartość kat. netto</th><th></th></tr></thead><tbody>${zestawyHtml}</tbody></table>
      <p style="margin:12px 0 0"><button class="btn" data-akcja="nowy-zestaw">+ Dodaj kolejną puszkę</button></p>
    </section>
    ${poz.length ? `<section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 style="margin:0">Zestawienie materiałów (${poz.length} poz.)</h2>
        <button class="btn btn-sm" data-akcja="mail-braki-oferta" title="Jeden mail do ${esc(R.email_bok)} z listą pozycji, których brakuje na magazynie">✉ Zapytaj o wszystkie brakujące pozycje</button></div>
      <div style="overflow-x:auto"><table class="tabela">
        <thead><tr><th>Lp</th><th>Asortyment</th><th>Symbol</th><th>Seria</th><th>Kolor</th><th class="num">Ilość</th><th class="num">Cena kat. netto</th><th class="num">Po rabacie</th><th class="num">Wartość netto</th><th class="num">Wartość brutto</th><th>Dostępność</th></tr></thead>
        <tbody>${tabela}</tbody>
        <tfoot><tr><td colspan="8" class="num">Razem (przed rabatem: ${zl(sumaKat)})</td><td class="num">${zl(sumaN)}</td><td class="num">${zl(brutto(sumaN))}</td><td></td></tr></tfoot>
      </table></div>
      <p class="small muted">Ceny wg ${esc(META.cennik || 'cennika')}. VAT ${Math.round(R.vat * 100)}%.</p>
    </section>` : ''}
    ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="start">← Start</button>', poz.length ? `
      <label class="check" title="Wydruk / PDF i Excel bez kolumny z symbolami produktów"><input type="checkbox" data-pole="bezSymboli" data-typ="bool" ${S.bezSymboli ? 'checked' : ''}><span>Oferta bez symboli</span></label>
      <button class="btn" data-akcja="salesforce">Kopiuj do Salesforce</button>
      <button class="btn" data-akcja="excel">Pobierz Excel (z rabatem)</button>
      <button class="btn btn-primary" data-akcja="druk-oferty">Drukuj / zapisz PDF</button>` : '')}`;
}

// --- Dane (admin) ---
function widokAdmin() {
  const serieOpt = Object.keys(R.serie).map(id => `<option value="${id}">${id}</option>`).join('');
  return `<section class="panel">
      <h1>Aktualizacja danych</h1>
      <p class="muted" style="margin:0">Aktualny cennik: <b>${esc(META.cennik || '—')}</b> · ${META.liczba || 0} produktów · import: ${META.zaimportowano ? new Date(META.zaimportowano).toLocaleString('pl-PL') : '—'}</p>
    </section>
    ${sekcjaPoczty()}
    <section class="panel">
      <h2>Nowy cennik (xls / xlsx)</h2>
      <p class="muted">Wgraj „Cennik i arkusz wycen” Kontakt-Simon. Zaktualizuje ceny, doda nowe produkty i zapisze kopię poprzedniej bazy.</p>
      <div class="upload" data-upload="cennik"><p>Przeciągnij plik tutaj lub</p><input type="file" accept=".xls,.xlsx" data-plik="cennik"></div>
      <div id="wynik-cennik" style="margin-top:12px"></div>
    </section>
    <section class="panel">
      <h2>Nowy katalog PDF</h2>
      <p class="muted">Katalog pojawi się w podsumowaniu wybranej serii.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <label class="pole">Seria <select class="tekst" id="katalog-seria">${serieOpt}<option value="K45">Osprzęt K45</option><option value="inne">Inne</option></select></label>
        <label class="pole">Tytuł <input class="tekst" id="katalog-tytul" type="text" placeholder="np. Katalog KFR 2027" style="width:260px"></label>
      </div>
      <div class="upload" data-upload="katalog"><p>Przeciągnij PDF tutaj lub</p><input type="file" accept=".pdf" data-plik="katalog"></div>
      <h3 style="margin-top:16px">Wgrane katalogi</h3>
      ${KATALOGI.length ? `<table class="tabela"><tbody>${KATALOGI.map(k => `<tr><td>${esc(k.seria)}</td><td><a href="${esc(k.url)}" target="_blank">${esc(k.nazwa)}</a></td><td class="num"><button class="btn btn-sm" data-akcja="usun-katalog" data-url="${esc(k.url)}">Usuń</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Brak.</p>'}
    </section>
    ${sekcjaRegul()}
    ${pasekAkcji('<button class="btn" data-akcja="idz" data-widok="start">← Start</button>', '')}`;
}

// ---------- Render ----------
function render() {
  const widoki = {
    start: widokStart, kreator: widokKreator, seria: widokSeria, wariant: widokWariant, osprzet: widokOsprzet, podsumowanie: widokPodsumowanie, oferta: widokOferta,
    admin: widokAdmin, logowanie: widokLogowanie, rejestracja: widokRejestracja, wyceny: widokWyceny,
    konta: widokKonta, powiadomienia: widokPowiadomienia, uwagi: widokUwagi
  };
  if (S.widok === 'kreator') S.widok = 'start'; // pytania kreatora są na stronie startowej
  if (['wariant', 'osprzet', 'podsumowanie'].includes(S.widok) && !S.seria) S.widok = 'seria';
  if (['admin', 'uwagi'].includes(S.widok) && !adminKS()) S.widok = 'start';
  $('#menu-konta').innerHTML = menuKonta();
  $('#app').innerHTML = (widoki[S.widok] || widokStart)();
  $('#stepper').innerHTML = stepper();
  $('#licznik-oferty').textContent = S.oferta.zestawy.length;
  zapisz();
  wypelnijAsynchroniczne();
}

// ---------- Akcje ----------
function zestawZeStanu(st) {
  const z = zestaw(st);
  const kopia = JSON.parse(JSON.stringify({ seria: st.seria, cfg: st.cfg, moduly: st.moduly, kolorOsprzetu: st.kolorOsprzetu, keystone: st.keystone, zaslepkiKs: st.zaslepkiKs, ac11: st.ac11, zaslepki: st.zaslepki, odp: st.odp, kreator: st.kreator }));
  return {
    nazwa: st.nazwaZestawu || nazwaDomyslnaZestawu(st),
    opis: `${seria(st.seria).nazwa} · ${z.pozycje.length} poz.`,
    seria: st.seria,
    liczba: Math.max(1, st.liczbaPuszek || 1),
    pozycje: z.pozycje.map(p => ({ symbol: p.symbol, ilosc: p.ilosc, rola: p.rola })),
    netto: z.netto,
    stan: kopia
  };
}
const zestawDoOferty = () => zestawZeStanu(S);

function wczytajZestaw(i) {
  const z = S.oferta.zestawy[i];
  Object.assign(S, JSON.parse(JSON.stringify(z.stan)));
  S.nazwaZestawu = z.nazwa;
  S.liczbaPuszek = z.liczba;
  S.edytowany = i;
  S.widok = 'wariant';
}

function tekstSalesforce(pozycje) { return pozycje.map(p => `${p.symbol} ${p.ilosc}`).join('\n'); }
async function kopiuj(t, co) {
  try { await navigator.clipboard.writeText(t); toast(`Skopiowano ${co} – wklej w Salesforce`); }
  catch { window.prompt('Skopiuj ręcznie (Ctrl+C):', t); }
}

function pobierzPlik(nazwa, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nazwa;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function drukuj(html, symbole) {
  await Promise.all(symbole.map(s => info(s)));
  const druk = $('#druk');
  druk.innerHTML = html;
  druk.querySelectorAll('[data-druk-img]').forEach(img => { const i = INFO[img.dataset.drukImg]; if (i && i.zdjecie) img.src = i.zdjecie; else img.remove(); });
  druk.querySelectorAll('[data-druk-karta]').forEach(a => { const i = INFO[a.dataset.drukKarta]; if (i && i.karta) a.href = i.karta; else a.replaceWith(document.createTextNode('—')); });
  await Promise.all([...druk.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  window.print();
}

function htmlKartyZestawu() {
  const s = seria(S.seria), z = zestaw(), n = Math.max(1, S.liczbaPuszek || 1), r = s.rozmiary[S.cfg.rozmiar];
  const wys = s.podlogi.map(p => `${p === 'wylewka' ? 'wylewka' : 'podł. techniczna'}: ${s.wysokosc[p][1] >= 999 ? 'od ' + s.wysokosc[p][0] : s.wysokosc[p].join('–')} mm`).join('; ');
  const param = [
    ['Seria', `${s.nazwa} – ${s.podtytul}`], ['Rodzaj podłogi', S.cfg.podloga === 'wylewka' ? 'wylewana' : 'techniczna'],
    ['Wielkość', S.seria === 'KGT' ? r.nazwa : `${r.k45}×K45`], ['Stopień ochrony', `${s.ip}, ${s.ik}`],
    ['Obciążenie', r.obciazenie ? `do ${r.obciazenie} kg` : '—'], ['Zakres wysokości', wys], ['Liczba puszek', n]
  ];
  const wiersze = z.pozycje.map(p => `<tr><td><img data-druk-img="${esc(p.symbol)}" alt=""></td><td><b>${esc(p.symbol)}</b></td><td>${esc(nazwaProd(p.symbol))}</td><td class="num">${p.ilosc * n}</td><td class="num">${zl(cena(p.symbol))}</td><td class="num">${zl(cena(p.symbol) * p.ilosc * n)}</td><td><a data-druk-karta="${esc(p.symbol)}" href="#">karta PDF</a></td></tr>`).join('');
  return `<div class="naglowek"><div><h1>${esc(S.nazwaZestawu || nazwaDomyslnaZestawu())}</h1><div>Karta zestawu – puszka podłogowa Kontakt-Simon</div></div><div class="num">${dzis()}<br>${esc(META.cennik || '')}</div></div>
    <div class="param">${param.map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join('')}</div>
    <p>${esc(s.opis)}</p>
    <h2>Skład zestawu</h2>
    <table><thead><tr><th></th><th>Symbol</th><th>Nazwa</th><th class="num">Ilość</th><th class="num">Cena netto</th><th class="num">Wartość netto</th><th>Dokumentacja</th></tr></thead><tbody>${wiersze}</tbody>
    <tfoot><tr><td colspan="5" class="num"><b>Razem netto / brutto</b></td><td class="num"><b>${zl(z.netto * n)}</b><br>${zl(brutto(z.netto * n))}</td><td></td></tr></tfoot></table>
    <p>Katalog serii: <a href="${esc(s.katalog)}">${esc(s.katalog)}</a></p>
    <div class="stopka">Ceny katalogowe netto wg ${esc(META.cennik || 'cennika')}. Dokument poglądowy wygenerowany w konfiguratorze puszek podłogowych.</div>`;
}

function htmlOferty() {
  const poz = pozycjeOferty(), rab = rabatOferty();
  const cenaR = c => Math.round(c * (1 - rab / 100) * 100) / 100;
  const sumaN = poz.reduce((a, p) => a + p.ilosc * cenaR(p.cena), 0);
  const sym = !S.bezSymboli; // „Oferta bez symboli” – bez kolumny Symbol
  return `<div class="naglowek"><div><h1>Oferta Kontakt-Simon</h1><div>Projekt: <b>${esc(S.oferta.projekt || '—')}</b>${S.oferta.klient ? ` · Klient: <b>${esc(S.oferta.klient)}</b>` : ''}</div></div><div class="num">${S.oferta.kod ? `Kod wyceny: <b>${esc(S.oferta.kod)}</b><br>` : ''}${dzis()}<br>${esc(META.cennik || '')}</div></div>
    <h2>Zestawy</h2>
    <table><thead><tr><th>Zestaw</th><th class="num">Liczba</th></tr></thead><tbody>${S.oferta.zestawy.map(z => `<tr><td>${esc(z.nazwa)}</td><td class="num">${z.liczba}</td></tr>`).join('')}</tbody></table>
    <h2>Zestawienie materiałów</h2>
    <table><thead><tr><th>Lp</th><th>Asortyment</th>${sym ? '<th>Symbol</th>' : ''}<th>Seria</th><th>Kolor</th><th>Jedn.</th><th class="num">Ilość</th><th class="num">Cena kat. netto</th>${rab ? '<th class="num">Rabat</th><th class="num">Cena po rabacie</th>' : ''}<th class="num">Wartość netto</th><th class="num">Wartość brutto</th></tr></thead>
    <tbody>${poz.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nazwa)}</td>${sym ? `<td><b>${esc(p.symbol)}</b></td>` : ''}<td>${esc(p.seria)}</td><td>${esc(p.kolor)}</td><td>${esc(p.jm)}</td><td class="num">${p.ilosc}</td><td class="num">${zl(p.cena)}</td>${rab ? `<td class="num">${rab}%</td><td class="num">${zl(cenaR(p.cena))}</td>` : ''}<td class="num">${zl(p.ilosc * cenaR(p.cena))}</td><td class="num">${zl(brutto(p.ilosc * cenaR(p.cena)))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${(rab ? 10 : 8) - (sym ? 0 : 1)}" class="num"><b>SUMA</b></td><td class="num"><b>${zl(sumaN)}</b></td><td class="num"><b>${zl(brutto(sumaN))}</b></td></tr></tfoot></table>
    <div class="stopka">Ceny wg ${esc(META.cennik || 'cennika')} Kontakt-Simon, VAT ${Math.round(R.vat * 100)}%. Dokument poglądowy – nie stanowi oferty handlowej w rozumieniu Kodeksu cywilnego.</div>`;
}

// Nowa puszka = nowe zapytanie: czyścimy odpowiedzi rozpoznane z poprzedniego opisu
function wyczyscZapytanie() {
  S.opis = '';
  S.rozpoznane = null;
}

async function wyslijPlik(rodzaj, plik) {
  if (!plik) return;
  if (rodzaj === 'reguly') { await wczytajPlikRegul(plik); return; }
  if (rodzaj === 'cennik') {
    const wynik = $('#wynik-cennik');
    wynik.innerHTML = '<p class="muted">Importuję…</p>';
    const r = await fetch('/api/import/cennik?nazwa=' + encodeURIComponent(plik.name), { method: 'POST', body: plik });
    const j = await r.json();
    if (!r.ok) { wynik.innerHTML = `<p class="komunikat blad">${esc(j.blad)}</p>`; return; }
    await wczytajDane();
    render();
    $('#wynik-cennik').innerHTML = `<p class="komunikat ok">Zaimportowano <b>${esc(j.meta.cennik)}</b>: ${j.meta.liczba} produktów, ${j.zmianyCen} zmian cen, ${j.liczbaNowych} nowych produktów.${j.liczbaNowych ? `<br><span class="small">${j.nowe.slice(0, 40).map(esc).join(', ')}${j.liczbaNowych > 40 ? '…' : ''}</span>` : ''}</p>`;
  } else {
    const q = new URLSearchParams({ nazwa: plik.name, seria: $('#katalog-seria').value, tytul: $('#katalog-tytul').value || plik.name });
    const r = await fetch('/api/import/katalog?' + q, { method: 'POST', body: plik });
    const j = await r.json();
    if (!r.ok) { toast(j.blad); return; }
    KATALOGI = j.katalogi;
    toast('Dodano katalog');
    render();
  }
}

// ---------- Zamykanie oferty ----------
// Wyjście z ekranu oferty (poza „Dodaj kolejną puszkę”, edycją zestawów i eksportem) pyta o zapis
// i zamyka ofertę – kolejne kliknięcia zaczynają nową.
const WYJSCIA_Z_OFERTY = ['start', 'idz', 'krok', 'admin', 'nowy', 'wycena-otworz', 'wycena-po-kodzie', 'zamknij-oferte'];
// zamykają bieżącą ofertę z każdego ekranu – przy niezapisanych zmianach zawsze pytamy
const ZAMYKA_OFERTE = ['nowy', 'wycena-otworz', 'wycena-po-kodzie', 'zamknij-oferte'];
let wyjscieCzeka = null; // element, którego kliknięcie wstrzymało okno

function wychodziZOferty(a, el) {
  if (!S.oferta.zestawy.length || el.closest('#okno-oferty')) return false;
  if (a === 'zamknij-oferte' || (ZAMYKA_OFERTE.includes(a) && ofertaDoZapisania())) return true;
  if (S.widok !== 'oferta' || !WYJSCIA_Z_OFERTY.includes(a)) return false;
  if ((a === 'idz' && el.dataset.widok === 'oferta') || (a === 'krok' && el.dataset.krok === 'oferta')) return false;
  return true;
}

function oknoZamknieciaOferty() {
  const o = S.oferta, n = o.zestawy.length;
  const ile = `${n} ${n === 1 ? 'zestaw' : n < 5 ? 'zestawy' : 'zestawów'}`;
  const [tresc, przyciski] = !KONTO
    ? [`Jako gość nie możesz zapisać oferty (${ile}) – po zamknięciu zniknie. Wcześniej możesz pobrać ją jako PDF lub Excel albo zalogować się i zapisać.`,
      '<button class="btn" data-akcja="oferta-zamknij" data-zapis="nie">Zamknij bez zapisywania</button><button class="btn btn-primary" data-akcja="oferta-zaloguj">Zaloguj się i zapisz</button>']
    : o.kod && !o.zmieniona
    ? [`Oferta <b>${esc(o.kod)}</b> (${ile}) jest zapisana w „Moich wycenach” – otworzysz ją później kodem. Wyjść z niej i zacząć nową?`,
      '<button class="btn btn-primary" data-akcja="oferta-zamknij" data-zapis="nie">Wyjdź z oferty</button>']
    : o.kod
    ? [`Oferta <b>${esc(o.kod)}</b> (${ile}) ma <b>niezapisane zmiany</b>. Jeśli wyjdziesz bez zapisywania, w „Moich wycenach” zostanie wersja z ostatniego zapisu.`,
      '<button class="btn" data-akcja="oferta-zamknij" data-zapis="nie">Wyjdź bez zapisywania</button><button class="btn btn-primary" data-akcja="oferta-zamknij" data-zapis="tak">Zapisz i wyjdź</button>']
    : [`Zapisać ofertę (${ile}) w „Moich wycenach” przed wyjściem? Dostaniesz kod, którym otworzysz ją później. Bez zapisu oferta zniknie.`,
      '<button class="btn" data-akcja="oferta-zamknij" data-zapis="nie">Wyjdź bez zapisywania</button><button class="btn btn-primary" data-akcja="oferta-zamknij" data-zapis="tak">Zapisz i wyjdź</button>'];
  return `<div class="uwaga-tlo" id="okno-oferty-tlo"><div class="uwaga-okno" id="okno-oferty" role="dialog" aria-modal="true" aria-label="Wyjść z oferty?">
    <div class="uwaga-naglowek"><h2>Wyjść z oferty?</h2><button class="btn-link" data-akcja="oferta-zostan" aria-label="Wróć do oferty">✕</button></div>
    <p>${tresc}</p>
    <div class="uwaga-akcje"><button class="btn" data-akcja="oferta-zostan">Wróć do oferty</button>${przyciski}</div>
  </div></div>`;
}
function pokazOknoOferty(el) {
  wyjscieCzeka = el;
  let kont = document.getElementById('okno-zamkniecia');
  if (!kont) { kont = document.createElement('div'); kont.id = 'okno-zamkniecia'; document.body.appendChild(kont); }
  kont.innerHTML = oknoZamknieciaOferty();
}
function schowajOknoOferty() { const k = document.getElementById('okno-zamkniecia'); if (k) k.innerHTML = ''; }

async function akcjeZamknieciaOferty(a, el) {
  if (a === 'oferta-zostan') { wyjscieCzeka = null; schowajOknoOferty(); return true; }
  if (a === 'oferta-zaloguj') { wyjscieCzeka = null; schowajOknoOferty(); S.poLogowaniu = 'oferta'; S.komunikatLogowania = 'Zaloguj się, aby zapisać ofertę w „Moich wycenach”.'; S.widok = 'logowanie'; render(); return true; }
  if (a !== 'oferta-zamknij') return false;
  if (el.dataset.zapis === 'tak') {
    const w = await zapiszWycene(true);
    if (!w) { toast('Nie udało się zapisać oferty – spróbuj ponownie'); return true; }
    toast(`Zapisano ofertę ${w.kod} – zaczynasz nową`);
  } else toast(!S.oferta.kod ? 'Oferta zamknięta – zaczynasz nową'
    : S.oferta.zmieniona ? `Zamknięto ofertę ${S.oferta.kod} bez zapisywania zmian – w „Moich wycenach” jest ostatnio zapisana wersja`
    : `Zamknięto ofertę ${S.oferta.kod} – znajdziesz ją w „Moich wycenach”`);
  const cel = wyjscieCzeka;
  wyjscieCzeka = null; schowajOknoOferty();
  S = nowyStan(); // nowa, pusta oferta
  // dokończ kliknięcie, które otworzyło okno (np. „Moje wyceny”); „Nowy projekt” i „Zamknij ofertę” już są wykonane
  if (cel && cel.isConnected && !['nowy', 'zamknij-oferte'].includes(cel.dataset.akcja)) cel.click(); else { render(); window.scrollTo(0, 0); }
  return true;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && wyjscieCzeka) { wyjscieCzeka = null; schowajOknoOferty(); } });

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-akcja]');
  if (!el || el.disabled) return;
  const a = el.dataset.akcja;
  if (el.tagName === 'A') e.preventDefault();

  if (await akcjeZamknieciaOferty(a, el)) return;
  if (wychodziZOferty(a, el)) { pokazOknoOferty(el); return; }

  // konta, wyceny, administracja (konta.js)
  const wynikKont = await akcjeKont(a, el);
  if (wynikKont) { if (wynikKont !== 'bez') { render(); window.scrollTo(0, 0); } return; }

  // „Zgłoś uwagę” i lista uwag (uwagi.js)
  const wynikUwag = await akcjeUwag(a, el);
  if (wynikUwag) { if (wynikUwag !== 'bez') render(); return; }

  // Dane → Reguły doboru (reguly-panel.js)
  const wynikRegul = await akcjeRegul(a, el);
  if (wynikRegul) { if (wynikRegul !== 'bez') render(); return; }

  if (a === 'start') { S.widok = 'start'; }
  else if (a === 'wyczysc-odpowiedzi') { S.odp = nowyStan().odp; S.rozpoznane = null; }
  else if (a === 'idz') {
    // kreator uruchomiony ze strony startowej zaczyna od pustych odpowiedzi (bez rekomendacji)
    if (el.dataset.widok === 'kreator') { S.kreator = true; if (e.target.closest('.start-karta')) { S.rozpoznane = null; S.odp = nowyStan().odp; } }
    if (el.dataset.widok === 'seria' && e.target.closest('.start-karta')) S.kreator = false;
    S.widok = el.dataset.widok;
    if (S.widok === 'powiadomienia' && POWIADOMIENIA.some(p => !p.przeczytane)) {
      api('/api/powiadomienia/przeczytane', { method: 'POST' }).then(() => { POWIADOMIENIA.forEach(p => { p.przeczytane = true; }); $('#menu-konta').innerHTML = menuKonta(); }).catch(() => {});
    }
  }
  else if (a === 'krok') S.widok = el.dataset.krok;
  else if (a === 'oferta') S.widok = 'oferta';
  else if (a === 'admin') { if (!adminKS()) { toast('Dane są dostępne tylko dla administratora'); return; } S.widok = 'admin'; }
  else if (a === 'nowy') {
    // oferta z niezapisanymi zmianami trafia wcześniej do okna „Wyjść z oferty?” (wychodziZOferty)
    if (S.oferta.zestawy.length && !ofertaDoZapisania() && !confirm('Rozpocząć nowy projekt? Bieżąca oferta zostanie zamknięta (zapisana wersja jest w „Moich wycenach”).')) return;
    S = nowyStan();
  }
  else if (a === 'ustaw') {
    const pole = el.dataset.pole;
    let w = el.dataset.wartosc;
    if (/^\d+$/.test(w) && /rozmiar/.test(pole)) w = Number(w);
    // w kreatorze ponowne kliknięcie odznacza odpowiedź
    if (pole.startsWith('odp.') && pobierz(S, pole) === w) w = null;
    ustaw(S, pole, w);
    if (pole === 'cfg.gniazdo' && w === 'brak' && !['zaslepka', 'keystone'].includes(S.cfg.dodatek)) S.cfg.dodatek = 'zaslepka';
    if (pole === 'cfg.rozmiar' && S.seria === 'FB') { const k = Object.keys(seria('FB').rozmiary[w].kasety); S.cfg.kaseta = k[Object.keys(seria('FB').rozmiary[1 - w].kasety).indexOf(S.cfg.kaseta)] || k[0]; }
    if (pole === 'kolorOsprzetu') for (const m of Object.values(S.moduly)) delete m.kolor;
    if (S.seria === 'KGT' && pole.startsWith('cfg.')) kgtNapraw();
    // ręczna zmiana wielkości/głębokości/koloru – to już nie jest 1:1 zamiennik puszki SF
    if (S.cfg && S.cfg.zamiennik && ['cfg.rozmiar', 'cfg.glebokosc', 'cfg.kolor', 'cfg.osprzet'].includes(pole)) delete S.cfg.zamiennik;
  }
  else if (a === 'plus' || a === 'minus') {
    const v = (Number(pobierz(S, el.dataset.pole)) || 0) + (a === 'plus' ? 1 : -1);
    const min = Number(el.dataset.min ?? 0), max = Number(el.dataset.max ?? 999);
    ustaw(S, el.dataset.pole, Math.max(min, Math.min(max, v)));
  }
  else if (a === 'przelacz') ustaw(S, el.dataset.pole, !pobierz(S, el.dataset.pole));
  else if (a === 'wybierz-serie') {
    if (el.dataset.bezKreatora !== undefined) S.kreator = false;
    // ze strony startowej: odpowiedzi z pytań przenoszą się do konfiguracji (gniazda, wielkość…), bez odpowiedzi – wybór „od razu”
    else if (S.widok === 'start') S.kreator = !brakOdpowiedzi(S.odp);
    wybierzSerie(el.dataset.seria);
  }
  else if (a === 'dodaj-do-oferty' || a === 'dodaj-i-kolejna') {
    const z = zestawDoOferty();
    if (S.edytowany != null && S.oferta.zestawy[S.edytowany]) S.oferta.zestawy[S.edytowany] = z;
    else S.oferta.zestawy.push(z);
    S.edytowany = null;
    if (a === 'dodaj-i-kolejna') {
      S.seria = null;
      S.nazwaZestawu = '';
      wyczyscZapytanie();
      S.widok = 'start';
      toast(`Dodano „${z.nazwa}” do oferty – skonfiguruj kolejną puszkę`);
    } else {
      S.widok = 'oferta';
      toast('Zestaw zapisany w ofercie');
    }
  }
  else if (a === 'edytuj-zestaw') wczytajZestaw(Number(el.dataset.i));
  else if (a === 'duplikuj-zestaw') { const z = JSON.parse(JSON.stringify(S.oferta.zestawy[el.dataset.i])); z.nazwa += ' (kopia)'; S.oferta.zestawy.splice(Number(el.dataset.i) + 1, 0, z); }
  else if (a === 'usun-zestaw') { if (!confirm('Usunąć zestaw z oferty?')) return; S.oferta.zestawy.splice(Number(el.dataset.i), 1); }
  else if (a === 'nowy-zestaw') { S.seria = null; S.edytowany = null; wyczyscZapytanie(); S.widok = 'start'; }
  else if (a === 'karta-zestawu') { const z = zestaw(); drukuj(htmlKartyZestawu(), z.pozycje.map(p => p.symbol)); return; }
  else if (a === 'druk-oferty') { drukuj(htmlOferty(), []); return; }
  else if (a === 'salesforce-zestaw') { const n = Math.max(1, S.liczbaPuszek || 1); kopiuj(tekstSalesforce(zestaw().pozycje.map(p => ({ symbol: p.symbol, ilosc: p.ilosc * n }))), 'zestaw'); return; }
  else if (a === 'mail-braki-zestaw') {
    const n = Math.max(1, S.liczbaPuszek || 1);
    mailBraki(zestaw().pozycje.filter(p => !p.brak).map(p => ({ symbol: p.symbol, potrzeba: p.ilosc * n })));
    return;
  }
  else if (a === 'podobne') { pokazPodobne(el); return; }
  else if (a === 'mail-braki-oferta') { mailBraki(pozycjeOferty().map(p => ({ symbol: p.symbol, potrzeba: p.ilosc }))); return; }
  else if (a === 'salesforce') { kopiuj(tekstSalesforce(pozycjeOferty()), `${pozycjeOferty().length} pozycji`); return; }
  else if (a === 'excel') {
    // bez automatycznego zapisu – oferta zapisuje się tylko przyciskiem „Zapisz” (można wyjść bez zapisywania)
    const body = { kod: S.oferta.kod, projekt: S.oferta.projekt, klient: S.oferta.klient, data: dzis(), cennik: META.cennik, rabat: rabatOferty(), vat: R.vat, pozycje: pozycjeOferty(), bezSymboli: !!S.bezSymboli };
    const r = await fetch('/api/oferta.xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { toast('Nie udało się wygenerować pliku Excel'); return; }
    pobierzPlik(`oferta_${(S.oferta.projekt || 'puszki').replace(/[^\w-]+/g, '_')}.xlsx`, await r.blob());
    return;
  }
  else if (a === 'usun-katalog') {
    const r = await fetch('/api/import/katalog?url=' + encodeURIComponent(el.dataset.url), { method: 'DELETE' });
    KATALOGI = (await r.json()).katalogi;
  }
  // każda zmiana zestawów w ofercie zapisuje wycenę (zalogowani dostają kod)
  if (['dodaj-do-oferty', 'dodaj-i-kolejna', 'duplikuj-zestaw', 'usun-zestaw'].includes(a)) autoZapisz();
  if (['plus', 'minus'].includes(a) && String(el.dataset.pole).startsWith('oferta.zestawy.')) autoZapisz(); // liczba zestawów w ofercie
  render();
  if (['idz', 'krok', 'wybierz-serie', 'dodaj-do-oferty', 'dodaj-i-kolejna', 'edytuj-zestaw', 'nowy-zestaw', 'oferta', 'admin', 'start', 'nowy'].includes(a)) window.scrollTo(0, 0);
});

document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.pole || el.dataset.bezRenderu === undefined) return;
  ustaw(S, el.dataset.pole, el.value);
  zapisz();
  // nazwa projektu / klient – zmiana czeka na „Zapisz zmiany”; przycisk ożywiamy bez przerysowania (kursor zostaje w polu)
  if (el.dataset.autozapis !== undefined && S.oferta.kod && !S.oferta.zmieniona) {
    S.oferta.zmieniona = true; zapisz();
    const b = document.querySelector('[data-akcja="wycena-zapisz"]');
    if (b) { b.disabled = false; b.textContent = 'Zapisz zmiany'; b.classList.add('btn-primary'); }
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.plik) {
    if (el.dataset.plik === 'uwaga') dodajZrzut(el.files[0]);
    else wyslijPlik(el.dataset.plik, el.files[0]);
    return;
  }
  if (!el.dataset || !el.dataset.pole || el.dataset.bezRenderu !== undefined) return;
  let w = el.value;
  if (el.dataset.typ === 'num') w = Math.max(Number(el.min || 0), Number(w) || 0);
  if (el.dataset.typ === 'num' && el.max !== '' && w > Number(el.max)) {
    w = Number(el.max);
    if (el.dataset.pole === 'oferta.rabat') toast(`Maksymalny rabat to ${w}%`);
  }
  if (el.dataset.typ === 'bool') w = el.checked;
  ustaw(S, el.dataset.pole, w);
  if (el.dataset.pole === 'oferta.rabat' || el.dataset.pole.startsWith('oferta.zestawy.')) autoZapisz();
  render();
});

['dragover', 'dragleave', 'drop'].forEach(t => document.addEventListener(t, e => {
  const strefa = e.target.closest && e.target.closest('[data-upload]');
  if (!strefa) return;
  e.preventDefault();
  strefa.classList.toggle('drag', t === 'dragover');
  if (t === 'drop') {
    wyslijPlik(strefa.dataset.upload, e.dataTransfer.files[0]);
  }
}));

// ---------- Start ----------
async function wczytajDane() {
  const d = await (await fetch('/api/dane')).json();
  P = d.produkty; R = d.reguly; META = d.meta; KATALOGI = d.katalogi || [];
  await wczytajKonto();
  $('#meta-cennik').textContent = META.cennik || 'brak cennika';
}

// Odświeżanie w tle (co minutę i po powrocie do karty): powiadomienia i uprawnienia konta – bez przeładowania strony
async function odswiezWTle() {
  if (document.hidden || !KONTO || wyjscieCzeka) return;
  const przed = JSON.stringify([KONTO.rola, KONTO.status, POWIADOMIENIA.filter(p => !p.przeczytane).length, NOWE_UWAGI]);
  try { await wczytajKonto(); } catch { return; }
  const po = KONTO ? JSON.stringify([KONTO.rola, KONTO.status, POWIADOMIENIA.filter(p => !p.przeczytane).length, NOWE_UWAGI]) : null;
  if (przed === po) return;
  // nie przerywaj pisania – samo menu odśwież zawsze, cały widok tylko gdy nic nie jest edytowane
  $('#menu-konta').innerHTML = menuKonta();
  const pisze = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (!pisze && !document.getElementById('okno-oferty') && !(U && U.otwarte)) render();
}
setInterval(odswiezWTle, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) odswiezWTle(); });

wczytajDane().then(() => { obsluzParametryUrl(); render(); }).catch(e => { $('#app').innerHTML = `<p class="komunikat blad">Nie udało się wczytać danych: ${esc(e.message)}. Czy serwer działa (npm start)?</p>`; });
