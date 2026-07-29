import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function safeObjectKey(key) {
  if (typeof key !== 'string' || !key || key.includes('\\') || key.startsWith('/') || key.includes('\0')) {
    throw Object.assign(new Error('Invalid object key'), { statusCode: 400 });
  }
  const normalized = path.posix.normalize(key);
  if (normalized !== key || normalized === '..' || normalized.startsWith('../')) {
    throw Object.assign(new Error('Unsafe object key'), { statusCode: 400 });
  }
  return normalized;
}

class LocalObjectStore {
  constructor(dataDir) {
    this.root = path.resolve(dataDir, 'objects');
  }

  async putImmutable({ key, content, contentType = 'application/octet-stream', metadata = {} }) {
    const objectKey = safeObjectKey(key);
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const digest = sha256(body);
    const destination = path.join(this.root, ...objectKey.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      if (sha256(existing) !== digest) {
        throw Object.assign(new Error('Immutable object key already contains different content'), { statusCode: 409 });
      }
      return {
        uri: `lablineage-local://${objectKey}`,
        internalPath: destination,
        sha256: digest,
        sizeBytes: body.length,
        contentType,
        metadata,
        idempotent: true,
      };
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
    return {
      uri: `lablineage-local://${objectKey}`,
      internalPath: destination,
      sha256: digest,
      sizeBytes: body.length,
      contentType,
      metadata,
      idempotent: false,
    };
  }

  async get(key) {
    const objectKey = safeObjectKey(key);
    const content = await readFile(path.join(this.root, ...objectKey.split('/')));
    return { content, uri: `lablineage-local://${objectKey}`, sha256: sha256(content) };
  }

  async checkReady() {
    const key = 'system/readiness-v1.txt';
    const content = 'lablineage-object-store-readiness-v1\n';
    const expected = sha256(content);
    await this.putImmutable({ key, content, contentType: 'text/plain' });
    const stored = await this.get(key);
    if (stored.sha256 !== expected) throw new Error('Local object store readiness checksum mismatch');
    return { mode: 'local', writable: true, readable: true };
  }
}

class GoogleCloudObjectStore {
  constructor({ bucketName, projectId }) {
    if (!bucketName) throw new Error('LABLINEAGE_GCS_BUCKET is required for the GCS object store');
    this.bucketName = bucketName;
    this.bucket = new Storage(projectId ? { projectId } : undefined).bucket(bucketName);
  }

  async putImmutable({ key, content, contentType = 'application/octet-stream', metadata = {} }) {
    const objectKey = safeObjectKey(key);
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const digest = sha256(body);
    const file = this.bucket.file(objectKey);
    try {
      await file.save(body, {
        resumable: body.length >= 5 * 1024 * 1024,
        validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType,
          cacheControl: 'private, no-store',
          metadata: {
            ...Object.fromEntries(Object.entries(metadata).map(([name, value]) => [name, String(value)])),
            sha256: digest,
          },
        },
      });
    } catch (error) {
      if (![409, 412].includes(Number(error.code))) throw error;
      const [existingMetadata] = await file.getMetadata();
      if (existingMetadata.metadata?.sha256 !== digest) {
        throw Object.assign(new Error('Immutable object key already contains different content'), { statusCode: 409 });
      }
      return {
        uri: `gs://${this.bucketName}/${objectKey}`,
        generation: existingMetadata.generation,
        crc32c: existingMetadata.crc32c,
        sha256: digest,
        sizeBytes: Number(existingMetadata.size || body.length),
        contentType,
        metadata,
        idempotent: true,
      };
    }
    const [storedMetadata] = await file.getMetadata();
    return {
      uri: `gs://${this.bucketName}/${objectKey}`,
      generation: storedMetadata.generation,
      crc32c: storedMetadata.crc32c,
      sha256: digest,
      sizeBytes: body.length,
      contentType,
      metadata,
      idempotent: false,
    };
  }

  async get(key) {
    const objectKey = safeObjectKey(key);
    const file = this.bucket.file(objectKey);
    const [[content], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    return {
      content,
      uri: `gs://${this.bucketName}/${objectKey}`,
      generation: metadata.generation,
      crc32c: metadata.crc32c,
      sha256: sha256(content),
    };
  }

  async checkReady() {
    const key = 'system/readiness-v1.txt';
    const content = 'lablineage-object-store-readiness-v1\n';
    const expected = sha256(content);
    await this.putImmutable({ key, content, contentType: 'text/plain' });
    const stored = await this.get(key);
    if (stored.sha256 !== expected) throw new Error('GCS object store readiness checksum mismatch');
    return { mode: 'gcs', writable: true, readable: true };
  }
}

export function createObjectStore({ dataDir }) {
  const configuredMode = process.env.LABLINEAGE_OBJECT_STORE;
  const mode = configuredMode || (process.env.NODE_ENV === 'production' ? 'gcs' : 'local');
  if (mode === 'local') {
    if (process.env.NODE_ENV === 'production' && process.env.LABLINEAGE_ALLOW_LOCAL_OBJECT_STORE !== 'true') {
      throw new Error('Local object storage is disabled in production');
    }
    return new LocalObjectStore(dataDir);
  }
  if (mode === 'gcs') {
    return new GoogleCloudObjectStore({
      bucketName: process.env.LABLINEAGE_GCS_BUCKET,
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
  }
  throw new Error(`Unsupported LABLINEAGE_OBJECT_STORE mode: ${mode}`);
}
