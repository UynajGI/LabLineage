import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { validateDeploymentPolicy } from '../lib/deployment-policy.js';

const deployDir = path.resolve(import.meta.dirname, '..', '..', 'deploy');

test('registry and gateway enforce read-only Agent tools and guarded writes', async () => {
  const registry = JSON.parse(await readFile(path.join(deployDir, 'agent-registry.json'), 'utf8'));
  const gateway = parse(await readFile(path.join(deployDir, 'gateway-policy.yaml'), 'utf8'));
  const result = validateDeploymentPolicy(registry, gateway);
  assert.equal(result.denyByDefault, true);
  assert.equal(result.agents, 4);
  assert.equal(result.tools, 7);

  const unsafe = structuredClone(registry);
  unsafe.agents[1].tools[0].mode = 'write';
  assert.throws(() => validateDeploymentPolicy(unsafe, gateway));
});
