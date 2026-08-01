import { createHash, randomUUID } from 'node:crypto';

export const LINEAGE_NODE_TYPES = [
  'Project', 'CodeVersion', 'Dataset', 'ParameterSet', 'Environment',
  'Run', 'Figure', 'Conclusion', 'Script', 'Data', 'Output'
];

export const LINEAGE_RELATIONS = [
  'executed_as', 'used_input', 'used_parameter_set', 'used_environment',
  'generated', 'supports'
];

function shortHash(value, length = 12) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * 校验并标准化 Agent 推断的谱系候选。
 *
 * 确定性规则：
 * - 节点必须引用最新扫描快照里真实存在的 pathToken（文件指纹即证据）
 * - 关系必须命中白名单；节点类型必须命中白名单
 * - 已存在的节点/边复用，不重复创建（幂等）
 *
 * 返回 { nodes, edges, evidence } 供调用方写入 store；校验失败抛带 statusCode 的错误。
 */
export function prepareLineageProposal(projectId, input, snapshotFiles, actor) {
  const filesByPath = new Map((snapshotFiles || []).map((file) => [file.pathToken, file]));
  const nodesToAdd = [];
  const evidenceToAdd = [];
  const nodeIds = new Map(); // pathToken -> nodeId

  for (const rawNode of input.nodes || []) {
    const file = filesByPath.get(rawNode.pathToken);
    if (!file) {
      throw httpError(`Path token not found in the latest snapshot: ${rawNode.pathToken}`, 400);
    }
    const nodeId = `node_${shortHash(rawNode.pathToken)}`;
    const evidenceId = `ev_${shortHash(`file:${projectId}:${rawNode.pathToken}`, 16)}`;
    nodeIds.set(rawNode.pathToken, nodeId);
    nodesToAdd.push({
      id: nodeId,
      projectId,
      type: rawNode.kind,
      label: rawNode.label || rawNode.pathToken,
      status: 'inferred',
      confidence: 'inferred',
      evidenceIds: [evidenceId],
      details: { pathToken: rawNode.pathToken, contentHash: file.contentHash }
    });
    evidenceToAdd.push({
      id: evidenceId,
      projectId,
      evidenceType: 'file_fingerprint',
      source: 'inferred_lineage',
      capturedAt: new Date().toISOString(),
      payload: { pathToken: rawNode.pathToken, contentHash: file.contentHash }
    });
  }

  const edgesToAdd = [];
  for (const rawEdge of input.edges || []) {
    const resolve = (reference) => {
      if (nodeIds.has(reference)) return nodeIds.get(reference);
      if (reference.startsWith('node_')) return reference;
      const file = filesByPath.get(reference);
      if (file) return `node_${shortHash(reference)}`;
      return null;
    };
    const source = resolve(rawEdge.source);
    const target = resolve(rawEdge.target);
    if (!source || !target || source === target) {
      throw httpError(`Edge references an unknown file or node: ${rawEdge.source} -> ${rawEdge.target}`, 400);
    }
    edgesToAdd.push({
      id: `edge_${shortHash(`${source}|${target}|${rawEdge.relation}`, 16)}`,
      source,
      target,
      relation: rawEdge.relation,
      confidence: 'inferred',
      evidenceIds: []
    });
  }

  return {
    proposalId: `lp_${randomUUID()}`,
    projectId,
    source: 'agent_inferred',
    actor,
    rationale: input.rationale || '',
    nodes: nodesToAdd,
    edges: edgesToAdd,
    evidence: evidenceToAdd,
    createdAt: new Date().toISOString()
  };
}
