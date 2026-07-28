import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { openApiDocument } from '../openapi.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const serverSource = await readFile(path.resolve(directory, '..', 'server.js'), 'utf8');
const implemented = new Set(
  [...serverSource.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)]
    .filter((match) => match[2].startsWith('/v1/'))
    .map((match) => `${match[1]} ${match[2].replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`)
);
const documented = new Set(
  Object.entries(openApiDocument.paths)
    .flatMap(([route, operations]) => Object.keys(operations).map((method) => `${method} ${route}`))
    .filter((item) => item.includes(' /v1/'))
);
const missing = [...implemented].filter((item) => !documented.has(item));
const stale = [...documented].filter((item) => !implemented.has(item));
await SwaggerParser.validate(openApiDocument);
if (missing.length || stale.length) {
  console.error(JSON.stringify({ missing, stale }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'valid',
    openapi: openApiDocument.openapi,
    documentedV1Operations: documented.size
  }));
}
