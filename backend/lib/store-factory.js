import { postgresConfigured } from './database.js';
import { JsonStore } from './store.js';
import { PostgresStore } from './postgres-store.js';
import { deploymentProfile } from './deployment-mode.js';

export async function createStore() {
  const profile = deploymentProfile();
  if (postgresConfigured()) return new PostgresStore().init();
  if (profile.mode === 'google_cloud') {
    throw new Error('DATABASE_URL is required for google_cloud deployment mode');
  }
  return new JsonStore().init();
}
