#!/usr/bin/env node
/**
 * Messy-project benchmark: runs the real scan → snapshot → diff → audit
 * pipeline against three synthetic but realistic research directories.
 *
 * Projects:
 *   alpha  deadline-rush  — uncommitted leftovers, duplicate figures, junk,
 *                           secret files, oversized binary, broken symlink
 *   beta   postdoc-handoff— orphan output, dirty working tree, missing run
 *   gamma  repro-baseline — tidy, controlled rerun recorded (R4 target)
 *
 * Output: output/benchmark/report.json + report.md (git-ignored).
 * Run: npm run benchmark:messy --workspace backend
 */
import { mkdir, rm, writeFile, rename, unlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { scanDirectory, diffSnapshots, archiveSnapshotIndex, materializeSnapshotIndex } from '../lib/scanner.js';
import { createAudit } from '../lib/audit.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outRoot = path.join(repoRoot, 'output', 'benchmark');
const projectsRoot = path.join(outRoot, 'projects');

/* ---------- deterministic randomness ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x4C4142); // 'LAB'
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

/* ---------- helpers ---------- */
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build']);
const SECRET_PATTERNS = [/^\.env(?:\.|$)/i, /(?:^|[._-])(secret|credential|private[-_]?key)(?:[._-]|$)/i, /\.(?:pem|p12|pfx|key)$/i];

function classify(rel) {
  const segments = rel.split('/');
  if (segments.some((s) => EXCLUDED_DIRS.has(s))) return 'excluded';
  if (SECRET_PATTERNS.some((re) => re.test(rel))) return 'secret';
  return 'normal';
}

async function writeTree(root, files) {
  const stats = { total: 0, excluded: 0, secret: 0, normal: 0 };
  for (const file of files) {
    const rel = file.rel;
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    if (file.symlinkTarget) {
      await symlink(file.symlinkTarget, abs).catch(() => {});
      continue; // symlinks are skipped by the scanner; never counted
    }
    const bucket = classify(rel);
    stats[bucket] += 1;
    stats.total += 1;
    await writeFile(abs, file.content);
  }
  return stats;
}

function node(id, type, label, extra = {}) {
  return { id, type, label, status: extra.status || 'accepted', ...extra };
}
function edge(source, target, relation, confidence, evidenceIds) {
  return { source, target, relation, confidence, evidenceIds };
}

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(200).fill(7)]);
const CSV = (rows, cols) => {
  const head = Array.from({ length: cols }, (_, c) => `col_${c}`).join(',');
  const body = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rng() * 1000).toFixed(2)).join(',')).join('\n');
  return `${head}\n${body}\n`;
};

