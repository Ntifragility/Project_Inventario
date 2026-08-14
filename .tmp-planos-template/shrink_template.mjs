import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('PLANOS');
sheet.showGridLines = false;
sheet.getRange('A1:F1').values = [['PARTICION', 'WBS', 'PLANO', 'REV', 'TITULO', 'URL']];
sheet.getRange('A1:F1').format = { fill: '#2563EB', font: { bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
sheet.getRange('A1:F1').format.rowHeight = 26;
sheet.getRange('A2:F2').format = { fill: '#FFFFFF', font: { color: '#172033' }, verticalAlignment: 'center' };
sheet.getRange('A2:A2').dataValidation = { rule: { type: 'list', values: ['PUESTA A TIERRA'] } };
sheet.getRange('A2:F2').format.rowHeight = 22;
for (const [range, width] of [['A1:A2',20],['B1:B2',42],['C1:C2',30],['D1:D2',9],['E1:E2',65],['F1:F2',55]]) sheet.getRange(range).format.columnWidth = width;
sheet.freezePanes.freezeRows(1);
sheet.tables.add('A1:F2', true, 'PlanosImportTable').style = 'TableStyleMedium2';

const instructions = workbook.worksheets.add('INSTRUCCIONES');
instructions.showGridLines = false;
instructions.getRange('A1:B1').merge();
instructions.getRange('A1').values = [['Plantilla de importación de planos']];
instructions.getRange('A1:B1').format = { fill: '#2563EB', font: { bold: true, color: '#FFFFFF', size: 16 }, verticalAlignment: 'center' };
instructions.getRange('A1:B1').format.rowHeight = 32;
instructions.getRange('A3:B9').values = [
  ['COLUMNA', 'INSTRUCCIÓN'],
  ['PARTICION', 'Para esta sección use PUESTA A TIERRA.'],
  ['WBS', 'Nombre o código completo del WBS.'],
  ['PLANO', 'Código único del plano. Ya no necesita contener GL.'],
  ['REV', 'Revisión actual del plano.'],
  ['TITULO', 'Título descriptivo del plano.'],
  ['URL', 'Enlace HTTPS compartido. Para un mismo WBS, todas las URL deben ser exactamente iguales o todas deben quedar vacías. No mezcle celdas vacías y llenas.'],
];
instructions.getRange('A3:B3').format = { fill: '#E2E8F0', font: { bold: true, color: '#172033' } };
instructions.getRange('A3:B9').format.borders = { preset: 'inside', style: 'thin', color: '#CBD5E1' };
instructions.getRange('A1:A9').format.columnWidth = 22;
instructions.getRange('B1:B9').format.columnWidth = 90;
instructions.getRange('B4:B9').format.wrapText = true;
instructions.getRange('A9:B9').format.rowHeight = 42;

const outputDir = 'outputs/019fe6f3-45fc-72a3-b7cd-529d9b5bccbc';
const check = await workbook.inspect({ kind: 'table', range: 'PLANOS!A1:F3', include: 'values,formulas', tableMaxRows: 3, tableMaxCols: 6 });
console.log(check.ndjson);
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 50 }, summary: 'formula error scan' });
console.log(errors.ndjson);
for (const [sheetName, range, fileName] of [['PLANOS', 'A1:F2', 'Plantilla-preview.png'], ['INSTRUCCIONES', 'A1:B9', 'Plantilla-instrucciones-preview.png']]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: 'png' });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Plantilla.xlsx`);
