import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { LocalGitClient } from '../lib/integrations/local-git.js';
import { githubEvidenceToGraph } from '../lib/integrations/github.js';

const execFileAsync = promisify(execFile);

async function git(root, ...args) {
  await execFileAsync('git', ['-C', root, ...args], { windowsHide: true });
}

test('local Git provider collects bounded path-safe repository evidence', async () => {
  const allowedRoot = await mkdtemp(path.join(tmpdir(), 'lablineage-local-git-'));
  const repository = path.join(allowedRoot, 'experiment');
  await mkdir(repository);
  try {
    await git(repository, 'init', '--initial-branch=main');
    await git(repository, 'config', 'user.name', 'LabLineage Test');
    await git(repository, 'config', 'user.email', 'lablineage@example.invalid');
    await writeFile(path.join(repository, 'analysis.py'), 'print("science")\n');
    await writeFile(path.join(repository, 'result.tsv'), 'value\n42\n');
    await git(repository, 'add', 'analysis.py', 'result.tsv');
    await git(repository, 'commit', '-m', 'capture experiment');
    await git(repository, 'tag', 'v0.1.0');

    const evidence = await new LocalGitClient({ allowedRoots: [allowedRoot] })
      .collectRepository(repository, { limit: 10, treeLimit: 1 });

    assert.equal(evidence.repository.provider, 'local_git');
    assert.equal(evidence.repository.fullName, 'local/experiment');
    assert.equal(evidence.commits.length, 1);
    assert.equal(evidence.repositorySnapshot.tree.length, 1);
    assert.equal(evidence.repositorySnapshot.treeTruncated, true);
    assert.equal('path' in evidence.repositorySnapshot.tree[0], false);
    assert.match(evidence.repositorySnapshot.tree[0].pathToken, /^[0-9a-f]{64}$/);
    assert.equal(evidence.repositorySnapshot.tags[0].name, 'v0.1.0');

    const graph = githubEvidenceToGraph('project_test', evidence);
    assert.ok(graph.nodes.some((node) => node.type === 'RepositorySnapshot'));
    assert.ok(graph.evidence.some((item) => item.evidenceType === 'repository_snapshot'));
    assert.ok(graph.edges.some((edge) => edge.relation === 'materialized_as'));
  } finally {
    await rm(allowedRoot, { recursive: true, force: true });
  }
});

test('local Git provider rejects repositories outside configured roots', async () => {
  const allowedRoot = await mkdtemp(path.join(tmpdir(), 'lablineage-local-git-allowed-'));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), 'lablineage-local-git-outside-'));
  try {
    await assert.rejects(
      () => new LocalGitClient({ allowedRoots: [allowedRoot] }).collectRepository(outsideRoot),
      (error) => error.statusCode === 403
    );
  } finally {
    await Promise.all([
      rm(allowedRoot, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true })
    ]);
  }
});
