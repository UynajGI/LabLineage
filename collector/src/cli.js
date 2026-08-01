#!/usr/bin/env node
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readOfflineArchive, verifyOfflineArchive, writeOfflineArchive } from './archive.js';
import { collectSnapshot, diffManifests, signManifest, verifyBundle } from './collector.js';
import { loadPolicy } from './policy.js';
import {
  atomicWrite,
  initializeProject,
  loadProject,
  resolveSnapshot,
  saveProjectConnection,
  storeSnapshot
} from './project.js';
import { attachRunEvidence, captureRun } from './run.js';
import { uploadBundle, uploadQueue } from './upload.js';

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const values = { command, _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === '--') {
      values._ = rest.slice(index + 1);
      break;
    }
    if (!value.startsWith('--')) {
      values._.push(value);
      continue;
    }
    const key = value.slice(2).replaceAll('-', '_');
    values[key] = rest[index + 1]?.startsWith('--') || rest[index + 1] === undefined ? true : rest[++index];
  }
  return values;
}

function help() {
  console.log(`LabLineage Edge Collector

Project workflow:
  init   --project <key> --root <dir>
  pair   --project <key> [--root <dir>] --url <api-url> --pairing <id> --code <code> [--no-sync]
  sync   --project <key> [--root <dir>] [--url <api-url>]
  scan   --project <key> [--root <dir>] [--policy <policy.yaml>] [--out <bundle.json>]
  diff   --project <key> [--root <dir>] --from <snapshot-id> --to <snapshot-id|latest>
  run    --project <key> [--root <dir>] [--label <name>] [--expected <snapshot-id|bundle.json>] -- <command> [args]
  export --project <key> [--root <dir>] --snapshot <snapshot-id|latest> --output <handoff.tar.zst> [--sign-key <pem>]
  verify <handoff.tar.zst|bundle.json>

Low-level and transport workflow:
  snapshot --root <dir> --project <key> --out <bundle.json> --path-salt <secret> [--private-key <pem>]
  diff     --before <bundle-or-manifest.json> --after <bundle-or-manifest.json>
  upload   --bundle <bundle.json> --url <api-url> [--source <source-id>] [--token <service-token>] [--retries <count>]
  upload   --queue <directory> --url <api-url> [--source <source-id>] [--state <state.json>] [--token <service-token>] [--retries <count>]

Snapshots are written atomically. Raw paths and file contents never enter a bundle; files over
2 GiB use a recorded first/middle/last sampled fingerprint unless policy overrides the threshold.
Resource controls: --max-files <n> --io-mbps <n> --cpu-yield-every <n> --max-duration-seconds <n>.`);
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.resolve(filename), 'utf8'));
}

async function projectFromArgs(args) {
  return loadProject({
    root: args.root || process.cwd(),
    configFile: args.config,
    expectedProject: args.project
  });
}

async function signingKey(args, config) {
  const filename = args.private_key || args.sign_key || config?.private_key;
  return filename ? readFile(path.resolve(filename), 'utf8') : null;
}

function resourceOptions(args) {
  return {
    ioDelayMs: args.io_delay_ms ? Number(args.io_delay_ms) : undefined,
    maxFiles: args.max_files ? Number(args.max_files) : undefined,
    maxBytesPerSecond: args.io_mbps ? Number(args.io_mbps) * 1024 * 1024 : undefined,
    cpuYieldEveryFiles: args.cpu_yield_every ? Number(args.cpu_yield_every) : undefined,
    maxDurationMs: args.max_duration_seconds ? Number(args.max_duration_seconds) * 1000 : undefined
  };
}

async function captureProjectSnapshot(args, config) {
  const policy = await loadPolicy(args.policy, config.project_key);
  const manifest = await collectSnapshot({
    root: config.root,
    projectKey: config.project_key,
    pathSalt: config.path_salt,
    indexPath: args.index || config.index,
    exclusions: policy.exclusions,
    fullHashMaxBytes: policy.fullHashMaxBytes,
    sampleChunkBytes: policy.sampleChunkBytes,
    ...resourceOptions(args)
  });
  const key = await signingKey(args, config);
  return { manifest, payload: key ? signManifest(manifest, key) : manifest };
}

