// Edytowalna oferta Excel: zmiana rabatu (globalnie lub w wierszu) przelicza ceny formułami
const ExcelJS = require('exceljs');

async function ofertaXlsx(o) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Konfigurator puszek podłogowych';
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet('Oferta', { views: [{ state: 'frozen', ySplit: 9 }] });

  ws.columns = [
    { key: 'lp', width: 5 }, { key: 'nazwa', width: 58 }, { key: 'symbol', width: 16 }, { key: 'seria', width: 9 },
    { key: 'kolor', width: 14 }, { key: 'jm', width: 7 }, { key: 'ilosc', width: 8 }, { key: 'cena', width: 13 },
    { key: 'rabat', width: 9 }, { key: 'cenaR', width: 14 }, { key: 'netto', width: 14 }, { key: 'brutto', width: 14 }
  ];

  const bold = { bold: true };
  ws.getCell('A1').value = 'Oferta Kontakt-Simon';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Projekt: ${o.projekt || '—'}`;
  ws.getCell('A3').value = `Klient: ${o.klient || '—'}`;
  ws.getCell('A4').value = `Data: ${o.data} · ceny wg: ${o.cennik}${o.kod ? ` · kod wyceny: ${o.kod}` : ''}`;

  // dowolny rabat – Excel pilnuje tylko zakresu 0–100% (globalnie i w wierszach)
  const walidacjaRabatu = {
    type: 'decimal', operator: 'between', formulae: [0, 100], allowBlank: false,
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Nieprawidłowy rabat', error: 'Rabat może wynosić od 0 do 100%.'
  };
  ws.getCell('B6').value = 'Rabat globalny [%] – zmień, aby przeliczyć ofertę:';
  ws.getCell('B6').font = bold;
  ws.getCell('C6').value = Math.max(0, Math.min(100, Number(o.rabat) || 0));
  ws.getCell('C6').dataValidation = walidacjaRabatu;
  ws.getCell('C6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  ws.getCell('C6').font = bold;
  ws.getCell('B7').value = 'Stawka VAT [%]:';
  ws.getCell('C7').value = Math.round((o.vat ?? 0.23) * 100);

  const naglowek = ['Lp', 'Asortyment', 'Symbol', 'Seria', 'Kolor', 'Jedn.', 'Ilość', 'Cena kat. netto', 'Rabat %', 'Cena netto po rabacie', 'Wartość netto', 'Wartość brutto'];
  const h = ws.getRow(9);
  h.values = naglowek;
  h.font = bold;
  h.alignment = { wrapText: true, vertical: 'middle' };
  h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F5' } }; });

  const pln = '#,##0.00 "zł"';
  let r = 10;
  o.pozycje.forEach((p, i) => {
    const row = ws.getRow(r);
    row.values = [i + 1, p.nazwa, o.bezSymboli ? '' : p.symbol, p.seria || '', p.kolor || '', p.jm || 'szt.', p.ilosc, p.cena ?? 0];
    row.getCell(9).value = { formula: '$C$6' };
    row.getCell(9).dataValidation = walidacjaRabatu;
    row.getCell(10).value = { formula: `ROUND(H${r}*(1-I${r}/100),2)` };
    row.getCell(11).value = { formula: `ROUND(J${r}*G${r},2)` };
    row.getCell(12).value = { formula: `ROUND(K${r}*(1+$C$7/100),2)` };
    [8, 10, 11, 12].forEach(c => { row.getCell(c).numFmt = pln; });
    row.getCell(2).alignment = { wrapText: true };
    r++;
  });

  // „Oferta bez symboli” – kolumna Symbol pusta i ukryta (formuły w kolejnych kolumnach bez zmian)
  if (o.bezSymboli) ws.getColumn('symbol').hidden = true;

  const suma = ws.getRow(r + 1);
  suma.getCell(10).value = 'SUMA:';
  suma.getCell(11).value = { formula: `SUM(K10:K${r - 1})` };
  suma.getCell(12).value = { formula: `SUM(L10:L${r - 1})` };
  suma.font = bold;
  [11, 12].forEach(c => { suma.getCell(c).numFmt = pln; });

  ws.getCell(`B${r + 3}`).value = 'Rabat w kolumnie „Rabat %” można nadpisać dla pojedynczej pozycji. Ceny katalogowe wg cennika Kontakt-Simon; oferta nie stanowi oferty handlowej w rozumieniu KC.';
  ws.getCell(`B${r + 3}`).font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  return wb.xlsx.writeBuffer();
}

module.exports = { ofertaXlsx };
