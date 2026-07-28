import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const lines = source.split(/\r?\n/u);
const writeRoutes = [];

for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/app\.(post|put|patch|delete)\(\s*['"`](\/v1\/[^'"`]+)/u);
  if (!match) continue;
  writeRoutes.push({
    line: index + 1,
    method: match[1].toUpperCase(),
    route: match[2],
    protected: lines[index].includes('requireIdempotentWrite'),
  });
}

const unprotected = writeRoutes.filter((route) => !route.protected);
if (unprotected.length) {
  console.error(JSON.stringify({ status: 'invalid', unprotected }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'valid',
  protectedWriteRoutes: writeRoutes.length,
}));
