#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const workflowDir = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
const files = (await readdir(workflowDir)).filter((name) => /\.ya?ml$/i.test(name)).sort();
const errors = [];
let actionReferences = 0;

function walk(value, file, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, file, [...trail, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'uses' && typeof item === 'string') {
      actionReferences += 1;
      if (!/^[^@\s]+@[0-9a-f]{40}$/.test(item)) {
        errors.push(`${file}:${[...trail, key].join('.')}: action must use a full 40-character commit SHA (${item})`);
      }
    }
    walk(item, file, [...trail, key]);
  }
}

for (const file of files) {
  const source = await readFile(path.join(workflowDir, file), 'utf8');
  let document;
  try {
    document = YAML.parse(source);
  } catch (error) {
    errors.push(`${file}: invalid YAML (${error.message})`);
    continue;
  }
  if (document?.on?.pull_request_target) {
    errors.push(`${file}: pull_request_target is prohibited`);
  }
  const rootPermissions = document?.permissions || {};
  for (const [permission, level] of Object.entries(rootPermissions)) {
    if (level === 'write') errors.push(`${file}: root permission ${permission}: write is prohibited`);
  }
  walk(document, file);
}

if (!files.length) errors.push('No GitHub Actions workflows found');
if (!actionReferences) errors.push('No third-party action references found');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'valid', workflows: files.length, immutableActionReferences: actionReferences }));
