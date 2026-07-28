import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const excludedDirectories = new Set([
  '.git', '.lablineage', '.reference', 'node_modules', 'dist', 'build',
  'coverage', '.next', '.venv', '__pycache__'
]);
const excludedFilePatterns = [
  /^\.env(?:\.|$)/i,
  /(?:^|[._-])(secret|credential|private[-_]?key)(?:[._-]|$)/i,
  /\.(?:pem|p12|pfx|key)$/i
];
const textExtensions = new Set([
  '.c', '.cc', '.conf', '.cpp', '.csv', '.css', '.go', '.h', '.hpp', '.html',
  '.ini', '.java', '.js', '.json', '.jsx', '.log', '.md', '.mjs', '.py',
  '.r', '.rs', '.sh', '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml',
  '.yaml', '.yml'
]);
const mediaTypes = new Map([
  ['.csv', 'text/csv'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.md', 'text/markdown'],
  ['.npy', 'application/x-numpy'],
  ['.parquet', 'application/vnd.apache.parquet'],
  ['.png', 'image/png'],
  ['.py', 'text/x-python'],
  ['.r', 'text/x-r'],
  ['.tif', 'image/tiff'],
  ['.tiff', 'image/tiff'],
  ['.toml', 'application/toml'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml']
]);
const TEXT_DIFF_MAX_BYTES = 256 * 1024;
const TEXT_DIFF_MAX_LINES = 400;
const TEXT_DIFF_MAX_OUTPUT = 64 * 1024;

function isInside(candidate, allowedRoot) {
  const relative = path.relative(allowedRoot, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function hashFile(file, sizeBytes, maxFullHashBytes) {
  const hash = createHash('sha256');
  if (sizeBytes <= maxFullHashBytes) {
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return { contentHash: `sha256:${hash.digest('hex')}`, fingerprintStrength: 'strong' };
  }

  const handle = await open(file, 'r');
  try {
    const chunkSize = Math.min(1024 * 1024, sizeBytes);
    hash.update('lablineage-sampled-v1\0');
    for (const position of [0, Math.max(0, Math.floor((sizeBytes - chunkSize) / 2)), Math.max(0, sizeBytes - chunkSize)]) {
      const buffer = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, position);
      hash.update(String(position));
      hash.update('\0');
      hash.update(buffer.subarray(0, bytesRead));
    }
    hash.update(String(sizeBytes));
    return { contentHash: `sha256:${hash.digest('hex')}`, fingerprintStrength: 'sampled' };
  } finally {
    await handle.close();
  }
}

function fileClassification(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const kind = textExtensions.has(extension)
    ? 'text'
    : mediaTypes.get(extension)?.startsWith('image/')
      ? 'image'
      : ['.bin', '.h5', '.hdf5', '.npy', '.npz', '.parquet', '.pt', '.pth'].includes(extension)
        ? 'data'
        : 'binary';
  return {
    extension: extension || null,
    mediaType: mediaTypes.get(extension) || (kind === 'text' ? 'text/plain' : 'application/octet-stream'),
    kind
  };
}

function redactText(text) {
  return text
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/giu, '$1<redacted>')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,})\b/gu, '<redacted-token>');
}