/* ---------- project specs ---------- */
const projects = {
  alpha: {
    label: 'alpha · deadline-rush（赶死线遗留型）',
    files: [
      { rel: 'README_draft.md', content: '# Draft\nTODO: fill in methods.\n' },
      { rel: 'analysis.py', content: 'import numpy as np\ndef fit(x):\n    return np.polyfit(x, x, 1)\n' },
      { rel: 'plot.py', content: 'import matplotlib.pyplot as plt\nplt.savefig("fig1.png")\n' },
      { rel: 'analysis_old_v2.py', content: 'print("old leftover script")\n' },
      { rel: 'data/raw.csv', content: CSV(200, 5) },
      { rel: 'data/processed.csv', content: CSV(150, 6) },
      { rel: 'params_v1.json', content: JSON.stringify({ lr: 0.1, epochs: 100 }) },
      { rel: 'params_v2.json', content: JSON.stringify({ lr: 0.01, epochs: 500 }) },
      { rel: 'fig1.png', content: PNG },
      { rel: 'fig1_draft.png', content: PNG }, // identical bytes -> duplicate hash pair
      { rel: 'scratch/notes_tmp.md', content: 'random scratch note\n' },
      { rel: 'scratch/tmp_plot.py', content: 'plt.savefig("tmp.png")\n' },
      { rel: 'results/junk.bin', content: Buffer.alloc(60 * 1024 * 1024, 0xAB) }, // >50MB -> sampled
      { rel: '.env', content: 'FAKE_TOKEN=benchmark-only-value\n' }, // secret, skipped
      { rel: 'backup_credential.txt', content: 'FAKE_CRED=benchmark-only\n' }, // secret, skipped
      { rel: 'certs/cert.pem', content: '-----BEGIN CERTIFICATE-----\nFAKE\n' }, // secret, skipped
      { rel: '.venv/lib/python3.12/site-packages/pkg/__init__.py', content: '' }, // excluded dir
      { rel: 'node_modules/dep/index.js', content: '' }, // excluded dir
      { rel: '__pycache__/analysis.cpython-312.pyc', content: Buffer.from([1, 2, 3]) }, // excluded dir
      { rel: '.git/HEAD', content: 'ref: refs/heads/main\n' }, // excluded dir
      { rel: 'data/archive_link', symlinkTarget: '../../does-not-exist' }, // broken symlink, skipped
    ],
    graph: {
      nodes: [
        node('a_fig', 'Figure', 'fig1.png', { evidenceIds: ['ev_fig1'] }),
        node('a_draft', 'Figure', 'fig1_draft.png', { status: 'candidate', evidenceIds: ['ev_fig1'] }), // same hash evidence
        node('a_orphan', 'Figure', 'orphan_plot.png', { evidenceIds: ['ev_orphan'] }), // no producing run
      ],
      edges: [
        edge('a_fig', 'a_orphan', 'supports', 'inferred', ['ev_orphan']),
      ],
    },
    expectation: { figure: 'a_fig', level: 'R0' }, // figure-only: 10 points, no lineage evidence weight
  },

  beta: {
    label: 'beta · postdoc-handoff（交接遗留型）',
    files: [
      { rel: 'scripts/clean.py', content: 'def clean(df): return df.dropna()\n' },
      { rel: 'scripts/fit.py', content: 'def fit(df): return df.mean()\n' },
      { rel: 'scripts/render.R', content: 'library(ggplot2)\n' },
      { rel: 'outputs/fig2.png', content: PNG },
      { rel: 'outputs/table1.csv', content: CSV(80, 4) },
      { rel: 'outputs/orphan_plot.png', content: Buffer.from(PNG.subarray(0, 100)) }, // orphan: no producer
      { rel: 'data/measurements.csv.gz', content: gzipSync(CSV(300, 8)) },
      { rel: 'data/calibration.csv', content: CSV(40, 3) },
      { rel: 'params/final.json', content: JSON.stringify({ seed: 42 }) },
      { rel: 'environment/requirements-lock.txt', content: 'numpy==2.0.0\n' },
      { rel: 'docs/README.md', content: '# Handoff notes\nWhat happened here?\n' },
      { rel: 'docs/notes_2024.md', content: 'uncommitted meeting notes\n' },
      { rel: 'Makefile', content: 'all: fit\nfit:\n\tpython scripts/fit.py\n' },
      { rel: 'LICENSE', content: 'MIT\n' },
      { rel: '.DS_Store', content: Buffer.from([0, 1, 0, 1]) },
      { rel: '.git/objects/ab/1234567890abcdef', content: '' }, // excluded dir
    ],
    graph: {
      nodes: [
        node('b_fig', 'Figure', 'fig2.png', { evidenceIds: ['ev_fig2'] }),
        node('b_orphan', 'Figure', 'orphan_plot.png', { evidenceIds: ['ev_orphan2'] }),
        node('b_data', 'Dataset', 'measurements.csv.gz', { evidenceIds: ['ev_data2'] }),
        node('b_params', 'ParameterSet', 'final.json', { evidenceIds: ['ev_params2'] }),
      ],
      edges: [
        edge('b_data', 'b_fig', 'used_input', 'exact', ['ev_data2']),
        edge('b_params', 'b_fig', 'used_parameter_set', 'exact', ['ev_params2']),
      ],
    },
    expectation: { figure: 'b_fig', level: 'R2' }, // dataset+params+figure+lineage: 15+15+10+10 = 50
  },

  gamma: {
    label: 'gamma · repro-baseline（可复现对照）',
    files: [
      { rel: 'src/analyze.py', content: 'def analyze(df): return df\n' },
      { rel: 'src/plot.py', content: 'plt.savefig("fig3.png")\n' },
      { rel: 'data/input.csv', content: CSV(120, 4) },
      { rel: 'params/tuned.json', content: JSON.stringify({ alpha: 0.5 }) },
      { rel: 'env/requirements-lock.txt', content: 'numpy==2.0.0\npandas==2.2.0\n' },
      { rel: 'runs/run_017/log.txt', content: 'exit 0\n' },
      { rel: 'runs/run_017/rerun_verified.json', content: JSON.stringify({ status: 'verified', hashMatch: true }) },
      { rel: 'outputs/fig3.png', content: PNG },
      { rel: 'Makefile', content: 'repro:\n\tpython src/analyze.py\n' },
      { rel: 'README.md', content: '# Reproducible study\nSee Makefile.\n' },
      { rel: '.gitignore', content: '__pycache__/\n' },
      { rel: '.git/HEAD', content: 'ref: refs/heads/main\n' },
    ],
    graph: {
      nodes: [
        node('g_code', 'CodeVersion', 'src/analyze.py @ a1b2c3', { evidenceIds: ['ev_code'] }),
        node('g_data', 'Dataset', 'data/input.csv', { evidenceIds: ['ev_data'] }),
        node('g_params', 'ParameterSet', 'params/tuned.json', { evidenceIds: ['ev_params'] }),
        node('g_env', 'Environment', 'env/requirements-lock.txt', { evidenceIds: ['ev_env'] }),
        node('g_run', 'Run', 'runs/run_017', {
          details: { exitCode: '0', executionMode: 'controlled-rerun', verificationStatus: 'verified', captureQuality: 'exact' },
          evidenceIds: ['ev_runlog', 'ev_rerun'],
        }),
        node('g_fig', 'Figure', 'fig3.png', { details: { rerunHashMatch: 'true' }, evidenceIds: ['ev_fighash'] }),
      ],
      edges: [
        edge('g_code', 'g_run', 'executed_as', 'exact', ['ev_code']),
        edge('g_data', 'g_run', 'used_input', 'exact', ['ev_data']),
        edge('g_params', 'g_run', 'used_parameter_set', 'exact', ['ev_params']),
        edge('g_env', 'g_run', 'used_environment', 'exact', ['ev_env']),
        edge('g_run', 'g_fig', 'generated', 'exact', ['ev_fighash']),
      ],
    },
    expectation: { figure: 'g_fig', level: 'R4' }, // full trace + verified controlled rerun
  },
};

