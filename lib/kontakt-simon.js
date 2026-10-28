// Dane pobierane na żywo ze stron Kontakt-Simon: stany magazynowe i informacje o produkcie
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', 'data', 'cache-produkty.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
const zapiszCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

const dekoduj = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Monitor stanów: https://stany.kontakt-simon.com.pl/quickview/index
// Każdy wiersz wyniku zawiera: <span class="result_pt_symb">SYMBOL</span> opis ... qty_test('f','s','<ilość>','<dni>','<tydzień|None>','<status>','pl')
// wyniki pamiętane 10 minut – oferta z wieloma pozycjami nie odpytuje monitora przy każdym odświeżeniu widoku
const STANY = new Map();
async function stan(symbol) {
  const z = STANY.get(symbol);
  if (z && Date.now() - z.czas < 10 * 60 * 1000) return z.wynik;
  let wynik;
  try { wynik = await stanZMonitora(symbol); }
  catch (e) {
    // „fetch failed” nic nie mówi – przyczyna (DNS, certyfikat, brak sieci) siedzi w e.cause
    const c = e.cause, szczegol = c ? [c.code, c.message].filter(Boolean).join(' – ') : '';
    throw new Error(e.name === 'TimeoutError' ? 'monitor stanów nie odpowiedział w 15 s' : `${e.message}${szczegol ? ` (${szczegol})` : ''}`);
  }
  STANY.set(symbol, { czas: Date.now(), wynik });
  return wynik;
}
async function stanZMonitora(symbol) {
  const r = await fetch('https://stany.kontakt-simon.com.pl/quickview/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f_pt_disc1: symbol, submit_search: '' }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`monitor stanów odpowiedział błędem HTTP ${r.status}`);
  const html = await r.text();
  const wiersze = html.split('class="result_row').slice(1);
  for (const w of wiersze) {
    const s = (w.match(/result_pt_symb">([^<]+)</) || [])[1];
    if (!s || s.trim().toUpperCase() !== symbol.toUpperCase()) continue;
    const args = (dekoduj(w).match(/qty_test\(([^)]*)\)/) || [])[1];
    if (!args) break;
    const [, , ilosc, dni, tydzien, status] = args.split(',').map(a => a.trim().replace(/^'|'$/g, ''));
    return {
      symbol,
      znaleziono: true,
      ilosc: parseInt(ilosc, 10) || 0,
      dniRealizacji: /^\d+$/.test(dni) ? parseInt(dni, 10) : null,
      terminPlanowany: tydzien && tydzien !== 'None' ? tydzien : null,
      aktywny: status === 'AKTYW'
    };
  }
  return { symbol, znaleziono: false };
}

// Strona produktu: parametry, zdjęcie (z ID produktu), pliki do pobrania.
// Karta katalogowa PDF: /pl/Katalog/0/0/<ID>,<SYMBOL>.pdf – liczy się tylko ID.
async function infoProduktu(symbol, link) {
  if (cache[symbol]) return cache[symbol];
  const url = (link || `https://www.kontakt-simon.com.pl/catalog/product/${symbol.replace(/\//g, '_')}?lang=pl-PL`).replace(/^http:/, 'https:');
  const html = await (await fetch(url)).text();
  const img = html.match(/\/assets\/catalog\/img\/product\/(\d+),([^"'\s]+\.(?:jpg|png))/i);
  const id = img ? img[1] : null;
  const pliki = [...html.matchAll(/<a[^>]+href="(https:\/\/ekatalog2?\.kontakt-simon\.com\.pl\/download\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => ({ url: m[1], nazwa: dekoduj(m[2].replace(/<[^>]+>/g, '').trim()) }))
    .filter((p, i, a) => p.nazwa && a.findIndex(q => q.url === p.url) === i);
  const opis = dekoduj(((html.match(/<h\d[^>]*>\s*[^<]*<\/h\d>\s*<[^>]+>([^<]{10,})</) || [])[1] || '').trim());
  const info = {
    symbol,
    id,
    strona: url,
    zdjecie: img ? `https://www.kontakt-simon.com.pl/assets/catalog/img/product/${img[1]},${img[2]}` : null,
    karta: id ? `https://www.kontakt-simon.com.pl/pl/Katalog/0/0/${id},${symbol.replace(/\//g, '_')}.pdf` : null,
    pliki,
    opis
  };
  cache[symbol] = info;
  zapiszCache();
  return info;
}

module.exports = { stan, infoProduktu };
