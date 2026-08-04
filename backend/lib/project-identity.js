export function projectScopedId(projectId, externalId) {
  return `${projectId}::${externalId}`;
}

export function scopeGraphToProject(projectId, graph) {
  const scopeNode = (id) => projectScopedId(projectId, id);
  const scopeEvidence = (id) => projectScopedId(projectId, id);
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      id: scopeNode(node.id),
      projectId,
      details: { externalId: node.id, ...node.details },
      evidenceIds: (node.evidenceIds || []).map(scopeEvidence)
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      ...(edge.id ? { id: projectScopedId(projectId, edge.id) } : {}),
      projectId,
      source: scopeNode(edge.source),
      target: scopeNode(edge.target),
      evidenceIds: (edge.evidenceIds || []).map(scopeEvidence)
    })),
    evidence: graph.evidence.map((item) => ({
      ...item,
      id: scopeEvidence(item.id),
      projectId,
      externalId: item.id
    }))
  };
}