/* ---------- benchmark phases ---------- */
const results = {};
const timing = {};

async function scanPhase(projDir, spec) {
  const phase = {};
  let t0 = performance.now();
  const scan1 = await scanDirectory(projDir, { allowedRoot: projectsRoot, includeTextContent: false });
  phase.scanMs = Math.round((performance.now() - t0) * 10) / 10;

  const kinds = {};
  for (const file of scan1.files) kinds[file.kind] = (kinds[file.kind] || 0) + 1;
  phase.scanned = {
    fileCount: scan1.fileCount,
    totalBytes: scan1.files.reduce((sum, f) => sum + f.sizeBytes, 0),
    kinds,
    warnings: scan1.warnings,
    rootHash: scan1.directoryRootHash.slice(0, 24),
  };

  const expectedScanned = spec.stats.total - spec.stats.secret - spec.stats.excluded;
  phase.correctness = {
    expectedScanned,
    scannedCount: scan1.fileCount,
    secretSkipped: spec.stats.secret,
    excludedDirFiles: spec.stats.excluded,
    match: scan1.fileCount === expectedScanned,
  };

  // retention roundtrip
  t0 = performance.now();
  const archived = archiveSnapshotIndex({ ...scan1 });
  const materialized = materializeSnapshotIndex(archived);
  phase.archiveMs = Math.round((performance.now() - t0) * 10) / 10;
  phase.retention = {
    archiveBytes: archived.compressedIndex.compressedBytes,
    originalBytes: archived.compressedIndex.originalBytes,
    roundtripFiles: materialized.files.length,
    match: materialized.files.length === scan1.fileCount,
  };

  // mutations -> second scan -> diff
  const renames = spec.renames ?? [];
  for (const { from, to } of renames) {
    const target = path.join(projDir, to);
    await mkdir(path.dirname(target), { recursive: true });
    await rename(path.join(projDir, from), target).catch(() => {});
  }
  const modify = spec.modify ?? [];
  for (const rel of modify) {
    const abs = path.join(projDir, rel);
    await writeFile(abs, `# mutated ${Date.now()}\n`, { flag: 'a' }).catch(() => {});
  }
  await writeFile(path.join(projDir, 'added_note.md'), 'brand new file\n');
  await unlink(path.join(projDir, spec.delete)).catch(() => {});

  t0 = performance.now();
  const scan2 = await scanDirectory(projDir, { allowedRoot: projectsRoot, includeTextContent: false });
  const diff = diffSnapshots(scan1, scan2);
  phase.diffMs = Math.round((performance.now() - t0) * 10) / 10;

  const byType = {};
  for (const change of diff) byType[change.type] = (byType[change.type] || 0) + 1;
  const moved = diff.find((change) => change.type === 'moved');
  phase.diff = {
    byType,
    moveCandidate: moved
      ? { path: moved.path, inference: moved.inference?.status === 'inferred', kind: moved.inference?.kind, confidence: moved.inference?.confidence }
      : null,
    match: byType.moved === 1 && byType.modified === 1 && byType.added === 1 && byType.deleted === 1,
  };
  return phase;
}

