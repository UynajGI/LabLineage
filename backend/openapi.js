const routeDefinitions = [
  ['get', '/api/health', 'Health check', true],
  ['get', '/api/ready', 'Dependency readiness check', true],
  ['get', '/api/client-config', 'Non-secret browser authentication configuration', true],
  ['get', '/api/version', 'API and contract version information', true],
  ['get', '/api/openapi.json', 'OpenAPI 3.1 contract', true],
  ['post', '/api/webhooks/github', 'Signed GitHub webhook receiver', true],
  ['get', '/v1/setup', 'Read setup configuration'],
  ['put', '/v1/setup', 'Update setup configuration'],
  ['get', '/v1/integrations/status', 'Read integration status'],
  ['get', '/v1/capabilities', 'Read actor and deployment capabilities'],
  ['get', '/v1/security/summary', 'Read administrator security summary'],
  ['get', '/v1/projects', 'List visible projects'],
  ['post', '/v1/projects', 'Create a project'],
  ['get', '/v1/projects/{projectId}/sources', 'List project sources'],
  ['post', '/v1/projects/{projectId}/sources', 'Register a project source'],
  ['post', '/v1/sources/{sourceId}/disconnect', 'Disconnect a source while retaining evidence'],
  ['get', '/v1/sources/{sourceId}/changes', 'Read latest source changes'],
  ['get', '/v1/sources/{sourceId}/snapshots', 'List source snapshots'],
  ['post', '/v1/sources/{sourceId}/bundles', 'Submit a source bundle as an ingestion job'],
  ['get', '/v1/ingestion-jobs/{jobId}', 'Read an ingestion job'],
  ['post', '/v1/ingestion-jobs/{jobId}/retry', 'Retry a failed ingestion job with corrected evidence'],
  ['post', '/v1/lineage-edges/{edgeId}/review', 'Submit an authenticated lineage relation review'],
  ['post', '/v1/assets/{assetId}/status-proposals', 'Propose an asset status without changing formal state'],
  ['get', '/v1/projects/{projectId}/summary', 'Read project summary'],
  ['get', '/v1/projects/{projectId}/lineage', 'Read project lineage graph'],
  ['get', '/v1/projects/{projectId}/findings', 'List open audit findings'],
  ['post', '/v1/projects/{projectId}/findings/{findingId}/resolve', 'Resolve a finding with explicit confirmation'],
  ['get', '/v1/projects/{projectId}/evidence', 'List project evidence'],
  ['get', '/v1/projects/{projectId}/evidence/{evidenceId}', 'Read one evidence record'],
  ['get', '/v1/projects/{projectId}/handoff', 'Read project handoff state'],
  ['get', '/v1/projects/{projectId}/audit-events', 'Read immutable audit events'],
  ['post', '/v1/projects/{projectId}/nodes/{nodeId}/confirm', 'Confirm an inferred node'],
  ['post', '/v1/projects/{projectId}/snapshots', 'Scan an allowlisted server directory'],
  ['get', '/v1/projects/{projectId}/changes', 'Read latest project changes'],
  ['get', '/v1/projects/{projectId}/snapshots', 'List project snapshots'],
  ['get', '/v1/projects/{projectId}/snapshots/{snapshotId}/diff', 'Read a snapshot diff'],
  ['post', '/v1/manifests', 'Import one manifest bundle'],
  ['post', '/v1/manifests/batch', 'Import up to twenty isolated manifest bundles'],
  ['post', '/v1/projects/{projectId}/audits', 'Run deterministic reproducibility audit'],
  ['post', '/v1/projects/{projectId}/github/sync', 'Synchronize read-only GitHub evidence'],
  ['post', '/v1/projects/{projectId}/repositories/sync', 'Synchronize GitHub or allowlisted local Git evidence'],
  ['get', '/v1/artifacts/{artifactId}/lineage', 'Read bounded artifact lineage'],
  ['post', '/v1/projects/{projectId}/agent', 'Invoke the read-only Guardian ADK agent'],
  ['post', '/v1/handoffs/{handoffId}/report', 'Generate a versioned immutable handoff report'],
  ['get', '/v1/handoffs/{handoffId}/reports/{reportId}', 'Read a generated handoff report'],
  ['post', '/v1/projects/{projectId}/handoffs/export', 'Create a local handoff preview'],
  ['post', '/v1/projects/{projectId}/handoffs/workspace', 'Preview or explicitly execute Workspace handoff'],
  ['get', '/v1/metrics', 'Read Prometheus metrics']
];

