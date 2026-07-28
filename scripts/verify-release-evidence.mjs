#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function verifyReleaseEvidence(directory = 'artifacts') {
  const evidenceDir = path.resolve(directory);
  const checksumPath = path.join(evidenceDir, 'SHA256SUMS');
  const manifest = await readFile(checksumPath, 'utf8');
  const entries = manifest
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-f0-9]{64}) [ *](.+)$/u.exec(line);
      if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`);
      return { expected: match[1], name: match[2] };
    });

  if (entries.length < 2) throw new Error('expected at least an SBOM and Collector package');
  if (!entries.some(({ name }) => name.endsWith('.cdx.json'))) throw new Error('CycloneDX SBOM is missing');
  if (!entries.some(({ name }) => name.endsWith('.tgz'))) throw new Error('Collector package is missing');

  for (const entry of entries) {
    if (entry.name !== path.basename(entry.name)) {
      throw new Error(`unsafe artifact path: ${entry.name}`);
    }
    const filePath = path.join(evidenceDir, entry.name);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error(`artifact is not a regular file: ${entry.name}`);
    const actual = await sha256(filePath);
    if (actual !== entry.expected) throw new Error(`checksum mismatch: ${entry.name}`);
  }

  const sbomEntry = entries.find(({ name }) => name.endsWith('.cdx.json'));
  const sbom = JSON.parse(await readFile(path.join(evidenceDir, sbomEntry.name), 'utf8'));
  if (sbom.bomFormat !== 'CycloneDX' || typeof sbom.specVersion !== 'string') {
    throw new Error('SBOM is not a valid CycloneDX document');
  }

  return {
    status: 'valid',
    evidenceDir,
    artifacts: entries.map(({ name }) => name),
    cyclonedxVersion: sbom.specVersion,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    console.log(JSON.stringify(await verifyReleaseEvidence(process.argv[2])));
  } catch (error) {
    console.error(`Release evidence verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