async function auditPhase(spec) {
  const t0 = performance.now();
  const audit = createAudit('bench-' + spec.key, spec.graph.nodes, spec.graph.edges);
  const auditMs = Math.round((performance.now() - t0) * 10) / 10;
  return {
    auditMs,
    expectedLevel: spec.expectation.level,
    actualLevel: audit.level,
    score: audit.score,
    missing: audit.missing,
    verifiedRerun: audit.verifiedRerun,
    findings: (audit.findings || []).map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
    findingCount: (audit.findings || []).length,
  };
}

/* ---------- main ---------- */
await rm(outRoot, { recursive: true, force: true });
await mkdir(projectsRoot, { recursive: true });

for (const [key, spec] of Object.entries(projects)) {
  const dir = path.join(projectsRoot, key);
  spec.key = key;
  spec.stats = await writeTree(dir, spec.files);
  if (key === 'alpha') spec.modify = ['analysis.py'];
  if (key === 'beta') spec.modify = ['scripts/fit.py'];
  if (key === 'gamma') spec.modify = ['src/analyze.py'];
  spec.delete = key === 'alpha' ? 'data/raw.csv' : key === 'beta' ? 'data/calibration.csv' : 'data/input.csv';
  if (key === 'alpha') spec.renames = [{ from: 'fig1.png', to: 'figs_final/fig1.png' }];
  if (key === 'beta') spec.renames = [{ from: 'outputs/fig2.png', to: 'outputs/renamed/fig2.png' }];
  if (key === 'gamma') spec.renames = [{ from: 'outputs/fig3.png', to: 'outputs/renamed/fig3.png' }];
  timing[key] = {};
  results[key] = {
    label: spec.label,
    generated: spec.stats,
    scan: await scanPhase(dir, spec),
    audit: await auditPhase(spec),
  };
}

// cross-project audit ordering: gamma R4 > beta R2 > alpha R0
const levels = ['R0', 'R1', 'R2', 'R3', 'R4'];
const auditOrderOk = levels.indexOf(results.gamma.audit.actualLevel) > levels.indexOf(results.beta.audit.actualLevel)
  && levels.indexOf(results.beta.audit.actualLevel) > levels.indexOf(results.alpha.audit.actualLevel);

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  projects: results,
  verdicts: {
    scanCountMatch: Object.values(results).every((r) => r.scan.correctness.match),
    retentionRoundtrip: Object.values(results).every((r) => r.scan.retention.match),
    diffMoveCandidate: Object.values(results).every((r) => r.scan.diff.moveCandidate?.kind === 'move_candidate'),
    diffShape: Object.values(results).every((r) => r.scan.diff.match),
    auditOrder: auditOrderOk,
  },
};

await writeFile(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2));

