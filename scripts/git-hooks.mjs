#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mode = process.argv[2] || 'full';

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function nullList(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function stagedFiles() {
  return nullList(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { encoding: 'buffer' }));
}

function trackedFiles() {
  return nullList(git(['ls-files', '-z'], { encoding: 'buffer' }));
}

const forbiddenPathPatterns = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)\.lablineage(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)(dist|coverage|playwright-report|test-results|output)(\/|$)/i,
  /\.(pem|key|p12|pfx|jks)$/i,
  /\.tfstate(\.|$)/i,
];

const secretPatterns = [
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'Google AI Studio key', pattern: /\bAQ\.[0-9A-Za-z_-]{20,}\b/g },
  { name: 'GitHub token', pattern: /\b(?:ghp|github_pat)_[0-9A-Za-z_]{20,}\b/g },
  { name: 'Slack token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'cloud service-account key', pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE\s+KEY-----/g },
];

function inspectFiles(files) {
  const violations = [];
  for (const relativePath of files) {
    const normalized = relativePath.replaceAll('\\', '/');
    const isExample = normalized === '.env.example' || normalized.endsWith('/.env.example');
    if (!isExample && forbiddenPathPatterns.some((pattern) => pattern.test(normalized))) {
      violations.push(`${normalized}: forbidden generated, credential, or private-state path`);
      continue;
    }
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) continue;
    const body = readFileSync(absolutePath);
    if (body.length > 2 * 1024 * 1024 || body.includes(0)) continue;
    const text = body.toString('utf8');
    for (const rule of secretPatterns) {
      if (isExample && ['private key', 'cloud service-account key'].includes(rule.name)) continue;
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) violations.push(`${normalized}: possible ${rule.name}`);
    }
  }
  if (violations.length) {
    console.error('Git hook checks blocked this operation:\n');
    for (const violation of violations) console.error(`- ${violation}`);
    console.error('\nRemove the material from Git and rotate any real credential before continuing.');
    process.exit(1);
  }
}

function runNode(label, args, cwd = root) {
  console.log(`\nGit hook: ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, LABLINEAGE_GIT_HOOK: mode },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function backendScript(name) {
  runNode(`backend ${name}`, [`scripts/${name}.js`], path.join(root, 'backend'));
}

function runFullSuite({ e2e = false } = {}) {
  runNode('backend tests', ['--test', '--test-concurrency=1'], path.join(root, 'backend'));
  runNode('Collector tests', ['--test'], path.join(root, 'collector'));
  runNode('frontend typecheck', [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], path.join(root, 'frontend'));
  runNode('frontend production build', [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], path.join(root, 'frontend'));
  backendScript('eval-agent');
  backendScript('validate-deployment');
  backendScript('validate-openapi');
  backendScript('validate-migrations');
  backendScript('validate-idempotency');
  runNode('GitHub workflow policy', ['scripts/validate-workflows.mjs']);
  runNode('Collector benchmark gate', [
    'scripts/benchmark.js',
    '--files',
    '5000',
    '--min-cold-fps',
    '50',
    '--min-warm-fps',
    '250',
  ], path.join(root, 'collector'));
  if (e2e) {
    runNode('browser E2E and accessibility', [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test']);
  }
}

function validateCommitMessage(messageFile) {
  const text = readFileSync(messageFile, 'utf8').trim();
  if (/^(Merge|Revert\b)/.test(text)) return;
  const subject = text.split(/\r?\n/, 1)[0];
  const conventional = /^(feat|fix|docs|test|refactor|perf|build|ci|chore)(\([a-z0-9._/-]+\))?!?: .{1,100}$/;
  if (!conventional.test(subject)) {
    console.error('Commit subject must follow Conventional Commits, for example:');
    console.error('  feat(collector): add bounded large-directory scanning');
    process.exit(1);
  }
  if (subject.length > 100) {
    console.error('Commit subject must be 100 characters or fewer.');
    process.exit(1);
  }
}

function recordCommit() {
  const gitDir = git(['rev-parse', '--git-dir']).trim();
  const sha = git(['rev-parse', 'HEAD']).trim();
  const subject = git(['show', '-s', '--format=%s', 'HEAD']).trim();
  const branch = git(['branch', '--show-current']).trim();
  const record = {
    sha,
    branch,
    subject,
    recordedAt: new Date().toISOString(),
    integrity: createHash('sha256').update(`${sha}\n${branch}\n${subject}`).digest('hex'),
  };
  writeFileSync(path.resolve(root, gitDir, 'lablineage-last-commit.json'), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Recorded ${sha.slice(0, 12)} (${subject})`);
}

if (mode === 'pre-commit') {
  const files = stagedFiles();
  inspectFiles(files);
  if (files.some((file) => file.startsWith('backend/') || file.startsWith('scripts/'))) {
    backendScript('validate-openapi');
    backendScript('validate-migrations');
    backendScript('validate-idempotency');
  }
  if (files.some((file) => file.startsWith('.github/workflows/') || file === 'package.json')) {
    runNode('GitHub workflow policy', ['scripts/validate-workflows.mjs']);
  }
  if (files.some((file) => file.startsWith('frontend/') || file === 'playwright.config.ts')) {
    runNode('frontend typecheck', [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], path.join(root, 'frontend'));
  }
  if (files.some((file) => file.startsWith('collector/'))) {
    runNode('Collector tests', ['--test'], path.join(root, 'collector'));
  }
  process.exit(0);
}

if (mode === 'commit-msg') {
  validateCommitMessage(process.argv[3]);
  process.exit(0);
}

if (mode === 'post-commit') {
  recordCommit();
  process.exit(0);
}

if (mode === 'pre-push' || mode === 'full') {
  inspectFiles(trackedFiles());
  runFullSuite({ e2e: mode === 'pre-push' });
  process.exit(0);
}

console.error(`Unknown Git hook mode: ${mode}`);
process.exit(2);
