import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, delimiter, isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_TREE_LIMIT = 10_000;

function repositoryToken(root) {
  return createHash('sha256').update(root).digest('hex').slice(0, 20);
}

function pathToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withinRoot(candidate, root) {
  const result = relative(root, candidate);
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result));
}

function configuredRoots() {
  return (process.env.LABLINEAGE_LOCAL_GIT_ROOTS || '')
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function canonicalAllowedRepository(inputPath, allowedRoots) {
  if (!inputPath) throw Object.assign(new Error('Local Git path is required'), { statusCode: 400 });
  const candidate = await realpath(resolve(inputPath)).catch(() => null);
  if (!candidate) throw Object.assign(new Error('Local Git repository is unavailable'), { statusCode: 404 });
  const roots = (await Promise.all(
    allowedRoots.map((item) => realpath(resolve(item)).catch(() => null))
  )).filter(Boolean);
  if (!roots.some((root) => withinRoot(candidate, root))) {
    throw Object.assign(new Error('Local Git repository is outside LABLINEAGE_LOCAL_GIT_ROOTS'), { statusCode: 403 });
  }
  return { candidate, roots };
}

async function git(root, args, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = 16 * 1024 * 1024 } = {}) {
  try {
    const result = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return result.stdout.trim();
  } catch (error) {
    const message = String(error.stderr || error.message || '').trim().slice(0, 500);
    throw Object.assign(new Error(`Local Git command failed${message ? `: ${message}` : ''}`), {
      statusCode: error.code === 'ENOENT' ? 503 : 422,
    });
  }
}

function streamNullRecords(root, args, { limit, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', ['-C', root, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    const records = [];
    let pending = Buffer.alloc(0);
    let stderr = '';
    let intentionallyStopped = false;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    timer.unref?.();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-1000);
    });
    child.stdout.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      let separator;
      while ((separator = pending.indexOf(0)) >= 0) {
        records.push(pending.subarray(0, separator).toString('utf8'));
        pending = pending.subarray(separator + 1);
        if (records.length >= limit) {
          intentionallyStopped = true;
          child.kill();
          break;
        }
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(Object.assign(new Error(`Local Git command failed: ${error.message}`), { statusCode: 503 }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code && !intentionallyStopped) {
        rejectPromise(Object.assign(new Error(`Local Git command failed: ${stderr.trim().slice(0, 500)}`), { statusCode: 422 }));
        return;
      }
      resolvePromise({ records, truncated: intentionallyStopped });
    });
  });
}

function parseCommit(record) {
  const [sha, authoredAt, committedAt, ...message] = record.split('\x1f');
  return {
    sha,
    message: message.join('\x1f'),
    authoredAt,
    committedAt,
    authorLogin: null,
    htmlUrl: null,
  };
}

function parseTreeEntry(record) {
  const match = record.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\s+(\d+|-)\t([\s\S]+)$/);
  if (!match) return null;
  const [, mode, type, objectId, rawSize, filePath] = match;
  return {
    pathToken: pathToken(filePath),
    mode,
    type,
    objectId,
    sizeBytes: rawSize === '-' ? null : Number(rawSize),
  };
}

export class LocalGitClient {
  constructor({ allowedRoots = configuredRoots(), timeoutMs = Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) } = {}) {
    this.allowedRoots = allowedRoots;
    this.timeoutMs = timeoutMs;
  }

  async collectRepository(inputPath, { branch, limit = 50, treeLimit = DEFAULT_TREE_LIMIT } = {}) {
    if (!this.allowedRoots.length) {
      throw Object.assign(new Error('LABLINEAGE_LOCAL_GIT_ROOTS must allow at least one repository root'), { statusCode: 503 });
    }
    const { candidate: requestedRoot, roots: allowedRoots } = await canonicalAllowedRepository(inputPath, this.allowedRoots);
    const root = await realpath(await git(requestedRoot, ['rev-parse', '--show-toplevel'], { timeoutMs: this.timeoutMs }));
    if (!allowedRoots.some((allowedRoot) => withinRoot(root, allowedRoot))) {
      throw Object.assign(new Error('Resolved Git root is outside LABLINEAGE_LOCAL_GIT_ROOTS'), { statusCode: 403 });
    }
    const resolvedBranch = branch || await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { timeoutMs: this.timeoutMs })
      .catch(() => 'HEAD');
    const revision = branch || 'HEAD';
    const [headSha, commitOutput, branchOutput, tagOutput, treeResult] = await Promise.all([
      git(root, ['rev-parse', '--verify', `${revision}^{commit}`], { timeoutMs: this.timeoutMs }),
      git(root, [
        'log',
        `-${Math.min(Math.max(Number(limit) || 50, 1), 100)}`,
        '--date=iso-strict',
        '--format=%H%x1f%aI%x1f%cI%x1f%B%x00',
        revision,
      ], { timeoutMs: this.timeoutMs }),
      git(root, ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads'], { timeoutMs: this.timeoutMs }),
      git(root, ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/tags'], { timeoutMs: this.timeoutMs }),
      streamNullRecords(root, ['ls-tree', '-rz', '-l', '--full-tree', revision], {
        limit: Math.min(Math.max(Number(treeLimit) || DEFAULT_TREE_LIMIT, 1), 100_000),
        timeoutMs: this.timeoutMs,
      }),
    ]);
    const parseRefs = (output) => output.split('\n').filter(Boolean).map((line) => {
      const [name, sha] = line.split('\t');
      return { name, sha };
    });
    return {
      repository: {
        id: `local_${repositoryToken(root)}`,
        fullName: `local/${basename(root)}`,
        defaultBranch: resolvedBranch,
        visibility: 'private',
        htmlUrl: null,
        provider: 'local_git',
      },
      commits: commitOutput.split('\0').map((item) => item.trim()).filter(Boolean).map(parseCommit),
      workflowRuns: [],
      pullRequests: [],
      repositorySnapshot: {
        headSha,
        branches: parseRefs(branchOutput),
        tags: parseRefs(tagOutput),
        tree: treeResult.records.map(parseTreeEntry).filter(Boolean),
        treeTruncated: treeResult.truncated,
      },
    };
  }
}