const responseStatuses = new Map([
  ['post /api/webhooks/github', ['202']],
  ['put /v1/setup', ['204']],
  ['post /v1/projects/{projectId}/sources', ['200', '201']],
  ['post /v1/sources/{sourceId}/disconnect', ['200']],
  ['post /v1/sources/{sourceId}/bundles', ['202']],
  ['post /v1/ingestion-jobs/{jobId}/retry', ['202']],
  ['post /v1/lineage-edges/{edgeId}/review', ['200', '201']],
  ['post /v1/assets/{assetId}/status-proposals', ['200', '201']],
  ['post /v1/projects/{projectId}/findings/{findingId}/resolve', ['200', '201']],
  ['post /v1/projects/{projectId}/nodes/{nodeId}/confirm', ['204']],
  ['post /v1/manifests', ['200', '202']],
  ['post /v1/manifests/batch', ['207']],
  ['post /v1/projects/{projectId}/github/sync', ['202']],
  ['post /v1/projects/{projectId}/repositories/sync', ['202']],
  ['post /v1/projects/{projectId}/agent', ['200']],
  ['post /v1/handoffs/{handoffId}/report', ['200', '201']],
  ['post /v1/projects/{projectId}/handoffs/workspace', ['200', '201']]
]);

const idempotencyRequired = new Set(
  routeDefinitions
    .filter(([method, route]) => route.startsWith('/v1/') && ['post', 'put', 'patch', 'delete'].includes(method))
    .map(([method, route]) => `${method} ${route}`)
);

