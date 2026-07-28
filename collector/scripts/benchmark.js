import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { collectSnapshot } from '../src/collector.js';

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const fileCount = Number(argument('files', process.env.LABLINEAGE_BENCHMARK_FILES || 1_000));
const batchSize = Number(argument('fixture-batch', process.env.LABLINEAGE_BENCHMARK_FIXTURE_BATCH || 1_000));
const minimumColdRate = Number(argument('min-cold-fps', process.env.LABLINEAGE_BENCHMARK_MIN_COLD_FPS || 0));
const minimumWarmRate = Number(argument('min-warm-fps', process.env.LABLINEAGE_BENCHMARK_MIN_WARM_FPS || 0));
const keepFixture = process.argv.includes('--keep');
if (!Number.isInteger(fileCount) || fileCount < 1 || fileCount > 1_000_000) {
  throw new Error('--files must be an integer between 1 and 1,000,000');
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
  throw new Error('--fixture-batch must be an integer between 1 and 10,000');
}

const root = await mkdtemp(path.join(tmpdir(), 'lablineage-benchmark-'));
try {
  const fixtureStarted = performance.now();
  for (let offset = 0; offset < fileCount; offset += batchSize) {
    const directory = path.join(root, `shard-${String(Math.floor(offset / batchSize)).padStart(6, '0')}`);
    await mkdir(directory);
    const count = Math.min(batchSize, fileCount - offset);
    await Promise.all(Array.from({ length: count }, (_, localIndex) => {
      const index = offset + localIndex;
      return writeFile(
        path.join(directory, `asset-${String(index).padStart(7, '0')}.txt`),
        `asset ${index}\n`,
      );
    }));
  }
  const fixtureMs = performance.now() - fixtureStarted;
  const options = {
    root,
    projectKey: 'benchmark',
    pathSalt: 'benchmark-only-salt',
    maxFiles: fileCount + 1,
    cpuYieldEveryFiles: 100,
  };
  const coldStarted = performance.now();
  const cold = await collectSnapshot(options);
  const coldMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  const warm = await collectSnapshot(options);
  const warmMs = performance.now() - warmStarted;
  const coldFilesPerSecond = Math.round(fileCount / (coldMs / 1000));
  const warmFilesPerSecond = Math.round(fileCount / (warmMs / 1000));
  const result = {
    files: fileCount,
    fixtureMs: Math.round(fixtureMs),
    coldMs: Math.round(coldMs),
    warmMs: Math.round(warmMs),
    coldFilesPerSecond,
    warmFilesPerSecond,
    warmCacheHits: warm.stats.hash_cache_hits,
    allCacheHits: warm.stats.hash_cache_hits === fileCount,
    stableDirectoryFingerprint: cold.directory_fingerprint.value === warm.directory_fingerprint.value,
    schedulerYields: cold.stats.scheduler_yields,
    peakRssBytes: process.memoryUsage.rss,
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    ...(keepFixture ? { fixtureRoot: root } : {}),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.allCacheHits || !result.stableDirectoryFingerprint) process.exitCode = 1;
  if (minimumColdRate && coldFilesPerSecond < minimumColdRate) process.exitCode = 1;
  if (minimumWarmRate && warmFilesPerSecond < minimumWarmRate) process.exitCode = 1;
} finally {
  if (!keepFixture) await rm(root, { recursive: true, force: true });
}
