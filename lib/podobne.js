// Produkty podobne do brakującego na magazynie (uwaga #18): ta sama grupa / seria, podobna nazwa, ten sam rodzaj,
// najlepiej ten sam kolor. Źródło: cennik puszek (data/produkty.json).
const fs = require('fs');
const path = require('path');

const PRODUKTY = path.join(__dirname, '..', 'data', 'produkty.json');
let pamiec = null; // { klucz, lista, mapa }

const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
// słowa nazwy bez koloru i parametrów technicznych – do porównania rodzaju produktu
const KOLORY = /\b(bial\w*|czarn\w*|kremow\w*|szar\w*|grafit\w*|kaszmir\w*|srebr\w*|zlot\w*|braz\w*|antracyt\w*|aluminium|bez\w*|inox|satyn\w*|czerwon\w*|zielon\w*|pomarancz\w*|niebiesk\w*|mat|czysta|biel)\b/g;
const slowa = n => new Set(fold(n).replace(KOLORY, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+(a|v|mm|ax)?$/.test(w)));

function zbior() {
  let mt = 0;
  try { mt = fs.statSync(PRODUKTY).mtimeMs; } catch { /* brak cennika puszek */ }
  const klucz = String(mt);
  if (pamiec && pamiec.klucz === klucz) return pamiec;
  const mapa = new Map();
  try {
    for (const p of Object.values(JSON.parse(fs.readFileSync(PRODUKTY, 'utf8')).produkty)) {
      mapa.set(p.symbol, { symbol: p.symbol, nazwa: p.nazwa, grupa: p.grupa || '', kolor: (String(p.nazwa).split(';').pop() || '').trim(), rodzaj: '', cena: p.cena, jm: p.jm, status: p.uwagi || '' });
    }
  } catch { /* brak cennika puszek */ }
  const lista = [...mapa.values()].map(p => ({ ...p, _slowa: slowa(p.nazwa) }));
  pamiec = { klucz, lista, mapa: new Map(lista.map(p => [p.symbol, p])) };
  return pamiec;
}

// rodzina grupy: „Simon 54 Premium” ~ „Simon 54”
const rodzina = g => (/^simon \d+/i.exec(g || '') || [g])[0].toLowerCase();

function podobne(symbol, limit = 8) {
  const { lista, mapa } = zbior();
  const baza = mapa.get(symbol);
  if (!baza) return { produkt: null, kandydaci: [] };
  const rdzen = symbol.split('/')[0];
  const kandydaci = [];
  for (const p of lista) {
    if (p.symbol === symbol || /wycofan/i.test(p.status) || rodzina(p.grupa) !== rodzina(baza.grupa)) continue;
    let wspolne = 0;
    for (const w of baza._slowa) if (p._slowa.has(w)) wspolne++;
    const podob = wspolne / Math.max(1, new Set([...baza._slowa, ...p._slowa]).size);
    // ten sam kolor ważniejszy niż ten sam rdzeń symbolu (K02/9 lepszy zamiennik dla K22/9 niż K22/14);
    // kolor z nazwy albo – w cenniku puszek – z końcówki symbolu (/9, /14)
    // kolor: końcówka symbolu (/11, /49) jest pewniejsza niż kolumna koloru w cenniku (zdarzają się w niej pomyłki)
    const kodKoloru = s => (/\/([A-Z]*\d+[A-Z]*)$/i.exec(s) || [])[1];
    const kolor = kodKoloru(p.symbol) && kodKoloru(symbol) ? kodKoloru(p.symbol) === kodKoloru(symbol) : fold(p.kolor) === fold(baza.kolor);
    // inna krotność / pojedyncze ↔ podwójne – słaby zamiennik
    const podwojne = n => /podw[oó]jn|2-krotn/i.test(n);
    const krotnosc = (p.krotnosc || baza.krotnosc ? p.krotnosc !== baza.krotnosc : false) || podwojne(p.nazwa) !== podwojne(baza.nazwa);
    const ocena = podob + (p.rodzaj && p.rodzaj === baza.rodzaj ? 0.15 : 0) + (kolor ? 0.4 : 0) + (p.symbol.split('/')[0] === rdzen ? 0.05 : 0) - (krotnosc ? 0.35 : 0);
    if (podob >= 0.35) kandydaci.push({ p, ocena });
  }
  kandydaci.sort((a, b) => b.ocena - a.ocena);
  const bez = ({ _slowa, ...p }) => p;
  return { produkt: bez(baza), kandydaci: kandydaci.slice(0, limit).map(k => ({ ...bez(k.p), podobienstwo: Math.round(k.ocena * 100) / 100 })) };
}

module.exports = { podobne };