function unifiedDiff(beforeText, afterText, label) {
  const oldLines = beforeText.split('\n');
  const newLines = afterText.split('\n');
  if (oldLines.length > TEXT_DIFF_MAX_LINES || newLines.length > TEXT_DIFF_MAX_LINES) {
    return { available: false, reason: 'line_limit_exceeded', oldLineCount: oldLines.length, newLineCount: newLines.length };
  }

  const table = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  const output = [`--- a/${label}`, `+++ b/${label}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      output.push(` ${oldLines[oldIndex]}`);
      oldIndex += 1;
      newIndex += 1;
    } else if (newIndex < newLines.length && (oldIndex >= oldLines.length || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
      output.push(`+${newLines[newIndex]}`);
      newIndex += 1;
    } else {
      output.push(`-${oldLines[oldIndex]}`);
      oldIndex += 1;
    }
  }
  const content = output.join('\n');
  return {
    available: true,
    format: 'unified',
    content: content.slice(0, TEXT_DIFF_MAX_OUTPUT),
    oldLineCount: oldLines.length,
    newLineCount: newLines.length,
    truncated: content.length > TEXT_DIFF_MAX_OUTPUT
  };
}

function stableChangeId(previous, current, type, pathToken) {
  return `change_${createHash('sha256')
    .update(`${previous?.id || 'baseline'}\0${current?.id || 'unknown'}\0${type}\0${pathToken}`)
    .digest('hex')
    .slice(0, 24)}`;
}

export function archiveSnapshotIndex(snapshot) {
  if (!snapshot?.files || snapshot.compressedIndex) return snapshot;
  const raw = Buffer.from(JSON.stringify({ files: snapshot.files, changes: snapshot.changes || [] }));
  const compressed = gzipSync(raw, { level: 9 });
  snapshot.compressedIndex = {
    encoding: 'gzip+base64',
    sha256: createHash('sha256').update(raw).digest('hex'),
    originalBytes: raw.length,
    compressedBytes: compressed.length,
    data: compressed.toString('base64')
  };
  snapshot.indexArchivedAt = new Date().toISOString();
  delete snapshot.files;
  delete snapshot.changes;
  return snapshot;
}

export function materializeSnapshotIndex(snapshot) {
  if (!snapshot?.compressedIndex) return snapshot;
  if (snapshot.compressedIndex.encoding !== 'gzip+base64') throw new Error('Unsupported snapshot index encoding');
  const raw = gunzipSync(Buffer.from(snapshot.compressedIndex.data, 'base64'));
  const digest = createHash('sha256').update(raw).digest('hex');
  if (digest !== snapshot.compressedIndex.sha256) throw new Error('Snapshot index checksum mismatch');
  const index = JSON.parse(raw.toString('utf8'));
  return { ...snapshot, files: index.files, changes: index.changes };
}

export function applySnapshotRetention(state, projectId, hotCount = Number(process.env.LABLINEAGE_SNAPSHOT_HOT_COUNT || 20)) {
  const boundedHotCount = Number.isInteger(hotCount) ? Math.min(1000, Math.max(2, hotCount)) : 20;
  const snapshots = state.snapshots
    .filter((snapshot) => snapshot.projectId === projectId)
    .sort((left, right) => String(left.collectedAt).localeCompare(String(right.collectedAt)));
  for (const snapshot of snapshots.slice(0, Math.max(0, snapshots.length - boundedHotCount))) {
    archiveSnapshotIndex(snapshot);
  }
}

export async function scanDirectory(requestedPath, options = {}) {
  const root = path.resolve(requestedPath);
  const configuredRoot = options.allowedRoot || process.env.LABLINEAGE_SCAN_ROOT;
  if (process.env.NODE_ENV === 'production' && !configuredRoot) {
    throw Object.assign(new Error('LABLINEAGE_SCAN_ROOT is required for server-side scans in production'), { statusCode: 503 });
  }
  const allowedRoot = path.resolve(configuredRoot || root);
  if (!isInside(root, allowedRoot)) {
    throw Object.assign(new Error('Requested path is outside LABLINEAGE_SCAN_ROOT'), { statusCode: 403 });
  }
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw Object.assign(new Error('Scan path must be a directory'), { statusCode: 400 });

  const files = [];
  const warnings = [];
  const maxFiles = options.maxFiles || 10_000;
  const maxBytes = options.maxBytes || 50 * 1024 * 1024;
  const includeTextContent = Boolean(options.includeTextContent);
  const redactPaths = options.redactPaths ?? process.env.NODE_ENV === 'production';
  const pathSalt = options.pathSalt || process.env.LABLINEAGE_PATH_SALT;
  if (redactPaths && !pathSalt) {
    throw Object.assign(new Error('LABLINEAGE_PATH_SALT is required when path redaction is enabled'), { statusCode: 503 });
  }
  const exportedPath = (relativePath) => redactPaths
    ? `pth_${createHmac('sha256', pathSalt).update(relativePath).digest('hex').slice(0, 32)}`
    : relativePath;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        warnings.push(`File limit ${maxFiles} reached`);
        return;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      if (entry.isFile() && excludedFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const metadata = await stat(absolute);
        const relativePath = path.relative(root, absolute).split(path.sep).join('/');
        const pathToken = exportedPath(relativePath);
        const classification = fileClassification(relativePath);
        const fingerprint = await hashFile(absolute, metadata.size, maxBytes);
        let textSnapshot;
        if (includeTextContent && classification.kind === 'text' && metadata.size <= TEXT_DIFF_MAX_BYTES) {
          const buffer = await readFile(absolute);
          if (!buffer.includes(0)) textSnapshot = redactText(buffer.toString('utf8').replace(/\r\n?/gu, '\n'));
        }
        files.push({
          pathToken,
          sizeBytes: metadata.size,
          modifiedAt: metadata.mtime.toISOString(),
          ...classification,
          ...fingerprint,
          ...(textSnapshot === undefined ? {} : { textSnapshot })
        });
        if (fingerprint.fingerprintStrength === 'sampled') warnings.push(`Sampled oversized file: ${pathToken}`);
      }
    }
  }

  await walk(root);
  files.sort((a, b) => a.pathToken.localeCompare(b.pathToken));
  const directoryRootHash = `sha256:${createHash('sha256')
    .update(files.map((file) => `${file.pathToken}\0${file.contentHash}\0${file.sizeBytes}`).join('\n'))
    .digest('hex')}`;
  return {
    id: `snapshot_${randomUUID()}`,
    collectedAt: new Date().toISOString(),
    sourceLabel: redactPaths ? exportedPath('.') : path.basename(root),
    fileCount: files.length,
    directoryRootHash,
    historyCoverage: 'observed_from_capture',
    textDiffCapture: includeTextContent ? 'authorized_redacted' : 'disabled',
    files,
    warnings
  };
}

export function diffSnapshots(previous, current) {
  if (!current) return [];
  const oldFiles = new Map((previous?.files || []).map((file) => [file.pathToken, file]));
  const newFiles = new Map(current.files.map((file) => [file.pathToken, file]));
  const changes = [];

  for (const [pathToken, file] of newFiles) {
    const before = oldFiles.get(pathToken);
    if (!before) {
      changes.push({
        path: pathToken,
        type: 'added',
        newHash: file.contentHash,
        newSizeBytes: file.sizeBytes,
        sizeDiffBytes: file.sizeBytes,
        metadata: { kind: file.kind, mediaType: file.mediaType, extension: file.extension, modifiedAt: file.modifiedAt }
      });
    } else if (before.contentHash !== file.contentHash) {
      const textDiff = before.textSnapshot !== undefined && file.textSnapshot !== undefined
        ? unifiedDiff(before.textSnapshot, file.textSnapshot, pathToken)
        : { available: false, reason: before.kind === 'text' && file.kind === 'text' ? 'text_capture_disabled' : 'binary_or_unsupported' };
      changes.push({
        path: pathToken,
        type: 'modified',
        oldHash: before.contentHash,
        newHash: file.contentHash,
        oldSizeBytes: before.sizeBytes,
        newSizeBytes: file.sizeBytes,
        sizeDiffBytes: file.sizeBytes - before.sizeBytes,
        metadataChanges: {
          modifiedAt: { before: before.modifiedAt, after: file.modifiedAt },
          sizeBytes: { before: before.sizeBytes, after: file.sizeBytes },
          fingerprintStrength: { before: before.fingerprintStrength || 'strong', after: file.fingerprintStrength || 'strong' },
          mediaType: { before: before.mediaType || null, after: file.mediaType || null }
        },
        textDiff,
        ...(textDiff.available ? { diffSnippet: textDiff.content } : {})
      });
    }
  }
  for (const [pathToken, file] of oldFiles) {
    if (!newFiles.has(pathToken)) {
      changes.push({
        path: pathToken,
        type: 'deleted',
        oldHash: file.contentHash,
        oldSizeBytes: file.sizeBytes,
        sizeDiffBytes: -file.sizeBytes,
        metadata: { kind: file.kind, mediaType: file.mediaType, extension: file.extension, modifiedAt: file.modifiedAt }
      });
    }
  }

  const additionsByHash = Map.groupBy(changes.filter((item) => item.type === 'added'), (item) => item.newHash);
  const deletionsByHash = Map.groupBy(changes.filter((item) => item.type === 'deleted'), (item) => item.oldHash);
  for (const [hash, deletedGroup] of deletionsByHash) {
    const addedGroup = additionsByHash.get(hash) || [];
    if (deletedGroup.length === 1 && addedGroup.length === 1) {
      const [deleted] = deletedGroup;
      const [added] = addedGroup;
      deleted.type = 'moved';
      deleted.path = `${deleted.path} → ${added.path}`;
      deleted.newHash = added.newHash;
      deleted.newSizeBytes = added.newSizeBytes;
      deleted.sizeDiffBytes = 0;
      deleted.inference = {
        status: 'inferred',
        kind: 'move_candidate',
        confidence: 'strong',
        basis: ['matching_content_hash', 'matching_size']
      };
      changes.splice(changes.indexOf(added), 1);
    }
  }
  for (const added of changes.filter((item) => item.type === 'added')) {
    if ([...oldFiles.values()].some((file) => file.contentHash === added.newHash)) {
      added.inference = {
        status: 'inferred',
        kind: 'copy_candidate',
        confidence: 'strong',
        basis: ['matching_existing_content_hash']
      };
    }
  }
  for (const change of changes) {
    change.id = stableChangeId(previous, current, change.type, change.path);
    change.evidence = {
      previousSnapshotId: previous?.id || null,
      currentSnapshotId: current.id,
      deterministic: true
    };
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
