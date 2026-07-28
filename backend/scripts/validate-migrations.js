import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const expectedNames = files.map((name, index) => String(index + 1).padStart(3, '0'));
const actualNames = files.map((name) => name.slice(0, 3));
if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
  throw new Error(`Migration sequence is not contiguous: ${actualNames.join(', ')}`);
}
const sql = (await Promise.all(files.map((name) => readFile(path.join(directory, name), 'utf8')))).join('\n');
const tenantTables = new Set();
for (const match of sql.matchAll(/CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\);/gi)) {
  if (/\btenant_id\b/i.test(match[2])) tenantTables.add(match[1].toLowerCase());
}
tenantTables.add('project_memberships');
const missing = [];
for (const table of [...tenantTables].sort()) {
  if (!new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(sql)) {
    missing.push(`${table}: ENABLE RLS`);
  }
  if (!new RegExp(`ALTER TABLE\\s+${table}\\s+FORCE ROW LEVEL SECURITY`, 'i').test(sql)) {
    missing.push(`${table}: FORCE RLS`);
  }
  if (!new RegExp(`CREATE POLICY\\s+[a-z0-9_]+\\s+ON\\s+${table}\\b`, 'i').test(sql)) {
    missing.push(`${table}: policy`);
  }
}
if (missing.length) {
  console.error(JSON.stringify({ status: 'invalid', missing }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'valid',
    migrations: files.length,
    tenantScopedTables: tenantTables.size
  }));
}
