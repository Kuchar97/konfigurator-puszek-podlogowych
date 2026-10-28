// Sprawdza data/reguly.json: poprawność struktury i czy symbole istnieją w data/produkty.json
const { produkty } = require('../data/produkty.json');
const R = require('../data/reguly.json');
const { sprawdz } = require('../lib/reguly');

const { bledy, ostrzezenia } = sprawdz(R, produkty);
if (bledy.length) console.log('BŁĘDY:\n' + bledy.join('\n'));
console.log(ostrzezenia.length ? 'BRAKI:\n' + ostrzezenia.map(o => o.replace(/^brak w cenniku: /, '')).join('\n') : 'Wszystkie symbole istnieją w cenniku.');
if (bledy.length) process.exitCode = 1;
