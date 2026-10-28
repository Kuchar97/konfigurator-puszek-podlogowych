// Import cennika Kontakt-Simon (xls/xlsx) do data/produkty.json
const XLSX = require('xlsx');

// Grupy cennika, które trafiają do konfiguratora
const GRUPY = ['Simon Connect', 'wkłady komp. i tel.'];

// Pojedyncze symbole spoza tych grup, wskazane w data/reguly.json (np. zaślepki RJ45)
function symboleZRegul() {
  try {
    const R = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'reguly.json'), 'utf8'));
    return new Set([...Object.keys((R.keystone && R.keystone.zaslepki) || {}), ...(R.dodatkoweSymbole || [])]);
  } catch { return new Set(); }
}

// Poprawki znanych błędów/nieaktualnych dopisków w cenniku
function korekta(p) {
  // KFR jest już dostępna – usuwamy dopisek „!Dostępna wkrótce”
  p.nazwa = p.nazwa.replace(/\s*!?\s*Dostępna wkrótce\s*/i, '').trim();
  // KGT /72 to stal inox, a nie „szary”
  if (/^KGT\d+(RF)?\/72$/.test(p.symbol)) p.nazwa = p.nazwa.replace(/w kolorze szarym|, szara$/i, m => (m.startsWith(',') ? ', stal inox' : 'stal inox'));
  return p;
}

function liczba(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseCennik(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets['Baza'] || wb.Sheets[wb.SheetNames.find(n => /baza/i.test(n))] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const hi = rows.findIndex(r => r.some(c => String(c).trim().toUpperCase() === 'SYMBOL'));
  if (hi < 0) throw new Error('Nie znaleziono wiersza nagłówka z kolumną SYMBOL');
  const head = rows[hi].map(c => String(c).replace(/\s+/g, ' ').trim().toUpperCase());
  const col = re => head.findIndex(h => re.test(h));
  const C = {
    grupa: col(/^GRUPA$/), symbol: col(/^SYMBOL$/), indeks: col(/^INDEKS$/), nazwa: col(/^NAZWA$/),
    cena: col(/CENA/), opak: col(/OPAK/), jm: col(/JEDN\. MIARY/), ean: col(/EAN/), uwagi: col(/^UWAGI$/),
    link: col(/HIPERŁĄCZE/), kategoria: col(/OPIS KATEGORII/)
  };

  const tytul = rows.slice(0, hi).flat().map(String).find(s => /cennik\s+nr/i.test(s)) || 'Cennik';

  const produkty = {};
  const dodatkowe = symboleZRegul();
  for (const r of rows.slice(hi + 1)) {
    const symbol = String(r[C.symbol] || '').trim();
    if (!symbol || !(GRUPY.includes(String(r[C.grupa]).trim()) || dodatkowe.has(symbol))) continue;
    produkty[symbol] = korekta({
      symbol,
      indeks: String(r[C.indeks] || '').trim(),
      grupa: String(r[C.grupa]).trim(),
      nazwa: String(r[C.nazwa] || '').trim(),
      cena: liczba(r[C.cena]),
      opak: liczba(r[C.opak]),
      jm: String(r[C.jm] || 'szt.').trim(),
      ean: String(r[C.ean] || '').trim(),
      uwagi: String(r[C.uwagi] || '').trim(),
      link: String(r[C.link] || '').trim(),
      kategoria: String(r[C.kategoria] || '').trim()
    });
  }
  return { meta: { cennik: tytul.trim(), zaimportowano: new Date().toISOString(), liczba: Object.keys(produkty).length }, produkty };
}

module.exports = { parseCennik };
