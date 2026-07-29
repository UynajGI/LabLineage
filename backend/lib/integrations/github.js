import { createHmac, timingSafeEqual } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { scopeGraphToProject } from '../project-identity.js';

export class GitHubClient {
  constructor({ token, baseUrl = 'https://api.github.com', fetchImpl = fetch } = {}) {
    if (!token) throw new Error('GitHub token is required');
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async request(pathname, query = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await this.fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'lablineage-guardian'
      },
      signal: AbortSignal.timeout(Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || 15_000))
    });
    if (!response.ok) {
      const requestId = response.headers.get('x-github-request-id');
      throw Object.assign(new Error(`GitHub API ${response.status}${requestId ? ` (${requestId})` : ''}`), {
        statusCode: response.status
      });
    }
    return response.json();
  }

  async collectRepository(owner, repo, { branch, limit = 50 } = {}) {
    const encoded = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const repository = await this.request(`/repos/${encoded}`);
    const resolvedBranch = branch || repository.default_branch;
    const [commits, workflowRuns, pullRequests] = await Promise.all([
      this.request(`/repos/${encoded}/commits`, { sha: resolvedBranch, per_page: Math.min(limit, 100) }),
      this.request(`/repos/${encoded}/actions/runs`, { branch: resolvedBranch, per_page: Math.min(limit, 100) }),
      this.request(`/repos/${encoded}/pulls`, { state: 'all', sort: 'updated', direction: 'desc', per_page: Math.min(limit, 100) })
    ]);
    return {
      repository: {
        id: repository.id,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        visibility: repository.visibility,
        htmlUrl: repository.html_url
      },
      commits: commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        authoredAt: commit.commit.author?.date,
        committedAt: commit.commit.committer?.date,
        authorLogin: commit.author?.login || null,
        htmlUrl: commit.html_url
      })),
      workflowRuns: workflowRuns.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        headSha: run.head_sha,
        runAttempt: run.run_attempt,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        htmlUrl: run.html_url
      })),
      pullRequests: pullRequests.map((pull) => ({
        number: pull.number,
        title: pull.title,
        state: pull.state,
        draft: pull.draft,
        mergedAt: pull.merged_at,
        headSha: pull.head?.sha,
        baseBranch: pull.base?.ref,
        updatedAt: pull.updated_at,
        htmlUrl: pull.html_url
      }))
    };
  }
}

export async function createGitHubClientFromEnv({ fetchImpl = fetch } = {}) {
  if (process.env.GITHUB_TOKEN) return new GitHubClient({ token: process.env.GITHUB_TOKEN, fetchImpl });
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (!appId || !installationId || !privateKeyPem) {
    throw Object.assign(new Error('Configure GITHUB_TOKEN or GitHub App credentials'), { statusCode: 503 });
  }
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .sign(privateKey);
  const response = await fetchImpl(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${jwt}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'lablineage-guardian'
    },
    signal: AbortSignal.timeout(Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || 15_000))
  });
  if (!response.ok) throw Object.assign(new Error(`GitHub App token exchange failed (${response.status})`), { statusCode: response.status });
  const token = await response.json();
  return new GitHubClient({ token: token.token, fetchImpl });
}

