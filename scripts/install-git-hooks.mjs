#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  }).trim();
}

git(['rev-parse', '--git-dir']);
git(['config', '--local', 'core.hooksPath', '.githooks']);
try {
  git(['config', '--local', '--unset', 'alias.cgs']);
} catch {
  // The mistaken legacy alias may not exist.
}
console.log('Installed pre-commit, pre-push, commit-msg, and post-commit hooks at .githooks.');
