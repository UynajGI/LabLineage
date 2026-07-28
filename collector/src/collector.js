import { createHash, createHmac, createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson } from './canonical.js';
import { detectGit } from './git.js';
import { artifactType, imageMetadata, parseConfig, parseLog, parseNotebook, parsePython } from './parsers.js';

const DEFAULT_EXCLUDES = [
  '.git', '.lablineage', 'node_modules', '.venv', 'venv', '__pycache__',
  'dist', 'build', '.next', '.cache', '.env', '.env.local', '.env.production',
  'credentials.json', 'service-account.json', 'id_rsa', 'id_ed25519'
];
const TEXT_MAX_BYTES = 2 * 1024 * 1024;
const FULL_HASH_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SAMPLE_CHUNK_BYTES = 8 * 1024 * 1024;
const IMAGE_HEADER_BYTES = 512 * 1024;

function samplingPolicy(bytes) {
  return bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0
    ? `first-middle-last:${bytes / (1024 * 1024)}MiB`
    : `first-middle-last:${bytes}B`;
}

function normalizeRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function isExcluded(relative, exclusions) {
  const segments = relative.split('/');
  return exclusions.some((rule) => segments.includes(rule) || relative.startsWith(`${rule}/`));
}

async function walk(root, exclusions, maxFiles) {
  const found = [];
  const warnings = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (['EACCES', 'EPERM', 'ENOENT'].includes(error.code)) {
        warnings.push({ relative: normalizeRelative(root, directory) || '.', code: error.code });
        return;
      }
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizeRelative(root, absolute);
      if (isExcluded(relative, exclusions)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        found.push({ absolute, relative });
        if (found.length > maxFiles) throw new Error(`File limit exceeded (${maxFiles})`);
      }
    }
  };
  await visit(root);
  return { files: found, warnings };
}

