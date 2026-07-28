import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyReleaseEvidence } from '../../scripts/verify-release-evidence.mjs';

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function makeEvidence() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lablineage-release-'));
  const sbom = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [],
  });
  const collector = Buffer.from('collector-package');
  await writeFile(path.join(directory, 'lablineage-guardian.cdx.json'), sbom);
  await writeFile(path.join(directory, 'lablineage-edge-collector-0.3.0.tgz'), collector);
  await writeFile(
    path.join(directory, 'SHA256SUMS'),
    [
      `${digest(sbom)}  lablineage-guardian.cdx.json`,
      `${digest(collector)}  lablineage-edge-collector-0.3.0.tgz`,
      '',
    ].join('\n'),
  );
  return directory;
}

test('release evidence verifier accepts a complete CycloneDX and Collector set', async () => {
  const directory = await makeEvidence();
  try {
    const result = await verifyReleaseEvidence(directory);
    assert.equal(result.status, 'valid');
    assert.equal(result.cyclonedxVersion, '1.6');
    assert.equal(result.artifacts.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('release evidence verifier rejects tampering and unsafe paths', async () => {
  const directory = await makeEvidence();
  try {
    await writeFile(path.join(directory, 'lablineage-edge-collector-0.3.0.tgz'), 'tampered');
    await assert.rejects(() => verifyReleaseEvidence(directory), /checksum mismatch/u);

    await writeFile(
      path.join(directory, 'SHA256SUMS'),
      [
        `${digest(JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] }))}  lablineage-guardian.cdx.json`,
        `${'0'.repeat(64)}  ../lablineage-edge-collector-0.3.0.tgz`,
        '',
      ].join('\n'),
    );
    await assert.rejects(() => verifyReleaseEvidence(directory), /unsafe artifact path/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