export function verifyGitHubWebhook(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const received = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function githubEvidenceToGraph(projectId, evidence) {
  const evidenceRecords = [
    ...evidence.commits.map((commit) => ({
      id: `ev_github_commit_${commit.sha}`,
      projectId,
      evidenceType: 'github_commit',
      source: evidence.repository.fullName,
      capturedAt: new Date().toISOString(),
      payload: commit
    })),
    ...evidence.workflowRuns.map((run) => ({
      id: `ev_github_run_${run.id}_${run.runAttempt}`,
      projectId,
      evidenceType: 'github_workflow_run',
      source: evidence.repository.fullName,
      capturedAt: new Date().toISOString(),
      payload: run
    })),
    ...evidence.pullRequests.map((pull) => ({
      id: `ev_github_pull_${pull.number}_${pull.headSha || 'unknown'}`,
      projectId,
      evidenceType: 'github_pull_request',
      source: evidence.repository.fullName,
      capturedAt: new Date().toISOString(),
      payload: pull
    })),
    ...(evidence.repositorySnapshot ? [{
      id: `ev_repository_snapshot_${evidence.repository.id}_${evidence.repositorySnapshot.headSha}`,
      projectId,
      evidenceType: 'repository_snapshot',
      source: evidence.repository.fullName,
      capturedAt: new Date().toISOString(),
      payload: evidence.repositorySnapshot
    }] : [])
  ];
  const nodes = evidence.commits.map((commit) => ({
    id: `git_${commit.sha}`,
    projectId,
    type: 'CodeVersion',
    label: commit.message.split('\n')[0].slice(0, 100),
    status: 'confirmed',
    details: { sha: commit.sha, committedAt: commit.committedAt, url: commit.htmlUrl },
    evidenceIds: [`ev_github_commit_${commit.sha}`]
  }));
  const edges = [];
  if (evidence.repositorySnapshot) {
    const snapshotEvidenceId = `ev_repository_snapshot_${evidence.repository.id}_${evidence.repositorySnapshot.headSha}`;
    const snapshotId = `repo_snapshot_${evidence.repository.id}_${evidence.repositorySnapshot.headSha}`;
    nodes.push({
      id: snapshotId,
      projectId,
      type: 'RepositorySnapshot',
      label: `${evidence.repository.fullName}@${evidence.repositorySnapshot.headSha.slice(0, 12)}`,
      status: 'confirmed',
      details: {
        provider: evidence.repository.provider || 'github',
        headSha: evidence.repositorySnapshot.headSha,
        branches: evidence.repositorySnapshot.branches.length,
        tags: evidence.repositorySnapshot.tags.length,
        files: evidence.repositorySnapshot.tree.length,
        treeTruncated: evidence.repositorySnapshot.treeTruncated
      },
      evidenceIds: [snapshotEvidenceId]
    });
    edges.push({
      source: `git_${evidence.repositorySnapshot.headSha}`,
      target: snapshotId,
      relation: 'materialized_as',
      confidence: 'exact',
      evidenceIds: [snapshotEvidenceId]
    });
  }
  const ensureCommitNode = (sha, evidenceId) => {
    if (!sha || nodes.some((node) => node.id === `git_${sha}`)) return;
    nodes.push({
      id: `git_${sha}`,
      projectId,
      type: 'CodeVersion',
      label: sha.slice(0, 12),
      status: 'candidate',
      details: { sha },
      evidenceIds: [evidenceId]
    });
  };
  for (const run of evidence.workflowRuns) {
    const runId = `ghrun_${run.id}_${run.runAttempt}`;
    const runEvidenceId = `ev_github_run_${run.id}_${run.runAttempt}`;
    ensureCommitNode(run.headSha, runEvidenceId);
    nodes.push({
      id: runId,
      projectId,
      type: 'Run',
      label: `${run.name} #${run.id}`,
      status: run.conclusion === 'success' ? 'confirmed' : 'candidate',
      details: { status: run.status, conclusion: run.conclusion, url: run.htmlUrl },
      evidenceIds: [runEvidenceId]
    });
    edges.push({
      source: `git_${run.headSha}`,
      target: runId,
      relation: 'triggered',
      confidence: 'exact',
      evidenceIds: [runEvidenceId]
    });
  }
  for (const pull of evidence.pullRequests) {
    const pullEvidenceId = `ev_github_pull_${pull.number}_${pull.headSha || 'unknown'}`;
    const pullId = `ghpr_${pull.number}_${pull.headSha || 'unknown'}`;
    ensureCommitNode(pull.headSha, pullEvidenceId);
    nodes.push({
      id: pullId,
      projectId,
      type: 'PullRequest',
      label: `PR #${pull.number}: ${pull.title}`,
      status: pull.mergedAt ? 'confirmed' : 'candidate',
      details: {
        number: pull.number,
        state: pull.state,
        draft: pull.draft,
        mergedAt: pull.mergedAt,
        baseBranch: pull.baseBranch,
        url: pull.htmlUrl
      },
      evidenceIds: [pullEvidenceId]
    });
    if (pull.headSha) {
      edges.push({
        source: `git_${pull.headSha}`,
        target: pullId,
        relation: 'proposed_in',
        confidence: 'exact',
        evidenceIds: [pullEvidenceId]
      });
    }
  }
  return scopeGraphToProject(projectId, { nodes, edges, evidence: evidenceRecords });
}

export function githubWebhookToGraph(projectId, eventName, payload) {
  const repository = {
    id: payload.repository?.id,
    fullName: payload.repository?.full_name,
    defaultBranch: payload.repository?.default_branch,
    visibility: payload.repository?.visibility,
    htmlUrl: payload.repository?.html_url
  };
  const evidence = { repository, commits: [], workflowRuns: [], pullRequests: [] };
  if (eventName === 'push') {
    evidence.commits = (payload.commits || []).map((commit) => ({
      sha: commit.id,
      message: commit.message || '',
      authoredAt: commit.timestamp,
      committedAt: commit.timestamp,
      authorLogin: commit.author?.username || null,
      htmlUrl: commit.url
    })).filter((commit) => commit.sha);
  } else if (eventName === 'workflow_run' && payload.workflow_run) {
    const run = payload.workflow_run;
    evidence.workflowRuns = [{
      id: run.id,
      name: run.name,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      headSha: run.head_sha,
      runAttempt: run.run_attempt || 1,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url
    }];
  } else if (eventName === 'pull_request' && payload.pull_request) {
    const pull = payload.pull_request;
    evidence.pullRequests = [{
      number: pull.number,
      title: pull.title,
      state: pull.state,
      draft: pull.draft,
      mergedAt: pull.merged_at,
      headSha: pull.head?.sha,
      baseBranch: pull.base?.ref,
      updatedAt: pull.updated_at,
      htmlUrl: pull.html_url
    }];
  }
  return githubEvidenceToGraph(projectId, evidence);
}
