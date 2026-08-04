import { createHash, randomUUID } from 'node:crypto';

function hasTypedRelation(nodes, edges, type, relations) {
  const ids = new Set(nodes.filter((node) => node.type === type).map((node) => node.id));
  return edges.some((edge) => (
    ids.has(edge.source) &&
    relations.includes(edge.relation) &&
    ['exact', 'strong', 'human_verified'].includes(edge.confidence) &&
    (edge.evidenceIds || []).length > 0
  ));
}

const checks = [
  ['code_version', 20, (_types, edges, nodes) => hasTypedRelation(nodes, edges, 'CodeVersion', ['executed_code', 'executed_as'])],
  ['input_dataset', 15, (_types, edges, nodes) => hasTypedRelation(nodes, edges, 'Dataset', ['used_input', 'reads_from'])],
  ['parameter_set', 15, (_types, edges, nodes) => hasTypedRelation(nodes, edges, 'ParameterSet', ['used_parameter_set', 'defines_parameters'])],
  ['environment_capture', 15, (_types, edges, nodes) => hasTypedRelation(nodes, edges, 'Environment', ['captured_environment', 'used_environment'])],
  ['captured_run', 15, (types) => types.has('Run')],
  ['generated_output', 10, (types) => types.has('Figure')],
  ['lineage_evidence', 10, (_types, edges) => edges.some((edge) => ['exact', 'strong'].includes(edge.confidence))]
];

export const AUDIT_RULES = Object.freeze([
  { id: 'result.orphan', type: 'orphan', defaultSeverity: 'P1' },
  { id: 'run.failed', type: 'failed_run', defaultSeverity: 'P2' },
  { id: 'result.from_failed_run', type: 'failed_run', defaultSeverity: 'P1' },
  { id: 'result.duplicate_hash', type: 'duplicate', defaultSeverity: 'P2' },
  { id: 'result.stale_upstream', type: 'stale', defaultSeverity: 'P1' },
  { id: 'result.manual_edit', type: 'manual_edit', defaultSeverity: 'P1' },
  { id: 'result.missing_reproduction_inputs', type: 'unreproducible', defaultSeverity: 'P1' },
  { id: 'result.junk_pattern', type: 'junk_suspected', defaultSeverity: 'P3' },
  { id: 'result.conflicting_versions', type: 'conflict', defaultSeverity: 'P1' }
]);

function stableFindingId(ruleId, entities, discriminator = '') {
  const digest = createHash('sha256')
    .update(`${ruleId}\0${[...entities].sort().join('\0')}\0${discriminator}`)
    .digest('hex')
    .slice(0, 32);
  return `finding_${digest}`;
}

function timestamp(node) {
  const value = node.details?.modifiedAt || node.details?.observedAt || node.details?.committedAt;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreResultSpine(nodes, edges, result, run) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const spineEdges = run
    ? edges.filter((edge) => (
        (edge.target === run.id && nodeById.has(edge.source)) ||
        (edge.source === run.id && edge.target === result.id)
      ))
    : [];
  const spineNodes = run
    ? [result, run, ...spineEdges.filter((edge) => edge.target === run.id).map((edge) => nodeById.get(edge.source))]
    : [result];
  const types = new Set(spineNodes.filter(Boolean).map((node) => node.type));
  const breakdown = checks.map(([key, weight, predicate]) => ({
    key,
    weight,
    passed: predicate(types, spineEdges, spineNodes)
  }));
  const score = breakdown.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const outputEdge = run && spineEdges.find((edge) => (
    edge.source === run.id &&
    edge.target === result.id &&
    edge.confidence === 'exact' &&
    ['generated', 'writes_to'].includes(edge.relation)
  ));
  const verifiedRerun = Boolean(
    run &&
    run.details?.executionMode === 'controlled-rerun' &&
    run.details?.verificationStatus === 'verified' &&
    String(run.details?.exitCode) === '0' &&
    (run.evidenceIds || []).length > 0 &&
    result.details?.rerunHashMatch === 'true' &&
    (outputEdge?.evidenceIds || []).length > 0
  );
  const level = score >= 85
    ? verifiedRerun ? 'R4' : 'R3'
    : score >= 65 ? 'R3' : score >= 40 ? 'R2' : score >= 20 ? 'R1' : 'R0';
  const missing = breakdown.filter((check) => !check.passed).map((check) => check.key);
  if (!verifiedRerun) missing.push('verified_rerun');
  return {
    resultId: result.id,
    score,
    level,
    verifiedRerun,
    breakdown,
    missing
  };
}

