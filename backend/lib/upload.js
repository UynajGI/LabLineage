import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import AdmZip from 'adm-zip';

export const UPLOAD_LIMITS = {
  // 单个上传归档上限（zip 文件本身）
  maxArchiveBytes: 100 * 1024 * 1024,
  // 解压后总字节上限（zip 炸弹防护）
  maxExtractBytes: 200 * 1024 * 1024,
  // 解压条目数上限（与扫描器 maxFiles 对齐）
  maxEntries: 10_000,
  // 单个解压文件上限（与扫描器 maxBytes 对齐）
  maxSingleFileBytes: 50 * 1024 * 1024
};

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function isZip(buffer) {
  if (buffer.length < 4) return false;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const marker = buffer.readUInt16LE(2);
  // PK\x03\x04 local file header / PK\x05\x06 end-of-central-directory / PK\x07\x08 data descriptor
  return marker === 0x0403 || marker === 0x0605 || marker === 0x0807;
}

/**
 * 校验 zip 条目名并将其解析为解压目标路径；返回 null 表示该条目不安全。
 * 防御：`..` 段、绝对路径、NUL 字节、反斜杠伪装、越出目标目录。
 */
export function resolveSafeEntry(destDir, entryName) {
  if (!entryName || entryName.includes('\0')) return null;
  const normalized = String(entryName).replace(/\\/gu, '/').replace(/^\.\/+/u, '');
  if (!normalized || path.posix.isAbsolute(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  // Windows 驱动器盘符（C:\... 经反斜杠归一后成为 C:/...）
  if (/^[a-zA-Z]:$/u.test(parts[0])) return null;
  const destRoot = path.resolve(destDir);
  const target = path.resolve(destRoot, ...parts);
  if (target !== destRoot && !target.startsWith(destRoot + path.sep)) return null;
  return target;
}

/**
 * 解析 multipart 上传：接收 `file` 字段（.zip），流式落盘并计算 sha256。
 * 成功时把结构化信息写入 req.body（供幂等指纹），临时目录挂到 req.upload。
 * 幂等重放时通过 req.onIdempotentReplay 清理已解析的临时目录。
 */
export async function uploadArchiveMiddleware(req, res, next) {
  const providedKey = req.get('idempotency-key');
  if (typeof providedKey !== 'string' || providedKey.length < 8) {
    return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
  }
  if (!req.is('multipart/form-data')) {
    return res.status(415).json({ error: 'multipart/form-data is required' });
  }
  const tempDir = await mkdtemp(path.join(tmpdir(), 'lablineage-upload-'));
  try {
    const upload = await new Promise((resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: UPLOAD_LIMITS.maxArchiveBytes, fields: 8, fieldSize: 4096 }
      });
      let settled = false;
      let uploadSeen = false;
      const settle = (fn) => (value) => {
        if (!settled) { settled = true; fn(value); }
      };
      busboy.on('file', (fieldname, file, info) => {
        if (fieldname !== 'file') return file.resume();
        if (uploadSeen) return file.resume();
        uploadSeen = true;
        (async () => {
          try {
            if (!info.filename || !/\.zip$/iu.test(info.filename)) {
              throw httpError(415, 'Only .zip archives are accepted');
            }
            const zipPath = path.join(tempDir, 'archive.zip');
            const sha = createHash('sha256');
            file.on('data', (chunk) => sha.update(chunk));
            await pipeline(file, createWriteStream(zipPath));
            const { size } = await stat(zipPath);
            if (size === 0) throw httpError(400, 'Uploaded archive is empty');
            settle(resolve)({ filename: info.filename, zipPath, sizeBytes: size, sha256: sha.digest('hex') });
          } catch (error) {
            settle(reject)(error);
          }
        })();
      });
      busboy.on('error', (error) => settle(reject)(httpError(400, `Upload parse failed: ${error.message}`)));
      busboy.on('close', () => {
        if (!uploadSeen && !settled) settle(reject)(httpError(400, 'No file field received'));
      });
      req.pipe(busboy);
    });
    const { buffer } = await open(upload.zipPath, 'r').then(async (handle) => {
      const view = Buffer.alloc(4);
      const { bytesRead } = await handle.read(view, 0, 4, 0);
      await handle.close();
      return { buffer: view.subarray(0, bytesRead) };
    });
    if (!isZip(buffer)) throw httpError(415, 'Uploaded file is not a valid zip archive');
    req.body = { archive: { filename: upload.filename, sizeBytes: upload.sizeBytes, sha256: upload.sha256 } };
    req.upload = { ...upload, tempDir };
    req.onIdempotentReplay = () => rm(tempDir, { recursive: true, force: true }).catch(() => {});
    next();
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    next(error);
  }
}

/**
 * 安全解压 zip 到临时目录。返回 { destDir, extractedFiles, extractedBytes, warnings }。
 * 不安全的条目（路径穿越/绝对路径/NUL）被跳过并记录，不阻断其余内容。
 */
export async function extractArchive(zipPath, tempDir) {
  let archive;
  try {
    archive = new AdmZip(zipPath);
  } catch {
    throw httpError(415, 'Uploaded file is not a valid zip archive');
  }
  const entries = archive.getEntries();
  if (entries.length === 0) throw httpError(400, 'Archive is empty');
  if (entries.length > UPLOAD_LIMITS.maxEntries) {
    throw httpError(413, `Archive exceeds ${UPLOAD_LIMITS.maxEntries} entries`);
  }
  const destDir = path.join(tempDir, 'content');
  await mkdir(destDir, { recursive: true });
  let extractedBytes = 0;
  let extractedFiles = 0;
  const warnings = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const target = resolveSafeEntry(destDir, entry.entryName);
    if (!target) {
      warnings.push(`Skipped unsafe entry: ${entry.entryName}`);
      continue;
    }
    const data = entry.getData();
    if (data.length > UPLOAD_LIMITS.maxSingleFileBytes) {
      throw httpError(413, `Entry ${entry.entryName} exceeds ${UPLOAD_LIMITS.maxSingleFileBytes} bytes`);
    }
    extractedBytes += data.length;
    if (extractedBytes > UPLOAD_LIMITS.maxExtractBytes) {
      throw httpError(413, `Extracted archive exceeds ${UPLOAD_LIMITS.maxExtractBytes} bytes`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    extractedFiles += 1;
  }
  return { destDir, extractedFiles, extractedBytes, warnings };
}
