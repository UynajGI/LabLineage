import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export function postgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function createPool(overrides = {}) {
  if (!postgresConfigured() && !overrides.connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL mode');
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.LABLINEAGE_DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.LABLINEAGE_DB_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.LABLINEAGE_DB_CONNECT_TIMEOUT_MS || 5_000),
    ssl: process.env.LABLINEAGE_DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    ...overrides
  });
}

export async function runMigrations(pool, migrationsDir) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [731_927_441]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [file]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${file}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return files;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [731_927_441]).catch(() => {});
    client.release();
  }
}