export function scoreReproducibility(nodes, edges) {
  const results = nodes.filter((node) => node.type === 'Figure').sort((left, right) => left.id.localeCompare(right.id));
  if (!results.length) {
    return {
      resultId: null,
      score: 0,
      level: 'R0',
      verifiedRerun: false,
      breakdown: checks.map(([key, weight]) => ({ key, weight, passed: false })),
      missing: [...checks.map(([key]) => key), 'verified_rerun'],
      resultScores: []
    };
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const resultScores = results.map((result) => {
    const runs = edges
      .filter((edge) => edge.target === result.id && ['generated', 'writes_to'].includes(edge.relation))
      .map((edge) => nodeById.get(edge.source))
      .filter((node) => node?.type === 'Run');
    const scores = runs.length
      ? runs.map((run) => scoreResultSpine(nodes, edges, result, run))
      : [scoreResultSpine(nodes, edges, result, null)];
    return scores.sort((left, right) => right.score - left.score)[0];
  });
  const summary = [...resultScores].sort((left, right) => left.score - right.score || left.resultId.localeCompare(right.resultId))[0];
  return { ...summary, resultScores };
}

export function deriveFindings(nodes, edges) {
  const findings = [];
  const findingKeys = new Set();
  const byHash = new Map();
  const byLabel = new Map();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  const add = ({ ruleId, type, severity, title, description, affectedEntities, proposedAction, evidenceIds = [], discriminator = '' }) => {
    const entities = [...new Set(affectedEntities)].sort();
    const key = `${ruleId}:${entities.join(',')}:${discriminator}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({
      id: stableFindingId(ruleId, entities, discriminator),
      ruleId,
      type,
      severity,
      title,
      description,
      affectedEntities: entities,
      proposedAction,
      status: 'open',
      evidenceIds: [...new Set(evidenceIds)]
    });
  };

  for (const node of nodes) {
    const generatingEdges = (incoming.get(node.id) || []).filter((edge) => ['generated', 'writes_to'].includes(edge.relation));
    if (node.type === 'Figure' && generatingEdges.length === 0) {
      add({
        ruleId: 'result.orphan',
        type: 'orphan',
        severity: 'P1',
        title: `结果缺少生成谱系：${node.label}`,
        description: '未找到连接该结果与运行、代码、参数或输入数据的证据。',
        affectedEntities: [node.id],
        proposedAction: '补充运行记录或由人工确认推断关系；不要自动删除该文件。',
        evidenceIds: node.evidenceIds || []
      });
    }
    if (node.type === 'Run' && node.details?.exitCode && node.details.exitCode !== '0') {
      add({
        ruleId: 'run.failed',
        type: 'failed_run',
        severity: 'P2',
        title: `失败运行仍在谱系中：${node.label}`,
        description: `记录的退出码为 ${node.details.exitCode}。`,
        affectedEntities: [node.id],
        proposedAction: '确认其输出是否应隔离，并保留失败证据供审计。',
        evidenceIds: node.evidenceIds || []
      });
      for (const edge of outgoing.get(node.id) || []) {
        const output = nodeById.get(edge.target);
        if (!output || !['generated', 'writes_to'].includes(edge.relation)) continue;
        add({
          ruleId: 'result.from_failed_run',
          type: 'failed_run',
          severity: 'P1',
          title: `结果来自失败运行：${output.label}`,
          description: `${output.label} 由退出码 ${node.details.exitCode} 的运行生成。`,
          affectedEntities: [node.id, output.id],
          proposedAction: '隔离该结果并人工判断是否保留；系统不会自动删除。',
          evidenceIds: [...(node.evidenceIds || []), ...(edge.evidenceIds || []), ...(output.evidenceIds || [])]
        });
      }
    }
    const hash = node.details?.hash;
    if (node.type === 'Figure' && hash) {
      const previous = byHash.get(hash);
      if (previous && previous.id !== node.id) {
        add({
          ruleId: 'result.duplicate_hash',
          type: 'duplicate',
          severity: 'P2',
          title: `检测到重复内容：${node.label}`,
          description: `${previous.label} 与 ${node.label} 具有相同内容哈希。`,
          affectedEntities: [previous.id, node.id],
          proposedAction: '人工指定 canonical 资产，并将其他版本标为 duplicate 或 superseded。',
          evidenceIds: [...(previous.evidenceIds || []), ...(node.evidenceIds || [])]
        });
      } else {
        byHash.set(hash, node);
      }
    }
    if (node.type === 'Figure') {
      const peers = byLabel.get(node.label) || [];
      for (const peer of peers) {
        if (peer.details?.hash && hash && peer.details.hash !== hash && ['accepted', 'candidate'].includes(peer.status) && ['accepted', 'candidate'].includes(node.status)) {
          add({
            ruleId: 'result.conflicting_versions',
            type: 'conflict',
            severity: 'P1',
            title: `同名结果存在冲突版本：${node.label}`,
            description: '同一逻辑名称对应不同内容哈希，且版本仍处于候选或采用状态。',
            affectedEntities: [peer.id, node.id],
            proposedAction: '由负责人指定 canonical 版本，并将旧版本标为 superseded；不要自动删除。',
            evidenceIds: [...(peer.evidenceIds || []), ...(node.evidenceIds || [])]
          });
        }
      }
      peers.push(node);
      byLabel.set(node.label, peers);

      for (const edge of generatingEdges) {
        const run = nodeById.get(edge.source);
        if (!run || run.type !== 'Run') continue;
        const outputTime = timestamp(node);
        const upstreamEdges = incoming.get(run.id) || [];
        const upstreamNodes = upstreamEdges.map((candidate) => nodeById.get(candidate.source)).filter(Boolean);
        const newer = upstreamNodes.filter((candidate) => outputTime !== null && timestamp(candidate) !== null && timestamp(candidate) > outputTime);
        if (node.details?.stale === 'true' || newer.length) {
          add({
            ruleId: 'result.stale_upstream',
            type: 'stale',
            severity: 'P1',
            title: `结果可能已过期：${node.label}`,
            description: newer.length
              ? `上游 ${newer.map((candidate) => candidate.label).join('、')} 的修改时间晚于结果。`
              : '采集证据明确将该结果标记为 stale。',
            affectedEntities: [node.id, ...newer.map((candidate) => candidate.id)],
            proposedAction: '使用最新代码、数据和参数重新运行并比较输出哈希。',
            evidenceIds: [...(edge.evidenceIds || []), ...newer.flatMap((candidate) => candidate.evidenceIds || [])]
          });
        }
        const observedHash = edge.observedHash || edge.details?.observedHash;
        if (node.details?.manualEdit === 'true' || (observedHash && hash && observedHash !== hash)) {
          add({
            ruleId: 'result.manual_edit',
            type: 'manual_edit',
            severity: 'P1',
            title: `结果可能在生成后被手工修改：${node.label}`,
            description: '当前内容哈希与运行证据记录的输出哈希不一致，或采集器明确标记了手工编辑。',
            affectedEntities: [run.id, node.id],
            proposedAction: '保留当前文件，重新运行并由人工确认哪个版本进入交接。',
            evidenceIds: [...(edge.evidenceIds || []), ...(node.evidenceIds || [])]
          });
        }
        const upstreamTypes = new Set(upstreamNodes.map((candidate) => candidate.type));
        const missingTypes = ['CodeVersion', 'Dataset', 'ParameterSet', 'Environment'].filter((type) => !upstreamTypes.has(type));
        if (missingTypes.length) {
          add({
            ruleId: 'result.missing_reproduction_inputs',
            type: 'unreproducible',
            severity: 'P1',
            title: `关键复现条件缺失：${node.label}`,
            description: `缺少 ${missingTypes.join(', ')} 证据。`,
            affectedEntities: [run.id, node.id],
            proposedAction: '补充代码版本、输入数据、参数和环境锁定证据后再判断可复现等级。',
            evidenceIds: [...(run.evidenceIds || []), ...(edge.evidenceIds || [])],
            discriminator: missingTypes.join(',')
          });
        }
      }

      if (!['accepted', 'exploratory', 'quarantined'].includes(node.status) && /(?:^|[._/-])(?:tmp|temp|cache|scratch|untitled|copy)(?:[._/-]|$)/i.test(node.label || '')) {
        add({
          ruleId: 'result.junk_pattern',
          type: 'junk_suspected',
          severity: 'P3',
          title: `疑似临时或缓存结果：${node.label}`,
          description: '名称匹配临时、缓存或复制文件模式；这只是清理建议，不代表科学价值判断。',
          affectedEntities: [node.id],
          proposedAction: '加入人工清理清单，由负责人确认后再决定状态；系统不会自动删除。',
          evidenceIds: node.evidenceIds || []
        });
      }
    }
  }
  return findings;
}

export function createAudit(projectId, nodes, edges) {
  const reproducibility = scoreReproducibility(nodes, edges);
  const findings = deriveFindings(nodes, edges).map((finding) => ({ ...finding, projectId }));
  return {
    id: `audit_${randomUUID()}`,
    projectId,
    auditType: 'handoff_full',
    policyVersion: 'handoff-policy@1.0',
    agentVersion: 'lablineage-guardian@0.3.0',
    createdAt: new Date().toISOString(),
    ...reproducibility,
    findingIds: findings.map((finding) => finding.id),
    findings
  };
}
