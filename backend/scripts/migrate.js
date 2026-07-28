import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, runMigrations } from '../lib/database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pool = createPool();
try {
  const applied = await runMigrations(pool, path.resolve(here, '../migrations'));
  console.log(`Validated ${applied.length} PostgreSQL migration(s).`);
} finally {
  await pool.end();
}
