import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deploymentMode,
  deploymentProfile,
  publicDeploymentCapabilities,
} from '../lib/deployment-mode.js';

function cloudEnvironment(overrides = {}) {
  return {
    LABLINEAGE_DEPLOYMENT_MODE: 'google_cloud',
    LABLINEAGE_OBJECT_STORE: 'gcs',
    LABLINEAGE_TASK_DISPATCHER: 'cloud_tasks',
    LABLINEAGE_AUTH_MODE: 'oidc',
    DATABASE_URL: 'postgresql://redacted',
    LABLINEAGE_GCS_BUCKET: 'example-bucket',
    LABLINEAGE_OIDC_ISSUER: 'https://issuer.example/',
    LABLINEAGE_OIDC_AUDIENCE: 'lablineage',
    LABLINEAGE_OIDC_JWKS_URL: 'https://issuer.example/jwks.json',
    LABLINEAGE_TASKS_QUEUE: 'analysis',
    LABLINEAGE_TASKS_LOCATION: 'asia-east1',
    LABLINEAGE_ANALYSIS_WORKER_URL: 'https://worker.example/internal/analysis-worker',
    LABLINEAGE_TASKS_AUDIENCE: 'https://worker.example',
    LABLINEAGE_TASKS_SERVICE_ACCOUNT: 'tasks@example.iam.gserviceaccount.com',
    ...overrides,
  };
}

test('deployment mode defaults to local without inferring from NODE_ENV', () => {
  const profile = deploymentProfile({ NODE_ENV: 'production' });
  assert.equal(deploymentMode({ NODE_ENV: 'production' }), 'local');
  assert.deepEqual(profile, {
    mode: 'local',
    explicit: false,
    database: 'json',
    objectStorage: 'local',
    taskDispatcher: 'inline',
    auth: 'development',
    collectorTransport: 'local-or-https-pairing',
  });
  assert.throws(
    () => deploymentProfile({ NODE_ENV: 'production' }, { requireExplicit: true }),
    /LABLINEAGE_DEPLOYMENT_MODE is required/u,
  );
});

test('local is a formal profile and rejects conflicting or publicly exposed development settings', () => {
  const profile = deploymentProfile({
    LABLINEAGE_DEPLOYMENT_MODE: 'local',
    LABLINEAGE_HOST: '127.0.0.1',
    NODE_ENV: 'production',
  }, { requireExplicit: true });
  assert.equal(profile.database, 'json');
  assert.equal(profile.objectStorage, 'local');
  assert.throws(
    () => deploymentProfile({ LABLINEAGE_DEPLOYMENT_MODE: 'local', LABLINEAGE_OBJECT_STORE: 'gcs' }),
    /must be local/u,
  );
  assert.throws(
    () => deploymentProfile({ LABLINEAGE_DEPLOYMENT_MODE: 'local', LABLINEAGE_HOST: '0.0.0.0' }),
    /loopback host/u,
  );
});

test('google_cloud requires its durable backends and exposes no secret values', () => {
  assert.throws(
    () => deploymentProfile(cloudEnvironment({ LABLINEAGE_GCS_BUCKET: '' })),
    /LABLINEAGE_GCS_BUCKET/u,
  );
  const capabilities = publicDeploymentCapabilities(cloudEnvironment({
    DATABASE_URL: 'postgresql://user:secret@example/db',
  }));
  assert.deepEqual(capabilities, {
    mode: 'google_cloud',
    explicit: true,
    database: 'postgresql',
    objectStorage: 'gcs',
    taskDispatcher: 'cloud_tasks',
    auth: 'oidc',
    collectorTransport: 'https-pairing',
  });
  assert.equal(JSON.stringify(capabilities).includes('secret'), false);
});

test('invalid deployment mode and dispatcher combinations fail closed', () => {
  assert.throws(() => deploymentMode({ LABLINEAGE_DEPLOYMENT_MODE: 'cloud' }), /local or google_cloud/u);
  assert.throws(
    () => deploymentProfile(cloudEnvironment({ LABLINEAGE_TASK_DISPATCHER: 'inline' })),
    /must be cloud_tasks/u,
  );
});
