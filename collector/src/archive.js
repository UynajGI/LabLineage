import { promisify } from 'node:util';
import { constants as zlibConstants, zstdCompress, zstdDecompress } from 'node:zlib';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyBundle } from './collector.js';

const compress = promisify(zstdCompress);
const decompress = promisify(zstdDecompress);
const BLOCK_SIZE = 512;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

function writeString(target, offset, length, value) {
  Buffer.from(value, 'utf8').copy(target, offset, 0, length);
}

function writeOctal(target, offset, length, value) {
  const encoded = Math.max(0, value).toString(8).padStart(length - 1, '0');
  writeString(target, offset, length, `${encoded}\0`);
}

function tarEntry(name, bytes) {
  const header = Buffer.alloc(BLOCK_SIZE);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, bytes.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'lablineage');
  writeString(header, 297, 32, 'lablineage');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeOctal(header, 148, 8, checksum);
  const padding = Buffer.alloc((BLOCK_SIZE - (bytes.length % BLOCK_SIZE)) % BLOCK_SIZE);
  return Buffer.concat([header, bytes, padding]);
}

function parseOctal(buffer, offset, length) {
  const value = buffer.subarray(offset, offset + length).toString('ascii').replace(/\0.*$/, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function extractBundleJson(tarBytes) {
  let offset = 0;
  let bundleBytes = null;
  while (offset + BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break;
    const storedChecksum = parseOctal(header, 148, 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const computedChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (storedChecksum !== computedChecksum) throw new Error('Offline archive TAR checksum is invalid');
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseOctal(header, 124, 12);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE_BYTES) {
      throw new Error('Offline archive entry size is invalid');
    }
    const start = offset + BLOCK_SIZE;
    const end = start + size;
    if (end > tarBytes.length) throw new Error('Offline archive is truncated');
    if (name === 'bundle.json') {
      if (bundleBytes) throw new Error('Offline archive contains duplicate bundle.json entries');
      bundleBytes = tarBytes.subarray(start, end);
    } else {
      throw new Error(`Unexpected offline archive entry: ${name}`);
    }
    offset = start + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  if (!bundleBytes) throw new Error('Offline archive does not contain bundle.json');
  return bundleBytes;
}

export async function writeOfflineArchive(bundle, outputFile) {
  if (!verifyBundle(bundle)) throw new Error('A valid Ed25519-signed bundle is required for offline export');
  const json = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
  const tar = Buffer.concat([tarEntry('bundle.json', json), Buffer.alloc(BLOCK_SIZE * 2)]);
  const compressed = await compress(tar, {
    params: {
      [zlibConstants.ZSTD_c_compressionLevel]: 9,
      [zlibConstants.ZSTD_c_checksumFlag]: 1
    }
  });
  const resolved = path.resolve(outputFile);
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, compressed, { mode: 0o600 });
  await rename(temporary, resolved);
  return { output: resolved, compressedBytes: compressed.length, uncompressedBytes: tar.length };
}

export async function readOfflineArchive(inputFile) {
  const compressed = await readFile(path.resolve(inputFile));
  if (compressed.length > MAX_ARCHIVE_BYTES) throw new Error('Offline archive exceeds the verification size limit');
  const tar = await decompress(compressed, { maxOutputLength: MAX_ARCHIVE_BYTES });
  let bundle;
  try {
    bundle = JSON.parse(extractBundleJson(tar).toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Offline archive bundle.json is invalid JSON');
    throw error;
  }
  return bundle;
}

export async function verifyOfflineArchive(inputFile) {
  const bundle = await readOfflineArchive(inputFile);
  if (!verifyBundle(bundle)) throw new Error('Offline archive bundle signature is invalid');
  return bundle;
}