/* ---------- markdown report ---------- */
const md = [];
md.push('# LabLineage Guardian · 杂乱项目全链路 Benchmark\n');
md.push(`生成时间 ${report.generatedAt} · Node ${report.node} · ${report.platform}\n`);
md.push(`目录：\`output/benchmark/projects/{alpha,beta,gamma}\`（生成后可复现，PRNG 固定种子）\n`);
md.push('\n## 1. 扫描与快照（scanDirectory）\n');
md.push('| 项目 | 生成文件 | secret 跳过 | 排除目录跳过 | 实际扫描 | 一致性 | 扫描耗时 | 索引压缩 | 归档往返 |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const [key, r] of Object.entries(results)) {
  md.push(`| ${r.label} | ${r.scan.correctness.expectedScanned + r.scan.correctness.secretSkipped + r.scan.correctness.excludedDirFiles} | ${r.scan.correctness.secretSkipped} | ${r.scan.correctness.excludedDirFiles} | ${r.scan.scanned.fileCount} | ${r.scan.correctness.match ? '✅' : '❌'} | ${r.scan.scanMs}ms | ${r.scan.retention.archiveBytes}/${r.scan.retention.originalBytes}B | ${r.scan.retention.match ? '✅' : '❌'} |`);
}
md.push('\n## 2. 变更检测（diffSnapshots，一次改名+改文件+新增+删除）\n');
md.push('| 项目 | 变更分布 | move candidate | 形状正确 | 耗时 |');
md.push('|---|---|---|---|---|');
for (const [key, r] of Object.entries(results)) {
  const types = Object.entries(r.scan.diff.byType).map(([t, n]) => `${t}:${n}`).join(', ');
  const mc = r.scan.diff.moveCandidate;
  md.push(`| ${key} | ${types} | ${mc ? `\`${mc.path}\` · ${mc.kind} · ${mc.inference ? 'inferred' : '?'}(${mc.confidence})` : '—'} | ${r.scan.diff.match ? '✅' : '❌'} | ${r.scan.diffMs}ms |`);
}
md.push('\n> move candidate 语义：改名文件只报一条 `moved` 变更（inference.status=inferred, kind=move_candidate），不会把移动拆成 delete+add 两个"事实"。\n');
md.push('\n## 3. 复现审计（createAudit）\n');
md.push('| 项目 | 期望 R 级 | 实际 R 级 | Findings | 耗时 |');
md.push('|---|---|---|---|---|');
for (const [key, r] of Object.entries(results)) {
  const findings = r.audit.findings.map((f) => `${f.type}(${f.severity})`).join(', ') || '—';
  md.push(`| ${r.label} | ${r.audit.expectedLevel} | **${r.audit.actualLevel}** | ${findings} | ${r.audit.auditMs}ms |`);
}
md.push('\n## 4. 判定\n');
md.push(`- 扫描数量与跳过规则一致：${report.verdicts.scanCountMatch ? '✅' : '❌'}`);
md.push(`- 快照压缩归档往返无损：${report.verdicts.retentionRoundtrip ? '✅' : '❌'}`);
md.push(`- 改名识别为 move candidate：${report.verdicts.diffMoveCandidate ? '✅' : '❌'}`);
md.push(`- diff 变更形状（1 moved / 1 modified / 1 added / 1 deleted）：${report.verdicts.diffShape ? '✅' : '❌'}`);
md.push(`- R 级排序 gamma(R4) > beta(R2) > alpha(R0)：${report.verdicts.auditOrder ? '✅' : '❌'}`);

await writeFile(path.join(outRoot, 'report.md'), md.join('\n'));

/* ---------- console ---------- */
console.log('=== LabLineage Guardian 杂乱项目 Benchmark ===');
for (const [key, r] of Object.entries(results)) {
  console.log(`\n[${key}] ${r.label}`);
  console.log(`  scan: ${r.scan.scanned.fileCount} files / ${(r.scan.scanned.totalBytes / 1048576).toFixed(1)}MB in ${r.scan.scanMs}ms · skipped secret=${r.scan.correctness.secretSkipped} excluded=${r.scan.correctness.excludedDirFiles} ${r.scan.correctness.match ? '✅' : '❌'}`);
  console.log(`  diff: ${JSON.stringify(r.scan.diff.byType)} ${r.scan.diff.match ? '✅' : '❌'} · move=${r.scan.diff.moveCandidate?.kind}`);
  console.log(`  audit: expected ${r.audit.expectedLevel} → actual ${r.audit.actualLevel} · findings=${r.audit.findings.map((f) => f.type).join(',') || 'none'}`);
}
console.log(`\nverdicts: ${JSON.stringify(report.verdicts)}`);
console.log(`report: ${path.join(outRoot, 'report.md')}`);
