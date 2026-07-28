import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateDeploymentPolicy } from '../lib/deployment-policy.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(backendDir, '..', '..', 'deploy');
const registry = JSON.parse(await readFile(path.join(deployDir, 'agent-registry.json'), 'utf8'));
const gateway = parse(await readFile(path.join(deployDir, 'gateway-policy.yaml'), 'utf8'));
console.log(JSON.stringify({ status: 'valid', ...validateDeploymentPolicy(registry, gateway) }));