const requestSchemaByRoute = {
  'post /api/webhooks/github': { type: 'object', minProperties: 1, additionalProperties: true },
  'put /v1/setup': {
    type: 'object',
    additionalProperties: false,
    required: [
      'institutionName', 'labName', 'adminDisplayName', 'adminEmail', 'dataResidency',
      'defaultRegion', 'defaultTimezone', 'notificationLanguage', 'defaultProjectName',
      'defaultProjectSlug', 'departingMemberEmail', 'receivingMemberEmail', 'reviewerEmail',
      'handoffDueDate'
    ],
    properties: Object.fromEntries([
      'institutionName', 'labName', 'adminDisplayName', 'adminEmail', 'dataResidency',
      'defaultRegion', 'defaultTimezone', 'notificationLanguage', 'defaultProjectName',
      'defaultProjectSlug', 'departingMemberEmail', 'receivingMemberEmail', 'reviewerEmail',
      'handoffDueDate'
    ].map((name) => [name, { type: 'string' }]))
  },
  'post /v1/projects': {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 120 }
    }
  },
  'post /v1/projects/{projectId}/sources': { $ref: '#/components/schemas/CreateSourceRequest' },
  'post /v1/sources/{sourceId}/disconnect': {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation'],
    properties: { confirmation: { const: 'DISCONNECT_SOURCE' } }
  },
  'post /v1/sources/{sourceId}/bundles': {
    oneOf: [
      { $ref: '#/components/schemas/Manifest' },
      { $ref: '#/components/schemas/SignedBundle' }
    ]
  },
  'post /v1/ingestion-jobs/{jobId}/retry': {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation', 'manifest'],
    properties: {
      confirmation: { const: 'RETRY_INGESTION_JOB' },
      manifest: { $ref: '#/components/schemas/Manifest' }
    }
  },
  'post /v1/lineage-edges/{edgeId}/review': { $ref: '#/components/schemas/EdgeReviewRequest' },
  'post /v1/assets/{assetId}/status-proposals': { $ref: '#/components/schemas/StatusProposalRequest' },
  'post /v1/projects/{projectId}/findings/{findingId}/resolve': {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation'],
    properties: {
      confirmation: { const: 'RESOLVE_FINDING' },
      note: { type: 'string', maxLength: 1000 }
    }
  },
  'post /v1/projects/{projectId}/nodes/{nodeId}/confirm': {
    type: 'object',
    additionalProperties: false
  },
  'post /v1/projects/{projectId}/snapshots': {
    type: 'object',
    additionalProperties: false,
    required: ['path'],
    properties: {
      path: { type: 'string', minLength: 1 },
      includeTextDiff: { type: 'boolean', default: false },
      confirmation: { type: 'string', enum: ['ALLOW_TEXT_DIFF'] }
    },
    if: {
      required: ['includeTextDiff'],
      properties: { includeTextDiff: { const: true } }
    },
    then: { required: ['confirmation'] }
  },
  'post /v1/manifests': {
    oneOf: [
      { $ref: '#/components/schemas/Manifest' },
      { $ref: '#/components/schemas/SignedBundle' }
    ]
  },
  'post /v1/manifests/batch': {
    type: 'object',
    additionalProperties: false,
    required: ['manifests'],
    properties: {
      manifests: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          oneOf: [
            { $ref: '#/components/schemas/Manifest' },
            { $ref: '#/components/schemas/SignedBundle' }
          ]
        }
      }
    }
  },
  'post /v1/projects/{projectId}/audits': { type: 'object', additionalProperties: false },
  'post /v1/projects/{projectId}/github/sync': { $ref: '#/components/schemas/GitHubSyncRequest' },
  'post /v1/projects/{projectId}/repositories/sync': {
    oneOf: [
      { $ref: '#/components/schemas/GitHubRepositorySyncRequest' },
      {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'path'],
        properties: {
          provider: { const: 'local_git' },
          path: { type: 'string', minLength: 1, maxLength: 4096 },
          branch: { type: 'string', maxLength: 250 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          treeLimit: { type: 'integer', minimum: 1, maximum: 100000 }
        }
      }
    ]
  },
  'post /v1/projects/{projectId}/agent': {
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: { message: { type: 'string', minLength: 1, maxLength: 8000 } }
  },
  'post /v1/handoffs/{handoffId}/report': { $ref: '#/components/schemas/HandoffReportRequest' },
  'post /v1/projects/{projectId}/handoffs/export': {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation'],
    properties: { confirmation: { const: 'CREATE_LOCAL_HANDOFF_PREVIEW' } }
  },
  'post /v1/projects/{projectId}/handoffs/workspace': {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'idempotencyKey'],
    properties: {
      action: { enum: ['preview', 'execute'] },
      confirmation: { const: 'EXPORT_TO_GOOGLE_WORKSPACE' },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 200 },
      recipient: { type: 'string', format: 'email' }
    },
    if: { properties: { action: { const: 'execute' } } },
    then: { required: ['confirmation'] }
  }
};

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (name) => ({ type: 'array', items: schemaRef(name) });
const responseSchemaByRoute = {
  'get /api/health': schemaRef('Health'),
  'get /api/ready': schemaRef('Readiness'),
  'get /api/client-config': schemaRef('ClientConfig'),
  'get /api/version': schemaRef('Version'),
  'get /api/openapi.json': {
    type: 'object',
    required: ['openapi', 'info', 'paths'],
    properties: {
      openapi: { type: 'string' },
      info: { type: 'object' },
      paths: { type: 'object' }
    }
  },
  'post /api/webhooks/github': schemaRef('WebhookAcceptance'),
  'get /v1/setup': schemaRef('SetupConfig'),
  'get /v1/integrations/status': schemaRef('IntegrationStatus'),
  'get /v1/capabilities': schemaRef('Capabilities'),
  'get /v1/security/summary': schemaRef('SecuritySummary'),
  'get /v1/projects': arrayOf('ProjectSummary'),
  'post /v1/projects': schemaRef('Project'),
  'get /v1/projects/{projectId}/sources': arrayOf('Source'),
  'post /v1/projects/{projectId}/sources': schemaRef('Source'),
  'post /v1/sources/{sourceId}/disconnect': schemaRef('Source'),
  'get /v1/sources/{sourceId}/changes': arrayOf('FileChange'),
  'get /v1/sources/{sourceId}/snapshots': arrayOf('SnapshotSummary'),
  'post /v1/sources/{sourceId}/bundles': schemaRef('IngestionJob'),
  'get /v1/ingestion-jobs/{jobId}': schemaRef('IngestionJob'),
  'post /v1/ingestion-jobs/{jobId}/retry': schemaRef('IngestionJob'),
  'post /v1/lineage-edges/{edgeId}/review': schemaRef('EdgeReview'),
  'post /v1/assets/{assetId}/status-proposals': schemaRef('StatusProposal'),
  'get /v1/projects/{projectId}/summary': schemaRef('ProjectSummary'),
  'get /v1/projects/{projectId}/lineage': schemaRef('LineageGraph'),
  'get /v1/projects/{projectId}/findings': arrayOf('Finding'),
  'post /v1/projects/{projectId}/findings/{findingId}/resolve': schemaRef('FindingResolution'),
  'get /v1/projects/{projectId}/evidence': arrayOf('Evidence'),
  'get /v1/projects/{projectId}/evidence/{evidenceId}': schemaRef('Evidence'),
  'get /v1/projects/{projectId}/handoff': schemaRef('Handoff'),
  'get /v1/projects/{projectId}/audit-events': arrayOf('AuditEvent'),
  'post /v1/projects/{projectId}/snapshots': schemaRef('SnapshotResult'),
  'get /v1/projects/{projectId}/changes': arrayOf('FileChange'),
  'get /v1/projects/{projectId}/snapshots': arrayOf('SnapshotSummary'),
  'get /v1/projects/{projectId}/snapshots/{snapshotId}/diff': arrayOf('FileChange'),
  'post /v1/manifests': schemaRef('ManifestImportResult'),
  'post /v1/manifests/batch': schemaRef('BatchImportResult'),
  'post /v1/projects/{projectId}/audits': schemaRef('Audit'),
  'post /v1/projects/{projectId}/github/sync': schemaRef('RepositorySyncResult'),
  'post /v1/projects/{projectId}/repositories/sync': schemaRef('RepositorySyncResult'),
  'get /v1/artifacts/{artifactId}/lineage': schemaRef('ArtifactLineage'),
  'post /v1/projects/{projectId}/agent': schemaRef('AgentResult'),
  'post /v1/handoffs/{handoffId}/report': schemaRef('HandoffReport'),
  'get /v1/handoffs/{handoffId}/reports/{reportId}': schemaRef('HandoffReport'),
  'post /v1/projects/{projectId}/handoffs/export': schemaRef('HandoffExport'),
  'post /v1/projects/{projectId}/handoffs/workspace': schemaRef('WorkspaceHandoff')
};

