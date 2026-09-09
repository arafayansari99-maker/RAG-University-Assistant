import { PDFParse } from 'pdf-parse';
import fs from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve('node_modules/pdf-parse/tests/integration/input/pdf-samples/general/Adobe_usermode.pdf');
const buffer = await fs.readFile(target);
const parser = new PDFParse({ data: buffer });

try {
  const text = await parser.getText();
  console.log('text keys', Object.keys(text));
  console.log('text pages length', text.pages.length);
  console.log('text page 0 keys', Object.keys(text.pages[0]));
  console.log('text page 0 num prop', text.pages[0].num, 'text prop', typeof text.pages[0].text);

  const table = await parser.getTable();
  console.log('table keys', Object.keys(table));
  console.log('table pages length', table.pages.length);
  console.log('table pages sample', table.pages[0]?.tables?.length || 0);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await parser.destroy();
}
