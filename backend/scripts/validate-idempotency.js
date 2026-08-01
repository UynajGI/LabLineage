import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const routePattern = /\bapp\.(get|post|put|patch|delete)\(\s*['"`](\/v1\/[^'"`]+)/gu;
const matches = [...source.matchAll(routePattern)];
const writeRoutes = matches
  .map((match, index) => ({ match, end: matches[index + 1]?.index ?? source.length }))
  .filter(({ match }) => ['post', 'put', 'patch', 'delete'].includes(match[1]))
  .map(({ match, end }) => ({
    line: source.slice(0, match.index).split(/\r?\n/u).length,
    method: match[1].toUpperCase(),
    route: match[2],
    protected: source.slice(match.index, end).includes('requireIdempotentWrite'),
  }));

const unprotected = writeRoutes.filter((route) => !route.protected);
if (unprotected.length) {
  console.error(JSON.stringify({ status: 'invalid', unprotected }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'valid',
  protectedWriteRoutes: writeRoutes.length,
}));