function operationId(method, route) {
  return `${method}_${route}`.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+(.)/g, (_match, next) => next.toUpperCase());
}

function pathParameters(route) {
  return [...route.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 1 }
  }));
}

const paths = {};
for (const [method, route, summary, isPublic = false] of routeDefinitions) {
  const key = `${method} ${route}`;
  const successes = responseStatuses.get(key) || [method === 'post' ? '201' : '200'];
  const parameters = pathParameters(route);
  if (idempotencyRequired.has(key)) {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 200 }
    });
  }
  paths[route] ||= {};
  paths[route][method] = {
    operationId: operationId(method, route),
    summary,
    tags: [route.startsWith('/api') ? 'system' : route.split('/')[2] || 'system'],
    ...(isPublic ? { security: [] } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(['post', 'put', 'patch'].includes(method) ? {
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: requestSchemaByRoute[key] || { 'x-contract-placeholder': true }
          }
        }
      }
    } : {}),
    responses: {
      ...Object.fromEntries(successes.map((success) => [success, {
        description: 'Successful response',
        ...(!['204'].includes(success) ? {
          content: route === '/v1/metrics'
            ? { 'text/plain': { schema: { type: 'string' } } }
            : { 'application/json': { schema: responseSchemaByRoute[key] || { 'x-contract-placeholder': true } } }
        } : {})
      }])),
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
      ...(route === '/api/ready' ? {
        '503': {
          description: 'A mandatory dependency or production configuration is not ready',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotReady' } } }
        }
      } : {}),
      '500': { $ref: '#/components/responses/InternalError' }
    }
  };
}

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});

