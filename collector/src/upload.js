import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function bundleId(payload) {
  const id = payload?.manifest?.bundle_id || payload?.bundle_id;
  if (!id || typeof id !== 'string') throw new Error('Bundle is missing bundle_id');
  return id;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readState(filename) {
  try {
    const state = JSON.parse(await readFile(filename, 'utf8'));
    return {
      version: 1,
      completed: typeof state.completed === 'object' && state.completed ? state.completed : {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, completed: {} };
    throw new Error(`Upload state is invalid: ${error.message}`);
  }
}

async function writeState(filename, state) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filename);
}

export async function uploadBundle({
  filename,
  apiUrl,
  sourceId,
  projectId,
  token,
  retries = 4,
  fetchImpl = fetch,
  wait = sleep
}) {
  const payload = JSON.parse(await readFile(filename, 'utf8'));
  const id = bundleId(payload);
  const endpoint = new URL(
    projectId
      ? `/v1/projects/${encodeURIComponent(projectId)}/collector-runs`
      : sourceId ? `/v1/sources/${encodeURIComponent(sourceId)}/bundles` : '/v1/manifests',
    apiUrl
  ).toString();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': id,
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await wait(Math.min(5000, 250 * (2 ** attempt)));
      continue;
    }

    if (response.ok) {
      return { bundleId: id, status: response.status, result: await response.json() };
    }
    const detail = await response.json().catch(() => ({}));
    const message = detail.error || `Upload failed (${response.status})`;
    if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) throw new Error(message);
    lastError = new Error(message);
    await wait(Math.min(5000, 250 * (2 ** attempt)));
  }

  throw lastError || new Error('Upload failed');
}

export async function uploadQueue({
  queueDirectory,
  stateFile = path.join(queueDirectory, '.lablineage-upload-state.json'),
  apiUrl,
  sourceId,
  projectId,
  token,
  retries,
  fetchImpl,
  wait
}) {
  const state = await readState(stateFile);
  const entries = (await readdir(queueDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .filter((entry) => path.resolve(queueDirectory, entry.name) !== path.resolve(stateFile))
    .sort((left, right) => left.name.localeCompare(right.name));
  const results = [];

  for (const entry of entries) {
    const filename = path.join(queueDirectory, entry.name);
    const payload = JSON.parse(await readFile(filename, 'utf8'));
    const id = bundleId(payload);
    if (state.completed[id]) {
      results.push({ bundleId: id, filename, skipped: true });
      continue;
    }
    const uploaded = await uploadBundle({ filename, apiUrl, sourceId, projectId, token, retries, fetchImpl, wait });
    state.completed[id] = {
      filename: entry.name,
      uploadedAt: new Date().toISOString(),
      status: uploaded.status
    };
    await writeState(stateFile, state);
    results.push({ ...uploaded, filename, skipped: false });
  }

  return {
    total: entries.length,
    uploaded: results.filter((result) => !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    stateFile,
    results
  };
}
