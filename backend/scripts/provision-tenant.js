import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, runMigrations } from '../lib/database.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const tenantId = process.env.LABLINEAGE_TENANT_ID;
const tenantSlug = process.env.LABLINEAGE_TENANT_SLUG;
const tenantName = process.env.LABLINEAGE_TENANT_NAME || tenantSlug;
const runtimeRole = process.env.LABLINEAGE_RUNTIME_DB_ROLE;

if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
  throw new Error('LABLINEAGE_TENANT_ID must be a valid UUID');
}
if (!tenantSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
  throw new Error('LABLINEAGE_TENANT_SLUG must be a lowercase slug');
}
if (!runtimeRole || !/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole)) {
  throw new Error('LABLINEAGE_RUNTIME_DB_ROLE must be a safe PostgreSQL role name');
}

const pool = createPool();
try {
  await runMigrations(pool, path.resolve(backendDir, '..', 'migrations'));
  await pool.query(
    `INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)
     ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name`,
    [tenantId, tenantSlug, tenantName]
  );
  const quotedRole = `"${runtimeRole}"`;
  await pool.query(`
    GRANT USAGE ON SCHEMA public TO ${quotedRole};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ${quotedRole};
  `);
  console.log(JSON.stringify({ status: 'provisioned', tenantId, tenantSlug, runtimeRole }));
} finally {
  await pool.end();
}
