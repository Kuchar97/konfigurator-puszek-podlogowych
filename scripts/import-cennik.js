// Użycie: node scripts/import-cennik.js dane/cennik-3-2026.xls
const fs = require('fs');
const path = require('path');
const { parseCennik } = require('../lib/cennik');

const plik = process.argv[2];
if (!plik) {
  console.error('Podaj ścieżkę do pliku cennika (xls/xlsx).');
  process.exit(1);
}
const wynik = parseCennik(fs.readFileSync(plik));
const out = path.join(__dirname, '..', 'data', 'produkty.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(wynik, null, 1));
console.log(`${wynik.meta.cennik}: ${wynik.meta.liczba} produktów → ${out}`);