async function verifyCommand(args) {
  const filename = args.bundle || args._[0];
  if (!filename) throw new Error('verify requires a .json bundle or .tar.zst archive');
  if (filename.endsWith('.tar.zst') || filename.endsWith('.tzst')) {
    const bundle = await verifyOfflineArchive(filename);
    console.log(`Offline bundle signature valid: ${bundle.manifest.bundle_id}`);
    return;
  }
  const bundle = await readJson(filename);
  if (!verifyBundle(bundle)) throw new Error('Bundle signature is invalid');
  console.log(`Bundle signature valid: ${bundle.manifest.bundle_id}`);
}

async function diffCommand(args) {
  if (args.before && args.after) {
    const beforeRaw = await readJson(args.before);
    const afterRaw = await readJson(args.after);
    console.log(JSON.stringify(diffManifests(beforeRaw.manifest || beforeRaw, afterRaw.manifest || afterRaw), null, 2));
    return;
  }
  if (!args.from || !args.to) throw new Error('diff requires --from and --to, or low-level --before and --after');
  const config = await projectFromArgs(args);
  const before = await resolveSnapshot(config, args.from);
  const after = await resolveSnapshot(config, args.to);
  console.log(JSON.stringify({
    project_key: config.project_key,
    from: before.id,
    to: after.id,
    ...diffManifests(before.manifest, after.manifest)
  }, null, 2));
}

async function uploadCommand(args) {
  if ((!args.bundle && !args.queue) || (args.bundle && args.queue)) {
    throw new Error('upload requires exactly one of --bundle or --queue');
  }
  const config = args.project || !args.url ? await projectFromArgs(args) : null;
  const apiUrl = args.url || config?.remote?.api_url;
  if (!apiUrl) throw new Error('upload requires --url or a paired project');
  const options = {
    apiUrl,
    sourceId: args.source,
    projectId: args.project_id || config?.remote?.project_id,
    token: args.token || process.env.LABLINEAGE_SERVICE_TOKEN,
    retries: args.retries === undefined ? undefined : Number(args.retries)
  };
  if (args.bundle) {
    let filename = path.resolve(args.bundle);
    let temporary;
    if (filename.endsWith('.tar.zst') || filename.endsWith('.tzst')) {
      const bundle = await verifyOfflineArchive(filename);
      temporary = path.join(tmpdir(), `lablineage-upload-${process.pid}-${bundle.manifest.bundle_id}.json`);
      await atomicWrite(temporary, `${JSON.stringify(bundle)}\n`);
      filename = temporary;
    }
    try {
      const result = await uploadBundle({ ...options, filename });
      console.log(`Uploaded ${result.bundleId} (${result.status})`);
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
    }
    return;
  }
  const result = await uploadQueue({
    ...options,
    queueDirectory: path.resolve(args.queue),
    stateFile: args.state ? path.resolve(args.state) : undefined
  });
  console.log(`Upload queue complete: ${result.uploaded} uploaded, ${result.skipped} already complete.`);
}

async function syncProject(args, config) {
  const apiUrl = args.url || config.remote?.api_url;
  const projectId = args.project_id || config.remote?.project_id;
  if (!apiUrl || !projectId) throw new Error('sync requires a paired project or --url and --project-id');
  const { manifest, payload } = await captureProjectSnapshot(args, config);
  const saved = await storeSnapshot(config, payload);
  const uploaded = await uploadBundle({
    filename: saved.filename,
    apiUrl,
    projectId,
    retries: args.retries === undefined ? undefined : Number(args.retries),
  });
  console.log(`Synced ${manifest.bundle_id}; analysis run=${uploaded.result.runId}; status=${uploaded.result.statusUrl}`);
  return uploaded;
}

