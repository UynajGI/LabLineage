import { z } from 'zod';

const registrySchema = z.object({
  schemaVersion: z.literal('lablineage.agent-registry.v1'),
  agents: z.array(z.object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    runtime: z.string().min(1),
    authentication: z.literal('oidc'),
    dataClassification: z.string().min(1),
    tools: z.array(z.object({
      name: z.string().min(1),
      mode: z.literal('read'),
      classification: z.string().min(1)
    }).strict()),
    writePolicy: z.string().min(1)
  }).passthrough()).min(1),
  mcpServers: z.array(z.object({
    id: z.string().min(1),
    authentication: z.string().min(1),
    mode: z.string().min(1),
    classification: z.string().min(1)
  }).strict())
}).strict();

const gatewaySchema = z.object({
  apiVersion: z.literal('lablineage.dev/v1'),
  kind: z.literal('AgentGatewayPolicy'),
  metadata: z.object({ name: z.string().min(1) }).strict(),
  spec: z.object({
    authentication: z.object({ type: z.literal('oidc'), audience: z.string().min(1) }).strict(),
    authorization: z.object({
      projectClaim: z.string().min(1),
      roleClaim: z.string().min(1),
      denyByDefault: z.literal(true)
    }).strict(),
    rateLimits: z.record(z.string(), z.object({ requestsPerMinute: z.number().int().positive() }).strict()),
    data: z.object({
      maxRequestBytes: z.number().int().positive().max(10 * 1024 * 1024),
      rawPaths: z.literal('deny'),
      secrets: z.literal('deny'),
      promptLogging: z.literal('metadata-only')
    }).strict(),
    tools: z.object({
      read: z.object({ confirmation: z.literal('none') }).strict(),
      write: z.object({
        confirmation: z.literal('explicit'),
        idempotencyKey: z.literal('required'),
        auditEvent: z.literal('required')
      }).strict()
    }).strict(),
    egress: z.object({
      allow: z.array(z.string().min(1)).min(1)
    }).strict()
  }).strict()
}).strict();

export function validateDeploymentPolicy(registryRaw, gatewayRaw) {
  const registry = registrySchema.parse(registryRaw);
  const gateway = gatewaySchema.parse(gatewayRaw);
  const agentIds = new Set();
  const toolDefinitions = new Map();
  for (const agent of registry.agents) {
    if (agentIds.has(agent.id)) throw new Error(`Duplicate agent ID: ${agent.id}`);
    agentIds.add(agent.id);
    for (const tool of agent.tools) {
      const existing = toolDefinitions.get(tool.name);
      if (existing && (existing.mode !== tool.mode || existing.classification !== tool.classification)) {
        throw new Error(`Conflicting shared tool definition: ${tool.name}`);
      }
      toolDefinitions.set(tool.name, tool);
    }
  }
  for (const hostname of gateway.spec.egress.allow) {
    if (hostname === '*' || hostname.includes('/') || hostname.includes(':')) {
      throw new Error(`Egress allowlist entry must be an exact hostname: ${hostname}`);
    }
  }
  return {
    agents: registry.agents.length,
    tools: toolDefinitions.size,
    egressHosts: gateway.spec.egress.allow.length,
    denyByDefault: gateway.spec.authorization.denyByDefault
  };
}
