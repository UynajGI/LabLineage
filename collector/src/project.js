import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PROJECT_FILE = 'project.json';

export async function atomicWrite(filename, content, mode = 0o600) {
  const resolved = path.resolve(filename);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, resolved);
}

export async function initializeProject({ projectKey, root }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(projectKey || '')) {
    throw new Error('Project key must be 2-128 letters, numbers, dots, underscores, or hyphens');
  }
  const projectRoot = path.resolve(root);
  const stateDirectory = path.join(projectRoot, '.lablineage');
  const snapshotDirectory = path.join(stateDirectory, 'snapshots');
  const keyDirectory = path.join(stateDirectory, 'keys');
  const projectFile = path.join(stateDirectory, PROJECT_FILE);
  try {
    await readFile(projectFile, 'utf8');
    throw new Error(`Project is already initialized: ${projectFile}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(snapshotDirectory, { recursive: true });
  await mkdir(keyDirectory, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(keyDirectory, 'source-private.pem');
  const publicKeyPath = path.join(keyDirectory, 'source-public.pem');
  await atomicWrite(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), 0o600);
  await atomicWrite(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), 0o644);
  const config = {
    schema_version: 'lablineage.project.v1',
    project_key: projectKey,
    root: projectRoot,
    path_salt: randomBytes(32).toString('base64url'),
    private_key: privateKeyPath,
    public_key: publicKeyPath,
    snapshot_directory: snapshotDirectory,
    index: path.join(stateDirectory, 'collector.sqlite'),
    created_at: new Date().toISOString()
  };
  await atomicWrite(projectFile, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export async function loadProject({ root = process.cwd(), configFile, expectedProject } = {}) {
  const filename = path.resolve(configFile || path.join(root, '.lablineage', PROJECT_FILE));
  let config;
  try {
    config = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Project is not initialized: ${filename}`);
    if (error instanceof SyntaxError) throw new Error(`Project configuration is invalid JSON: ${filename}`);
    throw error;
  }
  if (config.schema_version !== 'lablineage.project.v1' || !config.project_key || !config.root) {
    throw new Error(`Project configuration is invalid: ${filename}`);
  }
  if (expectedProject && expectedProject !== config.project_key) {
    throw new Error(`Project mismatch: requested ${expectedProject}, configured ${config.project_key}`);
  }
  return config;
}

export async function saveProjectConnection(config, connection, { configFile } = {}) {
  const filename = path.resolve(configFile || path.join(config.root, '.lablineage', PROJECT_FILE));
  const updated = {
    ...config,
    remote: {
      api_url: connection.apiUrl,
      project_id: connection.projectId,
      collector_id: connection.collectorId,
      source_id: connection.sourceId,
      submit_url: connection.submitUrl,
      paired_at: connection.pairedAt || new Date().toISOString(),
    },
  };
  await atomicWrite(filename, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

export function snapshotId(manifest) {
  const timestamp = manifest.captured_at.replace(/[-:.TZ]/g, '').slice(0, 14);
  return `snap_${timestamp}_${manifest.bundle_id.replace(/^bnd_/, '').slice(0, 8)}`;
}

export async function storeSnapshot(config, payload) {
  const manifest = payload.manifest || payload;
  const id = snapshotId(manifest);
  const filename = path.join(config.snapshot_directory, `${id}.json`);
  await atomicWrite(filename, `${JSON.stringify(payload, null, 2)}\n`);
  await atomicWrite(path.join(config.snapshot_directory, 'latest'), `${id}\n`);
  return { id, filename };
}

export async function resolveSnapshot(config, reference = 'latest') {
  let id = reference;
  if (reference === 'latest') {
    try {
      id = (await readFile(path.join(config.snapshot_directory, 'latest'), 'utf8')).trim();
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('No snapshots have been captured for this project');
      throw error;
    }
  }
  if (!/^snap_[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid snapshot reference: ${reference}`);
  const filename = path.join(config.snapshot_directory, `${id}.json`);
  const payload = JSON.parse(await readFile(filename, 'utf8'));
  return { id, filename, payload, manifest: payload.manifest || payload };
}
