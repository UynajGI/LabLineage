import { createHash } from 'node:crypto';

function stableId(prefix, ...parts) {
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
  return `${prefix}_${digest}`;
}

function nodeType(file) {
  const extension = String(file.extension || '').toLowerCase();
  const kind = String(file.kind || '').toLowerCase();
  const mediaType = String(file.mediaType || '').toLowerCase();
  if (['.py', '.js', '.jsx', '.ts', '.tsx', '.r', '.jl', '.m', '.sh', '.ps1'].includes(extension) || kind === 'code') return 'Script';
  if (['.csv', '.tsv', '.parquet', '.feather', '.h5', '.hdf5', '.npy'].includes(extension) || kind === 'data') return 'Dataset';
  if (['.png', '.jpg', '.jpeg', '.svg', '.pdf'].includes(extension) || mediaType.startsWith('image/')) return 'Figure';
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.lock'].includes(extension) || kind === 'config') return 'ParameterSet';
  if (['.md', '.rst', '.txt', '.docx'].includes(extension) || kind === 'document') return 'Output';
  return 'Data';
}

export function snapshotToEvidenceGraph(projectId, snapshot) {
  const revision = snapshot.sourceRevision || snapshot.bundleId || snapshot.id;
  const nodes = [];
  const evidence = [];
  for (const file of snapshot.files || []) {
    if (!file.pathToken || !file.contentHash) continue;
    const evidenceId = stableId('ev_file', projectId, revision, file.pathToken, file.contentHash);
    const nodeId = stableId('node_file', projectId, file.pathToken, file.contentHash);
    const details = {
      pathToken: file.pathToken,
      contentHash: file.contentHash,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      mediaType: file.mediaType,
      sourceRevision: revision,
    };
    evidence.push({
      id: evidenceId,
      projectId,
      evidenceType: 'file_fingerprint',
      source: 'deterministic_scanner',
      capturedAt: snapshot.collectedAt || snapshot.createdAt || new Date().toISOString(),
      payload: details,
    });
    nodes.push({
      id: nodeId,
      projectId,
      type: nodeType(file),
      label: file.pathToken,
      pathToken: file.pathToken,
      status: 'observed',
      confidence: 'exact',
      evidenceIds: [evidenceId],
      details,
    });
  }
  return { nodes, edges: [], evidence };
}