function openIndex(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS file_index (
      logical_path TEXT PRIMARY KEY,
      size_bytes INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      sha256 TEXT NOT NULL,
      hash_strategy TEXT NOT NULL DEFAULT 'full-sha256',
      sample_bytes INTEGER NOT NULL DEFAULT 0,
      observed_at TEXT NOT NULL
    );
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(file_index)').all().map((column) => column.name));
  if (!columns.has('hash_strategy')) {
    db.exec("ALTER TABLE file_index ADD COLUMN hash_strategy TEXT NOT NULL DEFAULT 'full-sha256'");
  }
  if (!columns.has('sample_bytes')) {
    db.exec('ALTER TABLE file_index ADD COLUMN sample_bytes INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

function pathToken(projectKey, relative, salt) {
  return `pth_${createHmac('sha256', salt).update(`${projectKey}\0${relative}`).digest('hex').slice(0, 32)}`;
}

function assetId(projectKey, relative) {
  return `ast_${createHash('sha256').update(`${projectKey}\0${relative}`).digest('hex').slice(0, 32)}`;
}

async function readSlice(filename, position, length) {
  const handle = await open(filename, 'r');
  try {
    const bytes = Buffer.alloc(Math.max(0, Math.min(length, (await handle.stat()).size - position)));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, position);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function hashFile(file, metadata, db, fullHashMaxBytes = FULL_HASH_MAX_BYTES, sampleChunkBytes = SAMPLE_CHUNK_BYTES) {
  const cached = db.prepare(
    'SELECT size_bytes, mtime_ms, sha256, hash_strategy, sample_bytes FROM file_index WHERE logical_path = ?'
  ).get(file.relative);
  const desiredStrategy = metadata.size > fullHashMaxBytes ? 'sampled-sha256' : 'full-sha256';
  const expectedSampleBytes = desiredStrategy === 'sampled-sha256' ? sampleChunkBytes * 3 : 0;
  const cacheStrategyValid = cached?.hash_strategy === 'full-sha256' ||
    (cached?.hash_strategy === desiredStrategy && cached?.sample_bytes === expectedSampleBytes);
  if (cached && cached.size_bytes === metadata.size && cached.mtime_ms === metadata.mtimeMs && cacheStrategyValid) {
    return {
      sha256: cached.sha256,
      cached: true,
      strategy: cached.hash_strategy,
      strength: cached.hash_strategy === 'sampled-sha256' ? 'sampled' : 'strong',
      sampleBytes: cached.sample_bytes
    };
  }
  const hash = createHash('sha256');
  let bytes;
  let strategy = 'full-sha256';
  let strength = 'strong';
  let sampledBytes = 0;
  if (metadata.size > fullHashMaxBytes) {
    strategy = 'sampled-sha256';
    strength = 'sampled';
    const positions = [0, Math.max(0, Math.floor((metadata.size - sampleChunkBytes) / 2)), Math.max(0, metadata.size - sampleChunkBytes)];
    hash.update(`lablineage-sampled-v1\0${metadata.size}\0${sampleChunkBytes}\0`);
    for (const position of [...new Set(positions)]) {
      const sample = await readSlice(file.absolute, position, sampleChunkBytes);
      hash.update(`${position}\0${sample.length}\0`);
      hash.update(sample);
      sampledBytes += sample.length;
    }
  } else {
    for await (const chunk of createReadStream(file.absolute)) hash.update(chunk);
    if (metadata.size <= TEXT_MAX_BYTES) bytes = await readFile(file.absolute);
  }
  const sha256 = hash.digest('hex');
  db.prepare(`
    INSERT INTO file_index(logical_path,size_bytes,mtime_ms,sha256,hash_strategy,sample_bytes,observed_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(logical_path) DO UPDATE SET
      size_bytes=excluded.size_bytes,mtime_ms=excluded.mtime_ms,
      sha256=excluded.sha256,hash_strategy=excluded.hash_strategy,
      sample_bytes=excluded.sample_bytes,observed_at=excluded.observed_at
  `).run(file.relative, metadata.size, metadata.mtimeMs, sha256, strategy, sampledBytes, new Date().toISOString());
  return { sha256, cached: false, bytes, strategy, strength, sampleBytes: sampledBytes };
}

async function staticEvidence(file, bytes) {
  if (!bytes || bytes.length > TEXT_MAX_BYTES) return [];
  const extension = path.extname(file.relative).toLowerCase();
  const source = bytes.toString('utf8');
  if (extension === '.py') return parsePython(source, file.relative);
  if (extension === '.ipynb') return parseNotebook(source, file.relative);
  if (['.log', '.out', '.err'].includes(extension)) return parseLog(source, file.relative);
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'].includes(extension)) return parseConfig(source, file.relative);
  return [];
}

export async function collectSnapshot(options) {
  const root = path.resolve(options.root);
  const projectKey = options.projectKey;
  if (!projectKey) throw new Error('projectKey is required');
  const exclusions = [...DEFAULT_EXCLUDES, ...(options.exclusions || [])];
  const maxFiles = options.maxFiles || 100_000;
  const salt = options.pathSalt || process.env.LABLINEAGE_PATH_SALT;
  if (!salt) throw new Error('A path salt is required; set --path-salt or LABLINEAGE_PATH_SALT');
  const indexPath = options.indexPath || path.join(root, '.lablineage', 'collector.sqlite');
  await mkdir(path.dirname(indexPath), { recursive: true });
  const db = openIndex(indexPath);
  const walked = await walk(root, exclusions, maxFiles);
  const files = walked.files;
  const scanWarnings = [...walked.warnings];
  const records = [];
  let cacheHits = 0;
  let processedFiles = 0;
  let ioBytesRead = 0;
  let schedulerYields = 0;
  const startedAt = Date.now();
  const maxBytesPerSecond = Number(options.maxBytesPerSecond || 0);
  const cpuYieldEveryFiles = Math.max(1, Number(options.cpuYieldEveryFiles || 100));
  const maxDurationMs = Number(options.maxDurationMs || 0);
  if (!Number.isFinite(maxBytesPerSecond) || maxBytesPerSecond < 0) throw new Error('maxBytesPerSecond must be a non-negative number');
  if (!Number.isFinite(cpuYieldEveryFiles)) throw new Error('cpuYieldEveryFiles must be a positive number');
  if (!Number.isFinite(maxDurationMs) || maxDurationMs < 0) throw new Error('maxDurationMs must be a non-negative number');
  try {
    for (const file of files) {
      if (options.signal?.aborted) throw Object.assign(new Error('Snapshot scan aborted'), { code: 'ABORT_ERR' });
      if (maxDurationMs && Date.now() - startedAt >= maxDurationMs) {
        throw Object.assign(new Error(`Snapshot scan exceeded ${maxDurationMs} ms`), { code: 'SCAN_TIMEOUT' });
      }
      let metadata;
      let hashed;
      try {
        metadata = await stat(file.absolute);
        hashed = await hashFile(
          file,
          metadata,
          db,
          options.fullHashMaxBytes || FULL_HASH_MAX_BYTES,
          options.sampleChunkBytes || SAMPLE_CHUNK_BYTES
        );
      } catch (error) {
        if (['EACCES', 'EPERM', 'ENOENT'].includes(error.code)) {
          scanWarnings.push({ relative: file.relative, code: error.code });
          continue;
        }
        throw error;
      }
      if (hashed.cached) cacheHits += 1;
      if (!hashed.cached) {
        ioBytesRead += hashed.strength === 'sampled'
          ? Math.min(metadata.size, (options.sampleChunkBytes || SAMPLE_CHUNK_BYTES) * 3)
          : metadata.size;
      }
      processedFiles += 1;
      const id = assetId(projectKey, file.relative);
      const token = pathToken(projectKey, file.relative, salt);
      const extension = path.extname(file.relative).toLowerCase();
      const metadataDetails = ['.png', '.jpg', '.jpeg'].includes(extension)
        ? imageMetadata(hashed.bytes || await readSlice(file.absolute, 0, IMAGE_HEADER_BYTES), file.relative)
        : {};
      records.push({
        record_type: 'asset',
        asset_id: id,
        name: path.basename(file.relative),
        path_token: token,
        asset_type: artifactType(file.relative),
        content_hash: `sha256:${hashed.sha256}`,
        fingerprint: {
          algorithm: 'sha256',
          strength: hashed.strength,
          value: hashed.sha256,
          ...(hashed.strategy === 'sampled-sha256'
            ? { sampling_policy: samplingPolicy(options.sampleChunkBytes || SAMPLE_CHUNK_BYTES) }
            : {})
        },
        size_bytes: metadata.size,
        modified_at: metadata.mtime.toISOString(),
        ...metadataDetails
      });
      const parseBytes = hashed.bytes || (
        ['.py', '.ipynb', '.log', '.out', '.err', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'].includes(extension)
          ? await readFile(file.absolute)
          : null
      );
      for (const evidence of await staticEvidence(file, parseBytes)) {
        if (evidence.record_type === 'parameter_set') {
          const evidenceId = `ev_${createHash('sha256').update(canonicalJson(evidence)).digest('hex').slice(0, 32)}`;
          const parameterSetId = `par_${createHash('sha256').update(`${projectKey}\0${file.relative}\0${canonicalJson(evidence.parameters)}`).digest('hex').slice(0, 32)}`;
          records.push({
            record_type: 'parameter_set',
            asset_id: parameterSetId,
            name: `${path.basename(file.relative)} parameters`,
            parameters: evidence.parameters,
            parser: evidence.parser,
            evidence_ids: [evidenceId]
          });
          records.push({
            record_type: 'lineage_edge',
            from_entity_id: id,
            to_entity_id: parameterSetId,
            relation_type: 'defines_parameters',
            confidence_label: 'strong',
            evidence_ids: [evidenceId]
          });
          continue;
        }
        if (!evidence.referenced_path) {
          const runSignalId = createHash('sha256').update(canonicalJson({
            file: file.relative,
            parser: evidence.parser,
            relation: evidence.relation,
            line: evidence.line,
            failure_reason: evidence.failure_reason,
            job_state: evidence.job_state
          })).digest('hex').slice(0, 32);
          records.push({
            record_type: 'run',
            run_id: `runlog_${runSignalId}`,
            name: path.basename(file.relative),
            ...(evidence.exit_code !== undefined ? { exit_code: evidence.exit_code } : {}),
            ...(evidence.failure_reason ? { failure_reason: evidence.failure_reason } : {}),
            ...(evidence.job_state ? { job_state: evidence.job_state } : {}),
            verification_status: evidence.relation === 'run_failure_signal' ? 'failed' : 'captured',
            evidence_ids: [`ev_${createHash('sha256').update(canonicalJson(evidence)).digest('hex').slice(0, 32)}`]
          });
          continue;
        }
        const referenced = evidence.referenced_path;
        const target = assetId(projectKey, referenced);
        records.push({
          record_type: 'lineage_edge',
          from_entity_id: evidence.relation === 'writes_to' ? id : target,
          to_entity_id: evidence.relation === 'writes_to' ? target : id,
          relation_type: evidence.relation,
          confidence_label: evidence.confidence_label,
          evidence_ids: [`ev_${createHash('sha256').update(canonicalJson(evidence)).digest('hex').slice(0, 32)}`],
          parser: evidence.parser,
          line: evidence.line
        });
      }
      options.onProgress?.({ processedFiles, totalFiles: files.length, relative: file.relative });
      if (options.ioDelayMs) await new Promise((resolve) => setTimeout(resolve, options.ioDelayMs));
      if (maxBytesPerSecond > 0 && ioBytesRead > 0) {
        let remainingMs = (ioBytesRead / maxBytesPerSecond) * 1000 - (Date.now() - startedAt);
        while (remainingMs > 0) {
          if (options.signal?.aborted) throw Object.assign(new Error('Snapshot scan aborted'), { code: 'ABORT_ERR' });
          if (maxDurationMs && Date.now() - startedAt >= maxDurationMs) {
            throw Object.assign(new Error(`Snapshot scan exceeded ${maxDurationMs} ms`), { code: 'SCAN_TIMEOUT' });
          }
          const durationBudgetMs = maxDurationMs ? Math.max(1, maxDurationMs - (Date.now() - startedAt)) : Infinity;
          await new Promise((resolve) => setTimeout(resolve, Math.min(remainingMs, 1000, durationBudgetMs)));
          remainingMs = (ioBytesRead / maxBytesPerSecond) * 1000 - (Date.now() - startedAt);
        }
      }
      if (processedFiles % cpuYieldEveryFiles === 0) {
        schedulerYields += 1;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    const git = await detectGit(root);
    if (git) {
      records.push({
        record_type: 'code_version',
        asset_id: `git_${git.commit}`,
        name: git.branch ? `${git.branch}@${git.commit.slice(0, 12)}` : git.commit.slice(0, 12),
        content_hash: `sha256:${createHash('sha256').update(git.commit).digest('hex')}`,
        git_commit: git.commit,
        git_branch: git.branch,
        git_dirty: git.dirty,
        git_changed_entries: git.changed_entries,
        committed_at: git.committed_at
      });
    }
    records.push({
      record_type: 'environment',
      asset_id: `env_${createHash('sha256').update(`${process.platform}:${process.arch}:${process.version}`).digest('hex').slice(0, 32)}`,
      name: `${process.platform}-${process.arch}-${process.version}`,
      platform: process.platform,
      architecture: process.arch,
      node_version: process.version
    });
  } finally {
    db.close();
  }
  return {
    schema_version: 'lablineage.manifest.v1',
    bundle_id: `bnd_${randomUUID()}`,
    project_key: projectKey,
    collector: { name: '@lablineage/edge-collector', version: '0.3.0' },
    captured_at: new Date().toISOString(),
    root_path_token: pathToken(projectKey, '.', salt),
    policy: { exclusions, symlinks: 'ignored', raw_paths_exported: false },
    stats: {
      files: processedFiles,
      records: records.length,
      hash_cache_hits: cacheHits,
      git_detected: records.some((record) => record.record_type === 'code_version'),
      duration_ms: Date.now() - startedAt,
      io_bytes_read: ioBytesRead,
      scheduler_yields: schedulerYields,
      resource_policy: {
        max_files: maxFiles,
        max_bytes_per_second: maxBytesPerSecond || null,
        cpu_yield_every_files: cpuYieldEveryFiles,
        max_duration_ms: maxDurationMs || null
      },
      scan_warnings: scanWarnings.map((warning) => ({
        path_token: pathToken(projectKey, warning.relative, salt),
        code: warning.code
      }))
    },
    directory_fingerprint: {
      algorithm: 'sha256',
      strength: 'strong',
      value: createHash('sha256').update(canonicalJson(records
        .filter((record) => record.record_type === 'asset')
        .map(({ asset_id, content_hash }) => ({ asset_id, content_hash }))
      )).digest('hex'),
      strategy: 'sorted-asset-merkle-v1'
    },
    records
  };
}

export function diffManifests(before, after) {
  const assets = (manifest) => manifest.records.filter((record) => record.record_type === 'asset');
  const oldById = new Map(assets(before).map((record) => [record.asset_id, record]));
  const newById = new Map(assets(after).map((record) => [record.asset_id, record]));
  const added = [];
  const modified = [];
  const deleted = [];
  for (const [id, record] of newById) {
    const previous = oldById.get(id);
    if (!previous) added.push(record);
    else if (previous.content_hash !== record.content_hash) modified.push({ before: previous, after: record });
  }
  for (const [id, record] of oldById) {
    if (!newById.has(id)) deleted.push(record);
  }
  const moved = [];
  for (let index = deleted.length - 1; index >= 0; index -= 1) {
    const addedIndex = added.findIndex((candidate) => candidate.content_hash === deleted[index].content_hash);
    if (addedIndex >= 0) {
      moved.push({ before: deleted[index], after: added[addedIndex] });
      deleted.splice(index, 1);
      added.splice(addedIndex, 1);
    }
  }
  return { added, modified, deleted, moved };
}

export function signManifest(manifest, privateKeyPem) {
  const payload = Buffer.from(canonicalJson(manifest));
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  return {
    manifest,
    signature: {
      algorithm: 'Ed25519',
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
      value_base64: sign(null, payload, privateKey).toString('base64')
    }
  };
}

export function verifyBundle(bundle) {
  if (!bundle?.manifest || bundle?.signature?.algorithm !== 'Ed25519') return false;
  return verify(
    null,
    Buffer.from(canonicalJson(bundle.manifest)),
    createPublicKey(bundle.signature.public_key_pem),
    Buffer.from(bundle.signature.value_base64, 'base64')
  );
}
