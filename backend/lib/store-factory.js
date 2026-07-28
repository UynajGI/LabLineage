import { postgresConfigured } from './database.js';
import { JsonStore } from './store.js';
import { PostgresStore } from './postgres-store.js';

export async function createStore() {
  if (postgresConfigured()) return new PostgresStore().init();
  if (process.env.NODE_ENV === 'production' && process.env.LABLINEAGE_ALLOW_JSON_IN_PRODUCTION !== 'true') {
    throw new Error('DATABASE_URL is required in production; JSON storage is development-only');
  }
  return new JsonStore().init();
}
