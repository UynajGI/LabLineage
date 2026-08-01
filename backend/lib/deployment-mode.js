const DEPLOYMENT_MODES = new Set(['local', 'google_cloud']);

function configured(env, name) {
  return typeof env[name] === 'string' && env[name].trim().length > 0;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'INVALID_DEPLOYMENT_CONFIGURATION';
  return error;
}

export function deploymentMode(env = process.env) {
  const value = env.LABLINEAGE_DEPLOYMENT_MODE?.trim() || 'local';
  if (!DEPLOYMENT_MODES.has(value)) {
    throw configurationError('LABLINEAGE_DEPLOYMENT_MODE must be local or google_cloud');
  }
  return value;
}

export function deploymentProfile(env = process.env, { requireExplicit = false } = {}) {
  const explicit = configured(env, 'LABLINEAGE_DEPLOYMENT_MODE');
  if (requireExplicit && !explicit) {
    throw configurationError('LABLINEAGE_DEPLOYMENT_MODE is required for a production process');
  }

  const mode = deploymentMode(env);
  const expectedObjectStorage = mode === 'google_cloud' ? 'gcs' : 'local';
  const expectedDispatcher = mode === 'google_cloud' ? 'cloud_tasks' : 'inline';
  const configuredObjectStorage = env.LABLINEAGE_OBJECT_STORE?.trim();
  const configuredDispatcher = env.LABLINEAGE_TASK_DISPATCHER?.trim();

  if (configuredObjectStorage && configuredObjectStorage !== expectedObjectStorage) {
    throw configurationError(
      `LABLINEAGE_OBJECT_STORE must be ${expectedObjectStorage} when LABLINEAGE_DEPLOYMENT_MODE=${mode}`,
    );
  }
  if (configuredDispatcher && configuredDispatcher !== expectedDispatcher) {
    throw configurationError(
      `LABLINEAGE_TASK_DISPATCHER must be ${expectedDispatcher} when LABLINEAGE_DEPLOYMENT_MODE=${mode}`,
    );
  }

  const database = configured(env, 'DATABASE_URL') ? 'postgresql' : 'json';
  const auth = env.LABLINEAGE_AUTH_MODE?.trim() || (mode === 'google_cloud' ? 'oidc' : 'development');
  const profile = {
    mode,
    explicit,
    database,
    objectStorage: expectedObjectStorage,
    taskDispatcher: expectedDispatcher,
    auth,
    collectorTransport: mode === 'google_cloud' ? 'https-pairing' : 'local-or-https-pairing',
  };

  if (mode === 'google_cloud') {
    const required = [
      'DATABASE_URL',
      'LABLINEAGE_GCS_BUCKET',
      'LABLINEAGE_OIDC_ISSUER',
      'LABLINEAGE_OIDC_AUDIENCE',
      'LABLINEAGE_OIDC_JWKS_URL',
      'LABLINEAGE_TASKS_QUEUE',
      'LABLINEAGE_TASKS_LOCATION',
      'LABLINEAGE_ANALYSIS_WORKER_URL',
      'LABLINEAGE_TASKS_AUDIENCE',
      'LABLINEAGE_TASKS_SERVICE_ACCOUNT',
    ].filter((name) => !configured(env, name));
    if (auth !== 'oidc') required.push('LABLINEAGE_AUTH_MODE=oidc');
    if (required.length > 0) {
      throw configurationError(`google_cloud deployment is missing required configuration: ${required.join(', ')}`);
    }
  } else {
    const host = env.LABLINEAGE_HOST?.trim() || '127.0.0.1';
    if (explicit && auth === 'development' && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw configurationError('local deployment with development authentication must bind to a loopback host');
    }
  }

  return Object.freeze(profile);
}

export function publicDeploymentCapabilities(env = process.env) {
  const profile = deploymentProfile(env);
  return {
    mode: profile.mode,
    explicit: profile.explicit,
    database: profile.database,
    objectStorage: profile.objectStorage,
    taskDispatcher: profile.taskDispatcher,
    auth: profile.auth,
    collectorTransport: profile.collectorTransport,
  };
}
