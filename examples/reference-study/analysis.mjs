import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [inputFile, parameterFile, outputFile] = process.argv.slice(2);
if (!inputFile || !parameterFile || !outputFile) {
  throw new Error('usage: node analysis.mjs INPUT.csv PARAMS.json OUTPUT.svg');
}

const rows = (await readFile(inputFile, 'utf8'))
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [label, rawValue] = line.split(',');
    return { label, value: Number(rawValue) };
  });
const parameters = JSON.parse(await readFile(parameterFile, 'utf8'));
const maximum = Math.max(...rows.map((row) => row.value), 1);
const bars = rows.map((row, index) => {
  const height = Math.round((row.value / maximum) * 120 * parameters.scale);
  const x = 30 + index * 70;
  const y = 150 - height;
  return `<rect x="${x}" y="${y}" width="40" height="${height}" fill="${parameters.color}"/><text x="${x + 20}" y="170" text-anchor="middle">${row.label}</text>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="190"><title>${parameters.title}</title>${bars}</svg>\n`;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, svg);
console.log(`generated ${rows.length} bars`);
