function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function productionConfigurationIssues(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const issues = [];

  if (!present(env.DATABASE_URL) && env.LABLINEAGE_ALLOW_JSON_IN_PRODUCTION !== 'true') {
    issues.push('DATABASE_URL is required in production');
  }

  const mode = env.LABLINEAGE_AUTH_MODE || 'oidc';
  if (mode === 'development' || mode === 'disabled') {
    issues.push(`LABLINEAGE_AUTH_MODE=${mode} is not allowed in production`);
  } else if (mode === 'oidc') {
    for (const name of ['LABLINEAGE_OIDC_ISSUER', 'LABLINEAGE_OIDC_AUDIENCE', 'LABLINEAGE_OIDC_JWKS_URL']) {
      if (!present(env[name])) issues.push(`${name} is required in OIDC mode`);
    }
  } else {
    issues.push(`LABLINEAGE_AUTH_MODE=${mode} is unsupported; production must use oidc`);
  }

  const objectMode = env.LABLINEAGE_OBJECT_STORE || 'gcs';
  if (objectMode === 'gcs' && !present(env.LABLINEAGE_GCS_BUCKET)) {
    issues.push('LABLINEAGE_GCS_BUCKET is required for the production GCS object store');
  }
  if (objectMode === 'local' && env.LABLINEAGE_ALLOW_LOCAL_OBJECT_STORE !== 'true') {
    issues.push('Local object storage requires LABLINEAGE_ALLOW_LOCAL_OBJECT_STORE=true in production');
  }

  const signaturesRequired = env.LABLINEAGE_REQUIRE_SIGNED_MANIFESTS === 'true' || env.NODE_ENV === 'production';
  if (signaturesRequired && !present(env.LABLINEAGE_TRUSTED_COLLECTOR_KEYS)) {
    issues.push('LABLINEAGE_TRUSTED_COLLECTOR_KEYS must contain at least one trusted key');
  }

  if (!present(env.LABLINEAGE_TENANT_ID) && env.LABLINEAGE_ALLOW_TENANT_BOOTSTRAP !== 'true') {
    issues.push('LABLINEAGE_TENANT_ID is required unless explicit tenant bootstrap is enabled');
  }
  return issues;
}
