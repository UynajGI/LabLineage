import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(backendDir, '..', '..', process.env.LABLINEAGE_DATA_DIR || '.lablineage');

function iso(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString();
}

export function stableEdgeId(edge) {
  const identity = [
    edge.source,
    edge.target,
    edge.relation,
    ...(edge.evidenceIds || [])
  ].join('\0');
  return `edge_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

export function makeDemoState() {
  const projectId = 'project_phase_transition';
  const nodes = [
    { id: projectId, type: 'Project', label: 'Phase Transition Study', status: 'accepted', humanConfirmed: true, evidenceIds: ['ev_project'] },
    { id: 'code_42f8', type: 'CodeVersion', label: 'analysis@42f8c1d', status: 'accepted', details: { commit: '42f8c1d', dirty: 'false' }, evidenceIds: ['ev_git_42f8'] },
    { id: 'dataset_raw_01', type: 'Dataset', label: 'measurements-v3.parquet', status: 'accepted', details: { hash: 'sha256:9c4b…', rows: '128400' }, evidenceIds: ['ev_dataset_hash'] },
    { id: 'params_paper', type: 'ParameterSet', label: 'configs/paper.yaml', status: 'accepted', evidenceIds: ['ev_params'] },
    { id: 'env_lock', type: 'Environment', label: 'uv.lock', status: 'accepted', evidenceIds: ['ev_env_lock'] },
    { id: 'run_plot_019', type: 'Run', label: 'plot_phase.py #019', status: 'accepted', details: { exitCode: '0', captureQuality: 'exact' }, evidenceIds: ['ev_run_log'] },
    { id: 'figure_3', type: 'Figure', label: 'fig3.png', status: 'accepted', reproducibility: 'R3', evidenceIds: ['ev_figure_hash'] },
    { id: 'conclusion_critical', type: 'Conclusion', label: 'Critical exponent conclusion', status: 'candidate', evidenceIds: ['ev_notebook_ref'] },
    { id: 'figure_old', type: 'Figure', label: 'fig3-draft.png', status: 'duplicate', reproducibility: 'R1', evidenceIds: ['ev_duplicate_hash'] }
  ];
  for (const node of nodes) node.projectId = projectId;
  const edges = [
    ['code_42f8', 'run_plot_019', 'executed_as', 'exact', 'ev_run_log'],
    ['dataset_raw_01', 'run_plot_019', 'used_input', 'exact', 'ev_run_log'],
    ['params_paper', 'run_plot_019', 'used_parameter_set', 'exact', 'ev_params'],
    ['env_lock', 'run_plot_019', 'used_environment', 'strong', 'ev_env_lock'],
    ['run_plot_019', 'figure_3', 'generated', 'exact', 'ev_figure_hash'],
    ['figure_3', 'conclusion_critical', 'supports', 'inferred', 'ev_notebook_ref']
  ].map(([source, target, relation, confidence, evidence]) => ({
    source, target, relation, confidence, evidenceIds: [evidence]
  }));
  const findings = [
    {
      id: 'finding_duplicate_draft',
      type: 'duplicate',
      severity: 'P2',
      title: '发现内容重复的旧版图',
      description: 'fig3-draft.png 与已采用结果内容哈希相同，但缺少明确的 superseded 标记。',
      affectedEntities: ['figure_old', 'figure_3'],
      proposedAction: '人工确认后标记旧版为 superseded；系统不会自动删除。',
      status: 'open',
      evidenceIds: ['ev_duplicate_hash']
    }
  ];
  return {
    schemaVersion: 1,
    setupConfig: {
      institutionName: 'Demo University',
      labName: 'Complex Systems Lab',
      adminDisplayName: 'Lab Admin',
      adminEmail: 'admin@example.edu',
      dataResidency: 'local',
      defaultRegion: 'asia-east1',
      defaultTimezone: 'Asia/Shanghai',
      notificationLanguage: 'zh-CN',
      defaultProjectName: 'Phase Transition Study',
      defaultProjectSlug: 'phase-transition',
      departingMemberEmail: 'departing@example.edu',
      receivingMemberEmail: 'receiver@example.edu',
      reviewerEmail: 'reviewer@example.edu',
      handoffDueDate: iso(14).slice(0, 10)
    },
    projects: [{
      id: projectId,
      name: 'Phase Transition Study',
      slug: 'phase-transition',
      createdAt: iso(-30),
      updatedAt: iso(),
      lastScan: iso(-1)
    }],
    sources: [],
    ingestionJobs: [],
    statusProposals: [],
    handoffReports: [],
    idempotencyRecords: [],
    snapshots: [],
    evidence: nodes.flatMap((node) => (node.evidenceIds || []).map((id) => ({
      id,
      projectId,
      evidenceType: 'seed_fixture',
      source: 'deterministic_demo',
      capturedAt: iso(-1),
      payload: { nodeId: node.id }
    }))),
    nodes,
    edges,
    findings,
    audits: [],
    handoffs: [{
      projectId,
      status: 'draft',
      departingMember: 'departing@example.edu',
      receivingMember: 'receiver@example.edu',
      dueDate: iso(14).slice(0, 10),
      workspaceLinks: {}
    }],
    auditEvents: [{
      id: 'ae_seed',
      timestamp: iso(-1),
      traceId: 'trace_seed',
      userSubject: 'system',
      action: 'seed_demo',
      resource: `project/${projectId}`,
      status: 'success',
      details: 'Deterministic demo evidence initialized.'
    }]
  };
}

export function enforceR4Evidence(state) {
  let changed = false;
  for (const output of state.nodes || []) {
    if (output.reproducibility !== 'R4') continue;
    const verified = (state.edges || []).some((edge) => {
      if (edge.target !== output.id || edge.confidence !== 'exact' || !['generated', 'writes_to'].includes(edge.relation)) return false;
      const run = state.nodes.find((node) => node.id === edge.source && node.type === 'Run');
      return run?.details?.executionMode === 'controlled-rerun' &&
        run.details?.verificationStatus === 'verified' &&
        String(run.details?.exitCode) === '0' &&
        output.details?.rerunHashMatch === 'true' &&
        (run.evidenceIds || []).length > 0 &&
        (edge.evidenceIds || []).length > 0;
    });
    if (!verified) {
      output.reproducibility = 'R3';
      changed = true;
    }
  }
  return changed;
}

export function normalizeStateOwnership(state) {
  let changed = false;
  state.evidence ||= [];
  if (!state.sources) {
    state.sources = [];
    changed = true;
  }
  if (!state.ingestionJobs) {
    state.ingestionJobs = [];
    changed = true;
  }
  if (!state.statusProposals) {
    state.statusProposals = [];
    changed = true;
  }
  if (!state.handoffReports) {
    state.handoffReports = [];
    changed = true;
  }
  if (!state.idempotencyRecords) {
    state.idempotencyRecords = [];
    changed = true;
  }
  if (state.projects?.length !== 1) return changed;
  const projectId = state.projects[0].id;
  for (const collection of ['nodes', 'findings', 'audits', 'evidence']) {
    for (const item of state[collection] || []) {
      if (!item.projectId) {
        item.projectId = projectId;
        changed = true;
      }
    }
  }
  const knownEvidence = new Set(state.evidence.map((item) => item.id));
  for (const edge of state.edges || []) {
    if (!edge.id) {
      edge.id = stableEdgeId(edge);
      changed = true;
    }
  }
  for (const handoff of state.handoffs || []) {
    if (!handoff.id) {
      handoff.id = `handoff_${createHash('sha256').update(String(handoff.projectId)).digest('hex').slice(0, 24)}`;
      changed = true;
    }
  }
  for (const node of state.nodes || []) {
    for (const evidenceId of node.evidenceIds || []) {
      if (knownEvidence.has(evidenceId)) continue;
      state.evidence.push({
        id: evidenceId,
        projectId,
        evidenceType: 'legacy_reference',
        source: 'migrated_state',
        capturedAt: new Date().toISOString(),
        payload: { nodeId: node.id, note: 'Evidence payload was not present in the legacy MVP state.' }
      });
      knownEvidence.add(evidenceId);
      changed = true;
    }
  }
  return changed;
}

export class JsonStore {
  constructor(dataDir = defaultDataDir) {
    this.dataDir = dataDir;
    this.state = null;
    this.writeChain = Promise.resolve();
  }

  get dataDir() {
    return this._dataDir;
  }

  set dataDir(value) {
    this._dataDir = path.resolve(value);
    this.file = path.join(this._dataDir, 'state.json');
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      this.state = makeDemoState();
      await this.persist();
    }
    const ownershipChanged = normalizeStateOwnership(this.state);
    const r4Changed = enforceR4Evidence(this.state);
    if (ownershipChanged || r4Changed) await this.persist();
    return this;
  }

  get() {
    if (!this.state) throw new Error('Store has not been initialized');
    return this.state;
  }

  async update(mutator) {
    const result = await mutator(this.get());
    await this.persist();
    return result;
  }

  async persist() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.get(), null, 2)}\n`, 'utf8');
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            await rename(temporary, this.file);
            break;
          } catch (error) {
            if (!['EACCES', 'EPERM'].includes(error.code) || attempt >= 5) throw error;
            await new Promise((resolve) => setTimeout(resolve, 20 * (2 ** attempt)));
          }
        }
      } finally {
        await rm(temporary, { force: true }).catch(() => {});
      }
    });
    return this.writeChain;
  }

  async log({ action, resource, status = 'success', details, userSubject, actor }) {
    const event = {
      id: `ae_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      traceId: `trace_${randomUUID()}`,
      userSubject: userSubject || actor || 'local-user',
      action,
      resource,
      status,
      details
    };
    await this.update((state) => {
      state.auditEvents.unshift(event);
      state.auditEvents = state.auditEvents.slice(0, 500);
    });
    return event;
  }
}

export function projectSummary(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const projectNodes = state.nodes.filter((node) =>
    node.id === projectId || node.projectId === projectId || projectId === 'project_phase_transition'
  );
  const scoreCounts = { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0 };
  for (const node of projectNodes) {
    if (node.reproducibility) scoreCounts[node.reproducibility] += 1;
  }
  return {
    id: project.id,
    name: project.name,
    totalAssets: projectNodes.filter((node) => !['Project', 'Conclusion'].includes(node.type)).length,
    reproducibilityScores: scoreCounts,
    openFindings: state.findings.filter((finding) => finding.projectId === projectId && finding.status === 'open').length,
    lastScan: project.lastScan || project.updatedAt
  };
}
