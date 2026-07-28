import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(root, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

export async function detectGit(root) {
  try {
    const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') return null;
    const [commit, branch, status, commitTime] = await Promise.all([
      git(root, ['rev-parse', 'HEAD']),
      git(root, ['branch', '--show-current']),
      git(root, ['status', '--porcelain=v1', '--untracked-files=normal']),
      git(root, ['show', '-s', '--format=%cI', 'HEAD'])
    ]);
    return {
      commit,
      branch: branch || null,
      dirty: status.length > 0,
      changed_entries: status ? status.split(/\r?\n/).length : 0,
      committed_at: commitTime
    };
  } catch {
    return null;
  }
}
