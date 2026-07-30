import { randomBytes, timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const generatedInternalToken = randomBytes(32).toString('hex');

export function getMcpInternalToken() {
  return process.env.LABLINEAGE_MCP_INTERNAL_TOKEN || generatedInternalToken;
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ''));
  const rightBytes = Buffer.from(String(right || ''));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function requireInternalMcpToken(req, res, next) {
  if (!safeEqual(req.get('x-lablineage-mcp-token'), getMcpInternalToken())) {
    return res.status(401).json({ error: 'Internal MCP authentication failed' });
  }
  next();
}

function projectGraph(state, projectId) {
  const nodes = (state.nodes || []).filter((node) => node.id === projectId || node.projectId === projectId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (state.edges || []).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return { nodes, edges };
}

function publicNode(node) {
  const details = {};
  for (const key of ['commit', 'branch', 'repository', 'dirty', 'captureQuality', 'hash', 'rows']) {
    if (node.details?.[key] !== undefined) details[key] = node.details[key];
  }
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    status: node.status,
    reproducibility: node.reproducibility,
    evidenceIds: node.evidenceIds || [],
    details
  };
}

function publicEvidence(item) {
  return {
    id: item.id,
    type: item.type || item.evidenceType,
    source: item.source,
    capturedAt: item.capturedAt,
    sha256: item.sha256 || item.contentHash
  };
}

export function createReadOnlyMcpServer(store, projectId) {
  const server = new McpServer({
    name: 'lablineage-readonly-evidence',
    version: '0.3.0'
  });

  server.registerTool(
    'lineage_evidence',
    {
      description: 'Read a bounded lineage neighborhood and evidence references for one project artifact.',
      inputSchema: { artifact: z.string().min(1).max(300) },
      annotations: {
        title: 'Read lineage evidence',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ artifact }) => {
      const state = store.get();
      const { nodes, edges } = projectGraph(state, projectId);
      const needle = artifact.toLowerCase();
      const root = nodes.find((node) =>
        node.id === artifact || String(node.label || '').toLowerCase().includes(needle)
      );
      if (!root) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'artifact_not_found' }) }]
        };
      }
      const ids = new Set([root.id]);
      for (const edge of edges) {
        if (edge.source === root.id || edge.target === root.id) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
      const selectedEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      const evidenceIds = new Set([
        ...(root.evidenceIds || []),
        ...selectedEdges.flatMap((edge) => edge.evidenceIds || [])
      ]);
      const result = {
        root: publicNode(root),
        nodes: nodes.filter((node) => ids.has(node.id)).slice(0, 100).map(publicNode),
        edges: selectedEdges.slice(0, 200).map((edge) => ({
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          confidence: edge.confidence,
          evidenceIds: edge.evidenceIds || []
        })),
        evidence: (state.evidence || [])
          .filter((item) => item.projectId === projectId && evidenceIds.has(item.id))
          .slice(0, 100)
          .map(publicEvidence)
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    'repository_evidence',
    {
      description: 'Read bounded Git and repository provenance evidence without exposing local paths or credentials.',
      inputSchema: {},
      annotations: {
        title: 'Read repository evidence',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const state = store.get();
      const { nodes } = projectGraph(state, projectId);
      const repositoryNodes = nodes.filter((node) =>
        ['CodeVersion', 'Repository', 'Branch', 'Tag', 'Commit'].includes(node.type)
      );
      const evidenceIds = new Set(repositoryNodes.flatMap((node) => node.evidenceIds || []));
      const result = {
        nodes: repositoryNodes.slice(0, 200).map(publicNode),
        evidence: (state.evidence || [])
          .filter((item) => item.projectId === projectId && evidenceIds.has(item.id))
          .slice(0, 200)
          .map(publicEvidence)
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}

export async function handleReadOnlyMcpRequest(store, req, res) {
  const server = createReadOnlyMcpServer(store, req.params.projectId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    await server.close().catch(() => {});
  }
}