async function pairCommand(args) {
  if (!args.url || !args.pairing || !args.code) {
    throw new Error('pair requires --url, --pairing and --code');
  }
  const config = await projectFromArgs(args);
  const publicKeyPem = await readFile(config.public_key, 'utf8');
  const endpoint = new URL(`/v1/collector/pairings/${encodeURIComponent(args.pairing)}/claim`, args.url).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': args.pairing },
    body: JSON.stringify({
      code: args.code,
      publicKeyPem,
      deviceName: args.device_name || process.env.COMPUTERNAME || process.env.HOSTNAME || 'Local Collector',
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Pairing failed (${response.status})`);
  const updated = await saveProjectConnection(config, {
    apiUrl: args.url,
    projectId: result.collector.projectId,
    collectorId: result.collector.collectorId,
    sourceId: result.source.id,
    submitUrl: result.submitUrl,
  }, { configFile: args.config });
  console.log(`Paired ${updated.project_key} with collector ${result.collector.collectorId}`);
  if (!args.no_sync) await syncProject(args, updated);
}

async function syncCommand(args) {
  const config = await projectFromArgs(args);
  await syncProject(args, config);
}

async function runCommand(args) {
  if (!args._[0]) throw new Error('run requires a command after --');
  const config = args.expected && args.out && args.path_salt
    ? {
        root: path.resolve(args.root),
        project_key: args.project,
        path_salt: args.path_salt,
        index: args.index,
        private_key: args.private_key
      }
    : await projectFromArgs(args);
  const snapshotOptions = {
    root: config.root,
    projectKey: config.project_key,
    pathSalt: config.path_salt,
    indexPath: args.index || config.index,
    ...resourceOptions(args)
  };
  const before = await collectSnapshot(snapshotOptions);
  const runRecord = await captureRun({
    root: config.root,
    command: args._[0],
    args: args._.slice(1),
    timeoutMs: args.timeout_ms ? Number(args.timeout_ms) : undefined
  });
  if (args.label) runRecord.label = args.label;
  const after = await collectSnapshot(snapshotOptions);
  let expected = before;
  if (args.expected) {
    if (/^snap_/.test(args.expected) || args.expected === 'latest') {
      expected = (await resolveSnapshot(config, args.expected)).manifest;
    } else {
      const raw = await readJson(args.expected);
      expected = raw.manifest || raw;
    }
  }
  const manifest = attachRunEvidence(before, after, runRecord, expected);
  const key = await signingKey(args, config);
  const payload = key ? signManifest(manifest, key) : manifest;
  let saved;
  if (args.out) {
    const outputPath = path.resolve(args.out);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await atomicWrite(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    saved = { filename: outputPath };
  } else {
    saved = await storeSnapshot(config, payload);
  }
  console.log(`Run ${runRecord.run_id} exited ${runRecord.exit_code}; verified=${manifest.run_capture.verified}; snapshot=${saved.id || saved.filename}`);
}

async function scanCommand(args) {
  if (args.command === 'snapshot') {
    if (!args.root || !args.project || !args.out) throw new Error('snapshot requires --root, --project and --out');
    const manifest = await collectSnapshot({
      root: args.root,
      projectKey: args.project,
      pathSalt: args.path_salt,
      indexPath: args.index,
      ...resourceOptions(args)
    });
    const key = await signingKey(args);
    const payload = key ? signManifest(manifest, key) : manifest;
    await atomicWrite(path.resolve(args.out), `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${manifest.stats.files} assets to ${path.resolve(args.out)}`);
    return;
  }
  const config = await projectFromArgs(args);
  const { manifest, payload } = await captureProjectSnapshot(args, config);
  const saved = args.out
    ? { filename: path.resolve(args.out) }
    : await storeSnapshot(config, payload);
  if (args.out) await atomicWrite(saved.filename, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Snapshot ${saved.id || manifest.bundle_id}: ${manifest.stats.files} assets -> ${saved.filename}`);
}

async function exportCommand(args) {
  if (!args.output) throw new Error('export requires --output');
  const config = await projectFromArgs(args);
  const snapshot = await resolveSnapshot(config, args.snapshot || 'latest');
  let bundle = snapshot.payload;
  if (!bundle.manifest) {
    const key = await signingKey(args, config);
    if (!key) throw new Error('Unsigned snapshot requires --sign-key or an initialized project signing key');
    bundle = signManifest(bundle, key);
  }
  if (!verifyBundle(bundle)) throw new Error('Snapshot signature is invalid');
  const result = await writeOfflineArchive(bundle, args.output);
  console.log(`Exported ${snapshot.id} to ${result.output} (${result.compressedBytes} bytes)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help' || args.help) return help();
  if (args.command === 'init') {
    if (!args.project || !args.root) throw new Error('init requires --project and --root');
    const config = await initializeProject({ projectKey: args.project, root: args.root });
    console.log(`Initialized ${config.project_key} at ${config.root}`);
    return;
  }
  if (args.command === 'verify') return verifyCommand(args);
  if (args.command === 'diff') return diffCommand(args);
  if (args.command === 'pair') return pairCommand(args);
  if (args.command === 'sync') return syncCommand(args);
  if (args.command === 'upload') return uploadCommand(args);
  if (args.command === 'run') return runCommand(args);
  if (args.command === 'scan' || args.command === 'snapshot') return scanCommand(args);
  if (args.command === 'export') return exportCommand(args);
  throw new Error(`Unknown command: ${args.command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