export const openApiDocument = {
  openapi: '3.1.1',
  info: {
    title: 'LabLineage Guardian API',
    version: '0.3.0',
    description: 'Versioned evidence, lineage, audit, source ingestion, Agent, and guarded handoff API. Additive changes remain within v1; breaking changes require a new API version.'
  },
  servers: [{ url: '/', description: 'Current Guardian deployment' }],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'OIDC JWT or service token' }
    },
    responses: {
      BadRequest: errorResponse('Invalid request'),
      Unauthorized: errorResponse('Authentication required'),
      Forbidden: errorResponse('Role or project access denied'),
      Conflict: errorResponse('State or idempotency conflict'),
      InternalError: errorResponse('Internal error; details are not exposed')
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string' },
          requestId: { type: 'string' },
          issues: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      Health: {
        type: 'object',
        required: ['status', 'version', 'authMode', 'database', 'adkConfigured', 'model'],
        properties: {
          status: { const: 'ok' },
          version: { type: 'string' },
          authMode: { type: 'string' },
          database: { type: 'string' },
          adkConfigured: { type: 'boolean' },
          model: { type: 'string' }
        }
      },
      Readiness: {
        type: 'object',
        required: ['status', 'database', 'objectStorage'],
        properties: {
          status: { const: 'ready' },
          database: { enum: ['postgresql', 'json-development'] },
          objectStorage: {
            type: 'object',
            required: ['mode', 'writable', 'readable'],
            properties: {
              mode: { enum: ['local', 'gcs'] },
              writable: { const: true },
              readable: { const: true }
            }
          }
        }
      },
      NotReady: {
        type: 'object',
        required: ['status', 'code'],
        properties: {
          status: { const: 'not_ready' },
          code: { type: 'string' },
          issues: { type: 'array', items: { type: 'string' } }
        }
      },
      ClientConfig: {
        type: 'object',
        required: ['mode', 'enabled'],
        properties: {
          mode: { type: 'string' },
          enabled: { type: 'boolean' },
          issuer: { type: 'string', format: 'uri' },
          clientId: { type: 'string' },
          authorizationEndpoint: { type: 'string', format: 'uri' },
          tokenEndpoint: { type: 'string', format: 'uri' },
          redirectUri: { type: 'string' },
          scope: { type: 'string' }
        }
      },
      Version: {
        type: 'object',
        required: ['api', 'implementation', 'manifestSchema', 'collectorMinimumNode'],
        properties: {
          api: { const: 'v1' },
          implementation: { type: 'string' },
          manifestSchema: { type: 'string' },
          collectorMinimumNode: { type: 'string' }
        }
      },
      WebhookAcceptance: {
        type: 'object',
        required: ['accepted'],
        properties: {
          accepted: { type: 'boolean' },
          ignored: { type: 'boolean' },
          duplicate: { type: 'boolean' },
          event: { type: 'string' },
          evidence: { type: 'integer', minimum: 0 },
          reason: { type: 'string' }
        }
      },
      SetupConfig: {
        type: 'object',
        required: [
          'institutionName', 'labName', 'adminDisplayName', 'adminEmail', 'dataResidency',
          'defaultRegion', 'defaultTimezone', 'notificationLanguage', 'defaultProjectName',
          'defaultProjectSlug', 'departingMemberEmail', 'receivingMemberEmail', 'reviewerEmail',
          'handoffDueDate'
        ],
        properties: Object.fromEntries([
          'institutionName', 'labName', 'adminDisplayName', 'adminEmail', 'dataResidency',
          'defaultRegion', 'defaultTimezone', 'notificationLanguage', 'defaultProjectName',
          'defaultProjectSlug', 'departingMemberEmail', 'receivingMemberEmail', 'reviewerEmail',
          'handoffDueDate'
        ].map((name) => [name, { type: 'string' }]))
      },
      IntegrationStatus: {
        type: 'object',
        required: ['github', 'workspace', 'collector', 'objectStorage'],
        properties: {
          github: { type: 'object' },
          workspace: { type: 'object' },
          collector: { type: 'object' },
          objectStorage: { type: 'object' }
        }
      },
      Capabilities: {
        type: 'object',
        required: ['actor', 'capabilities'],
        properties: {
          actor: { type: 'object', required: ['subject', 'kind', 'roles'] },
          capabilities: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title', 'state', 'detail'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                state: { enum: ['ready', 'configured', 'development', 'not_configured'] },
                detail: { type: 'string' }
              }
            }
          }
        }
      },
      SecuritySummary: {
        type: 'object',
        required: ['actor', 'serviceActors', 'deniedLast24Hours'],
        properties: {
          actor: { type: 'object' },
          serviceActors: { type: 'array', items: { type: 'object' } },
          deniedLast24Hours: { type: 'integer', minimum: 0 }
        }
      },
      Project: {
        type: 'object',
        required: ['id', 'name', 'slug', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ProjectSummary: {
        type: 'object',
        required: ['id', 'name', 'totalAssets', 'reproducibilityScores', 'openFindings', 'lastScan'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          totalAssets: { type: 'integer', minimum: 0 },
          reproducibilityScores: { type: 'object' },
          openFindings: { type: 'integer', minimum: 0 },
          lastScan: { type: 'string' }
        }
      },
      Source: {
        type: 'object',
        required: ['id', 'projectId', 'name', 'type', 'networkMode', 'status'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          name: { type: 'string' },
          type: { enum: ['filesystem', 'github', 'google_drive', 'offline_bundle'] },
          networkMode: { enum: ['connected', 'outbound_only', 'air_gapped'] },
          status: { enum: ['active', 'disconnected'] },
          idempotent: { type: 'boolean' }
        }
      },
      FileChange: {
        type: 'object',
        required: ['id', 'path', 'type', 'evidence'],
        properties: {
          id: { type: 'string' },
          path: { type: 'string' },
          type: { enum: ['added', 'modified', 'deleted', 'moved'] },
          oldHash: { type: 'string' },
          newHash: { type: 'string' },
          evidence: { type: 'object' },
          inference: {
            type: 'object',
            properties: {
              status: { const: 'inferred' },
              kind: { enum: ['move_candidate', 'copy_candidate'] },
              confidence: { type: 'string' }
            }
          }
        }
      },
      SnapshotSummary: {
        type: 'object',
        required: ['id', 'projectId', 'fileCount'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          sourceId: { type: ['string', 'null'] },
          fileCount: { type: 'integer', minimum: 0 },
          collectedAt: { type: 'string' },
          baseline: { type: 'boolean' }
        }
      },
      IngestionJob: {
        type: 'object',
        required: ['id', 'projectId', 'status', 'attempts'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          sourceId: { type: 'string' },
          bundleId: { type: 'string' },
          status: { enum: ['queued', 'processing', 'completed', 'failed'] },
          attempts: { type: 'integer', minimum: 0 }
        }
      },
      EdgeReview: {
        type: 'object',
        required: ['id', 'edgeId', 'projectId', 'decision', 'comment', 'reviewer', 'createdAt'],
        properties: {
          id: { type: 'string' },
          edgeId: { type: 'string' },
          projectId: { type: 'string' },
          decision: { enum: ['confirm', 'reject'] },
          comment: { type: 'string' },
          reviewer: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      StatusProposal: {
        type: 'object',
        required: ['id', 'projectId', 'assetId', 'proposedStatus', 'status', 'proposedBy', 'createdAt'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          assetId: { type: 'string' },
          proposedStatus: { type: 'string' },
          status: { const: 'pending' },
          proposedBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      LineageNode: {
        type: 'object',
        required: ['id', 'type', 'label'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          type: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string' }
        }
      },
      LineageEdge: {
        type: 'object',
        required: ['source', 'target', 'relation'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          target: { type: 'string' },
          relation: { type: 'string' },
          confidence: { type: 'string' }
        }
      },
      LineageGraph: {
        type: 'object',
        required: ['nodes', 'edges'],
        properties: {
          nodes: { type: 'array', items: { $ref: '#/components/schemas/LineageNode' } },
          edges: { type: 'array', items: { $ref: '#/components/schemas/LineageEdge' } }
        }
      },
      Finding: {
        type: 'object',
        required: ['id', 'projectId', 'type', 'severity', 'title', 'status'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          type: { type: 'string' },
          severity: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' }
        }
      },
      FindingResolution: {
        type: 'object',
        required: ['finding', 'idempotent'],
        properties: {
          finding: { $ref: '#/components/schemas/Finding' },
          idempotent: { type: 'boolean' }
        }
      },
      Evidence: {
        type: 'object',
        required: ['id', 'projectId', 'evidenceType', 'source', 'capturedAt'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          evidenceType: { type: 'string' },
          source: { type: 'string' },
          capturedAt: { type: 'string' },
          payload: { type: 'object' }
        }
      },
      Handoff: {
        type: 'object',
        required: ['status', 'departingMember', 'receivingMember', 'dueDate', 'workspaceLinks'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          status: { type: 'string' },
          departingMember: { type: 'string' },
          receivingMember: { type: 'string' },
          dueDate: { type: 'string' },
          workspaceLinks: { type: 'object' }
        }
      },
      AuditEvent: {
        type: 'object',
        required: ['id', 'timestamp', 'traceId', 'userSubject', 'action', 'resource', 'status'],
        properties: {
          id: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          traceId: { type: 'string' },
          userSubject: { type: 'string' },
          action: { type: 'string' },
          resource: { type: 'string' },
          status: { type: 'string' }
        }
      },
      SnapshotResult: {
        type: 'object',
        required: ['snapshot', 'changes'],
        properties: {
          snapshot: { $ref: '#/components/schemas/SnapshotSummary' },
          changes: { type: 'array', items: { $ref: '#/components/schemas/FileChange' } }
        }
      },
      ManifestImportResult: {
        type: 'object',
        required: ['bundleId', 'nodes', 'edges', 'evidence', 'projectId', 'snapshotId'],
        properties: {
          bundleId: { type: 'string' },
          nodes: { type: 'integer', minimum: 0 },
          edges: { type: 'integer', minimum: 0 },
          evidence: { type: 'integer', minimum: 0 },
          projectId: { type: 'string' },
          snapshotId: { type: 'string' },
          idempotent: { type: 'boolean' }
        }
      },
      BatchImportResult: {
        type: 'object',
        required: ['accepted', 'rejected', 'results'],
        properties: {
          accepted: { type: 'integer', minimum: 0 },
          rejected: { type: 'integer', minimum: 0 },
          results: { type: 'array', items: { type: 'object' } }
        }
      },
      Audit: {
        type: 'object',
        required: ['id', 'projectId', 'level', 'score', 'findings'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          resultId: { type: ['string', 'null'] },
          level: { enum: ['R0', 'R1', 'R2', 'R3', 'R4'] },
          score: { type: 'number', minimum: 0, maximum: 100 },
          resultScores: { type: 'array', items: { type: 'object' } },
          findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } }
        }
      },
      RepositorySyncResult: {
        type: 'object',
        required: ['repository', 'commits', 'pullRequests', 'workflowRuns', 'nodes', 'edges', 'evidence'],
        properties: {
          provider: { type: 'string' },
          repository: { type: 'object' },
          commits: { type: 'integer', minimum: 0 },
          pullRequests: { type: 'integer', minimum: 0 },
          workflowRuns: { type: 'integer', minimum: 0 },
          nodes: { type: 'integer', minimum: 0 },
          edges: { type: 'integer', minimum: 0 },
          evidence: { type: 'integer', minimum: 0 }
        }
      },
      ArtifactLineage: {
        type: 'object',
        required: ['root', 'nodes', 'edges', 'evidence', 'reproducibility'],
        properties: {
          root: { $ref: '#/components/schemas/LineageNode' },
          nodes: { type: 'array', items: { $ref: '#/components/schemas/LineageNode' } },
          edges: { type: 'array', items: { $ref: '#/components/schemas/LineageEdge' } },
          evidence: { type: 'array', items: { $ref: '#/components/schemas/Evidence' } },
          reproducibility: {
            type: 'object',
            required: ['resultId', 'level', 'score', 'verifiedRerun', 'missing', 'resultScores'],
            properties: {
              resultId: { type: ['string', 'null'] },
              level: { enum: ['R0', 'R1', 'R2', 'R3', 'R4'] },
              score: { type: 'number', minimum: 0, maximum: 100 },
              verifiedRerun: { type: 'boolean' },
              missing: { type: 'array', items: { type: 'string' } },
              resultScores: { type: 'array', items: { type: 'object' } }
            }
          }
        }
      },
      AgentResult: {
        type: 'object',
        required: ['response', 'toolCalls', 'model'],
        properties: {
          response: { type: 'string' },
          toolCalls: { type: 'array', items: { type: 'string' } },
          model: { type: 'string' },
          usage: { type: 'object' }
        }
      },
      HandoffReport: {
        type: 'object',
        required: ['id', 'handoffId', 'projectId', 'version', 'format', 'sha256', 'storageUri', 'createdAt'],
        properties: {
          id: { type: 'string' },
          handoffId: { type: 'string' },
          projectId: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          format: { const: 'markdown' },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          storageUri: { type: 'string' },
          markdown: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      HandoffExport: {
        type: 'object',
        required: ['status', 'exportId', 'files', 'sent'],
        properties: {
          status: { const: 'preview_created' },
          exportId: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'sha256', 'sizeBytes'],
              properties: {
                name: { type: 'string' },
                sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                sizeBytes: { type: 'integer', minimum: 0 }
              }
            }
          },
          sent: { const: false }
        }
      },
      WorkspaceHandoff: {
        type: 'object',
        required: ['idempotencyKey'],
        properties: {
          action: { const: 'preview' },
          status: { type: 'string' },
          idempotencyKey: { type: 'string' },
          drive: { type: 'object' },
          sheets: { type: 'object' },
          gmail: { type: 'object' },
          driveFileId: { type: 'string' },
          gmailDraftId: { type: 'string' },
          sent: { const: false }
        }
      },
      GitHubSyncRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['owner', 'repo'],
        properties: {
          owner: { type: 'string', minLength: 1, maxLength: 100 },
          repo: { type: 'string', minLength: 1, maxLength: 100 },
          branch: { type: 'string', maxLength: 250 },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      GitHubRepositorySyncRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'owner', 'repo'],
        properties: {
          provider: { const: 'github' },
          owner: { type: 'string', minLength: 1, maxLength: 100 },
          repo: { type: 'string', minLength: 1, maxLength: 100 },
          branch: { type: 'string', maxLength: 250 },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      Fingerprint: {
        type: 'object',
        required: ['algorithm', 'strength', 'value'],
        properties: {
          algorithm: { const: 'sha256' },
          strength: { enum: ['strong', 'sampled', 'metadata_only'] },
          value: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          sampling_policy: { type: 'string' }
        }
      },
      Manifest: {
        type: 'object',
        required: ['schema_version', 'bundle_id', 'project_key', 'records'],
        properties: {
          schema_version: { const: 'lablineage.manifest.v1' },
          bundle_id: { type: 'string', minLength: 1 },
          project_key: { type: 'string', minLength: 1 },
          captured_at: { type: 'string', format: 'date-time' },
          records: { type: 'array', maxItems: 50000, items: { type: 'object', additionalProperties: true } }
        }
      },
      SignedBundle: {
        type: 'object',
        required: ['manifest', 'signature'],
        properties: {
          manifest: { $ref: '#/components/schemas/Manifest' },
          signature: {
            type: 'object',
            required: ['algorithm', 'public_key_pem', 'value_base64'],
            properties: {
              algorithm: { const: 'Ed25519' },
              public_key_pem: { type: 'string' },
              value_base64: { type: 'string' }
            }
          }
        }
      },
      CreateSourceRequest: {
        type: 'object',
        required: ['name', 'type', 'networkMode'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 },
          type: { enum: ['filesystem', 'github', 'google_drive', 'offline_bundle'] },
          networkMode: { enum: ['connected', 'outbound_only', 'air_gapped'] },
          exportPolicy: {
            type: 'object',
            properties: {
              rawFileContent: { const: false },
              rawPaths: { const: false },
              signedBundlesRequired: { type: 'boolean', default: true }
            }
          }
        }
      },
      EdgeReviewRequest: {
        type: 'object',
        required: ['decision', 'comment'],
        properties: {
          decision: { enum: ['confirm', 'reject'] },
          comment: { type: 'string', minLength: 1, maxLength: 2000 },
          reviewer: { type: 'string', format: 'email', description: 'Ignored for authority; the authenticated subject is authoritative.' }
        }
      },
      StatusProposalRequest: {
        type: 'object',
        required: ['proposed_status', 'reason'],
        properties: {
          proposed_status: { enum: ['candidate', 'accepted', 'superseded', 'quarantined', 'duplicate'] },
          reason: { type: 'string', minLength: 1, maxLength: 2000 },
          replacement_asset_id: { type: 'string' }
        }
      },
      HandoffReportRequest: {
        type: 'object',
        required: ['format', 'include_sensitive_paths'],
        properties: {
          format: { const: 'markdown' },
          include_path_tokens: { type: 'boolean', default: true },
          include_sensitive_paths: { const: false },
          include_open_findings: { type: 'boolean', default: true },
          workspace_targets: { type: 'object', additionalProperties: false }
        }
      }
    }
  }
};
