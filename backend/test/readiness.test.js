import assert from 'node:assert/strict';
import test from 'node:test';
import { productionConfigurationIssues } from '../lib/readiness.js';

test('production readiness rejects missing mandatory dependencies', () => {
  const issues = productionConfigurationIssues({
    NODE_ENV: 'production',
    LABLINEAGE_AUTH_MODE: 'oidc',
  });
  assert.ok(issues.some((item) => item.includes('DATABASE_URL')));
  assert.ok(issues.some((item) => item.includes('LABLINEAGE_OIDC_ISSUER')));
  assert.ok(issues.some((item) => item.includes('LABLINEAGE_GCS_BUCKET')));
  assert.ok(issues.some((item) => item.includes('LABLINEAGE_TRUSTED_COLLECTOR_KEYS')));
  assert.ok(issues.some((item) => item.includes('LABLINEAGE_TENANT_ID')));
});

test('production readiness accepts an explicit local production-shaped configuration', () => {
  assert.deepEqual(productionConfigurationIssues({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.invalid/lablineage',
    LABLINEAGE_AUTH_MODE: 'oidc',
    LABLINEAGE_OIDC_ISSUER: 'https://issuer.example/',
    LABLINEAGE_OIDC_AUDIENCE: 'lablineage',
    LABLINEAGE_OIDC_JWKS_URL: 'https://issuer.example/jwks.json',
    LABLINEAGE_OBJECT_STORE: 'local',
    LABLINEAGE_ALLOW_LOCAL_OBJECT_STORE: 'true',
    LABLINEAGE_REQUIRE_SIGNED_MANIFESTS: 'true',
    LABLINEAGE_TRUSTED_COLLECTOR_KEYS: 'sha256:test',
    LABLINEAGE_ALLOW_TENANT_BOOTSTRAP: 'true',
  }), []);
});

test('non-production readiness does not impose production dependencies', () => {
  assert.deepEqual(productionConfigurationIssues({ NODE_ENV: 'test' }), []);
});

test('production readiness rejects unknown authentication modes', () => {
  const issues = productionConfigurationIssues({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.invalid/lablineage',
    LABLINEAGE_AUTH_MODE: 'custom',
    LABLINEAGE_OBJECT_STORE: 'gcs',
    LABLINEAGE_GCS_BUCKET: 'example-bucket',
    LABLINEAGE_TRUSTED_COLLECTOR_KEYS: 'sha256:fingerprint',
    LABLINEAGE_TENANT_ID: 'tenant-id'
  });
  assert.deepEqual(issues, [
    'LABLINEAGE_AUTH_MODE=custom is unsupported; production must use oidc'
  ]);
});
