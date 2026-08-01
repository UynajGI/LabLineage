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
  ['get', '/v1/projects/{projectId}', 'Read project details and the current objective version'],
  ['post', '/v1/projects/{projectId}/intent-versions', 'Create an immutable project objective version'],
  ['get', '/v1/projects/{projectId}/collectors', 'List collector pairings and registered devices'],
  ['post', '/v1/projects/{projectId}/collector-pairings', 'Create a short-lived one-time collector pairing code'],
  ['post', '/v1/collector/pairings/{pairingId}/claim', 'Claim a pairing with an Ed25519 device public key'],
  ['post', '/v1/projects/{projectId}/collectors/{collectorId}/revoke', 'Revoke a paired collector and disconnect its source'],
  ['post', '/v1/projects/{projectId}/collector-runs', 'Submit a signed local collector manifest and start analysis'],
  ['get', '/v1/projects/{projectId}/analysis-runs', 'List durable project analysis runs'],
  ['get', '/v1/projects/{projectId}/analysis-runs/{runId}', 'Read an analysis run, its real steps and events'],
  ['post', '/v1/projects/{projectId}/analysis-runs/{runId}/retry', 'Retry an allowed failed analysis step'],
  ['post', '/v1/projects/{projectId}/analysis-runs/{runId}/cancel', 'Cancel pending analysis work'],
  ['get', '/v1/projects/{projectId}/analysis-runs/{runId}/report', 'Read an immutable objective assessment report'],
  ['post', '/v1/projects/{projectId}/sources/github', 'Connect a read-only GitHub App repository and start analysis'],
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
  ['get', '/v1/projects/{projectId}/handoffs', 'List handoff orders for a project'],
  ['post', '/v1/projects/{projectId}/handoffs', 'Create a draft handoff order'],
  ['get', '/v1/handoffs/{handoffId}', 'Read one handoff order'],
  ['patch', '/v1/handoffs/{handoffId}', 'Update a draft handoff order'],
  ['post', '/v1/handoffs/{handoffId}/submit', 'Submit a handoff order for review'],
  ['post', '/v1/handoffs/{handoffId}/reviews', 'Record an approving or change-request review'],
  ['post', '/v1/handoffs/{handoffId}/accept', 'Receiver accepts the approved handoff'],
  ['post', '/v1/handoffs/{handoffId}/complete', 'Deterministically complete a handoff order'],
  ['post', '/v1/handoffs/{handoffId}/cancel', 'Cancel a handoff order'],
  ['get', '/v1/handoffs/{handoffId}/events', 'Read the append-only handoff event timeline'],
  ['post', '/v1/handoffs/{handoffId}/tasks/{taskId}/status', 'Update a handoff task status'],
  ['post', '/v1/handoffs/{handoffId}/exports/preview', 'Generate a preview bound to the handoff order'],
  ['post', '/v1/handoffs/{handoffId}/exports/execute', 'Execute the bound Workspace export'],
  ['get', '/v1/projects/{projectId}/audit-events', 'Read immutable audit events'],
  ['post', '/v1/projects/{projectId}/nodes/{nodeId}/confirm', 'Confirm an inferred node'],
  ['post', '/v1/projects/{projectId}/snapshots', 'Scan an allowlisted server directory'],
  ['post', '/v1/projects/{projectId}/archives', 'Upload a one-time fallback project archive and start analysis'],
  ['post', '/v1/projects/{projectId}/lineage-proposals', 'Apply an agent-inferred lineage proposal'],
  ['get', '/v1/projects/{projectId}/lineage-proposals', 'List lineage proposals for a project'],
  ['get', '/v1/projects/{projectId}/changes', 'Read latest project changes'],
  ['get', '/v1/projects/{projectId}/snapshots', 'List project snapshots'],
  ['get', '/v1/projects/{projectId}/snapshots/{snapshotId}/diff', 'Read a snapshot diff'],
  ['post', '/v1/manifests', 'Import one manifest bundle'],
  ['post', '/v1/manifests/batch', 'Import up to twenty isolated manifest bundles'],
  ['post', '/v1/projects/{projectId}/audits', 'Run deterministic reproducibility audit'],
  ['post', '/v1/projects/{projectId}/github/sync', 'Synchronize read-only GitHub evidence'],
  ['post', '/v1/projects/{projectId}/repositories/sync', 'Synchronize GitHub or allowlisted local Git evidence'],
  ['get', '/v1/artifacts/{artifactId}/lineage', 'Read bounded artifact lineage'],
  ['get', '/v1/projects/{projectId}/agent/conversations', 'List the actor-owned ADK conversations'],
  ['post', '/v1/projects/{projectId}/agent/conversations', 'Create a persistent ADK conversation'],
  ['delete', '/v1/projects/{projectId}/agent/conversations/{conversationId}', 'Clear one actor-owned ADK conversation'],
  ['post', '/v1/projects/{projectId}/agent', 'Invoke the read-only Guardian ADK agent'],
  ['post', '/v1/handoffs/{handoffId}/report', 'Generate a versioned immutable handoff report'],
  ['get', '/v1/handoffs/{handoffId}/reports/{reportId}', 'Read a generated handoff report'],
  ['post', '/v1/projects/{projectId}/handoffs/export', 'Create a local handoff preview'],
  ['post', '/v1/projects/{projectId}/handoffs/workspace', 'Preview or explicitly execute Workspace handoff'],
  ['get', '/v1/metrics', 'Read Prometheus metrics']
];

const responseStatus = new Map([
  ['post /v1/sources/{sourceId}/bundles', '202'],
  ['post /v1/projects/{projectId}/collector-pairings', '201'],
  ['post /v1/collector/pairings/{pairingId}/claim', '201'],
  ['post /v1/ingestion-jobs/{jobId}/retry', '202'],
  ['post /v1/projects/{projectId}/collector-runs', '202'],
  ['post /v1/projects/{projectId}/analysis-runs/{runId}/retry', '202'],
  ['post /v1/projects/{projectId}/analysis-runs/{runId}/cancel', '202'],
  ['post /v1/projects/{projectId}/sources/github', '202'],
  ['post /v1/projects/{projectId}/archives', '202'],
  ['post /v1/manifests', '202'],
  ['post /v1/manifests/batch', '207'],
  ['post /v1/projects/{projectId}/nodes/{nodeId}/confirm', '204'],
  ['delete /v1/projects/{projectId}/agent/conversations/{conversationId}', '204'],
  ['post /v1/projects/{projectId}/agent', '200'],
  ['post /v1/projects/{projectId}/handoffs', '201'],
  ['put /v1/setup', '204']
]);

const idempotencyRequired = new Set(
  routeDefinitions
    .filter(([method, route]) => route.startsWith('/v1/') && ['post', 'put', 'patch', 'delete'].includes(method))
    .map(([method, route]) => `${method} ${route}`)
);

const requestSchemaByRoute = {
  'post /v1/projects': { $ref: '#/components/schemas/CreateProjectRequest' },
  'post /v1/projects/{projectId}/intent-versions': { $ref: '#/components/schemas/CreateIntentVersionRequest' },
  'post /v1/projects/{projectId}/collector-pairings': {
    type: 'object', additionalProperties: false,
    properties: { expiresInSeconds: { type: 'integer', minimum: 60, maximum: 900, default: 600 } }
  },
  'post /v1/collector/pairings/{pairingId}/claim': {
    type: 'object', additionalProperties: false, required: ['code', 'publicKeyPem', 'deviceName'],
    properties: {
      code: { type: 'string', minLength: 8, maxLength: 32 },
      publicKeyPem: { type: 'string', minLength: 80, maxLength: 5000 },
      deviceName: { type: 'string', minLength: 1, maxLength: 160 }
    }
  },
  'post /v1/projects/{projectId}/collectors/{collectorId}/revoke': {
    type: 'object', additionalProperties: false, required: ['confirmation'],
    properties: { confirmation: { const: 'REVOKE_COLLECTOR' } }
  },
  'post /v1/projects/{projectId}/collector-runs': { $ref: '#/components/schemas/SignedBundle' },
  'post /v1/projects/{projectId}/analysis-runs/{runId}/retry': {
    type: 'object', additionalProperties: false, required: ['expectedVersion', 'confirmation'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      confirmation: { const: 'RETRY_ANALYSIS_RUN' }
    }
  },
  'post /v1/projects/{projectId}/analysis-runs/{runId}/cancel': {
    type: 'object', additionalProperties: false, required: ['expectedVersion', 'confirmation'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      confirmation: { const: 'CANCEL_ANALYSIS_RUN' }
    }
  },
  'post /v1/projects/{projectId}/sources/github': {
    type: 'object', additionalProperties: false, required: ['repository'],
    properties: {
      repository: { type: 'string', minLength: 3, maxLength: 300, description: 'github.com URL or owner/repo' },
      branch: { type: 'string', minLength: 1, maxLength: 250 }
    }
  },
  'post /v1/projects/{projectId}/sources': { $ref: '#/components/schemas/CreateSourceRequest' },
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
  'post /v1/projects/{projectId}/archives': {
    type: 'object',
    additionalProperties: false,
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: 'Project archive in .zip format' }
    }
  },
  'post /v1/projects/{projectId}/lineage-proposals': {
    type: 'object',
    additionalProperties: false,
    required: ['nodes', 'edges'],
    properties: {
      nodes: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['pathToken', 'kind'],
          properties: {
            pathToken: { type: 'string', minLength: 1 },
            kind: { type: 'string', enum: ['Project', 'CodeVersion', 'Dataset', 'ParameterSet', 'Environment', 'Run', 'Figure', 'Conclusion', 'Script', 'Data', 'Output'] },
            label: { type: 'string', minLength: 1, maxLength: 200 }
          }
        }
      },
      edges: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['source', 'target', 'relation'],
          properties: {
            source: { type: 'string', minLength: 1 },
            target: { type: 'string', minLength: 1 },
            relation: { type: 'string', enum: ['executed_as', 'used_input', 'used_parameter_set', 'used_environment', 'generated', 'supports'] }
          }
        }
      },
      rationale: { type: 'string', maxLength: 2000 }
    }
  },
  'post /v1/projects/{projectId}/agent/conversations': {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 }
    }
  },
  'post /v1/projects/{projectId}/agent': {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'conversationId'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 8000 },
      conversationId: { type: 'string', minLength: 8, maxLength: 100 }
    }
  },
  'post /v1/handoffs/{handoffId}/report': { $ref: '#/components/schemas/HandoffReportRequest' },
  'post /v1/projects/{projectId}/handoffs': {
    type: 'object',
    additionalProperties: false,
    required: ['departingSubject', 'departingEmailSnapshot', 'receivingSubject', 'receivingEmailSnapshot', 'reviewerSubject', 'reviewerEmailSnapshot'],
    properties: {
      departingSubject: { type: 'string', minLength: 1 },
      departingEmailSnapshot: { type: 'string', format: 'email' },
      receivingSubject: { type: 'string', minLength: 1 },
      receivingEmailSnapshot: { type: 'string', format: 'email' },
      reviewerSubject: { type: 'string', minLength: 1 },
      reviewerEmailSnapshot: { type: 'string', format: 'email' },
      dueAt: { type: 'string', format: 'date-time' },
      dueTimezone: { type: 'string' },
      tasks: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' }
          }
        }
      }
    }
  },
  'patch /v1/handoffs/{handoffId}': {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      departingSubject: { type: 'string', minLength: 1 },
      departingEmailSnapshot: { type: 'string', format: 'email' },
      receivingSubject: { type: 'string', minLength: 1 },
      receivingEmailSnapshot: { type: 'string', format: 'email' },
      reviewerSubject: { type: 'string', minLength: 1 },
      reviewerEmailSnapshot: { type: 'string', format: 'email' },
      dueAt: { type: 'string', format: 'date-time' },
      dueTimezone: { type: 'string' },
      tasks: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' }
          }
        }
      }
    }
  },
  'post /v1/handoffs/{handoffId}/submit': {
    type: 'object', additionalProperties: false, required: ['expectedVersion'],
    properties: { expectedVersion: { type: 'integer', minimum: 1 } }
  },
  'post /v1/handoffs/{handoffId}/reviews': {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion', 'decision', 'comment'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      decision: { type: 'string', enum: ['approved', 'changes_requested'] },
      comment: { type: 'string', minLength: 1 }
    }
  },
  'post /v1/handoffs/{handoffId}/accept': {
    type: 'object', additionalProperties: false, required: ['expectedVersion'],
    properties: { expectedVersion: { type: 'integer', minimum: 1 } }
  },
  'post /v1/handoffs/{handoffId}/complete': {
    type: 'object', additionalProperties: false, required: ['expectedVersion'],
    properties: { expectedVersion: { type: 'integer', minimum: 1 } }
  },
  'post /v1/handoffs/{handoffId}/cancel': {
    type: 'object', additionalProperties: false, required: ['expectedVersion'],
    properties: { expectedVersion: { type: 'integer', minimum: 1 } }
  },
  'post /v1/handoffs/{handoffId}/exports/preview': {
    type: 'object', additionalProperties: false, required: ['expectedVersion'],
    properties: { expectedVersion: { type: 'integer', minimum: 1 } }
  },
  'post /v1/handoffs/{handoffId}/tasks/{taskId}/status': {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion', 'status'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      status: { type: 'string', enum: ['pending', 'done', 'blocked'] }
    }
  },
  'post /v1/handoffs/{handoffId}/exports/execute': {
    type: 'object',
    additionalProperties: false,
    required: ['expectedVersion', 'previewSha256', 'confirmation'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 1 },
      previewSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      confirmation: { const: 'EXPORT_TO_GOOGLE_WORKSPACE' }
    }
  }
};

const responseSchemaByRoute = {
  'get /v1/projects': {
    type: 'array',
    items: { $ref: '#/components/schemas/ProjectSummary' }
  },
  'post /v1/projects': { $ref: '#/components/schemas/ProjectDetail' },
  'get /v1/projects/{projectId}': { $ref: '#/components/schemas/ProjectDetail' },
  'post /v1/projects/{projectId}/intent-versions': { $ref: '#/components/schemas/ProjectIntent' },
  'get /v1/projects/{projectId}/collectors': {
    type: 'object', additionalProperties: false, required: ['pairings', 'collectors'],
    properties: {
      pairings: { type: 'array', items: { $ref: '#/components/schemas/CollectorPairing' } },
      collectors: { type: 'array', items: { $ref: '#/components/schemas/CollectorCredential' } }
    }
  },
  'post /v1/projects/{projectId}/collector-pairings': { $ref: '#/components/schemas/CollectorPairingWithCode' },
  'post /v1/collector/pairings/{pairingId}/claim': { $ref: '#/components/schemas/CollectorClaimResponse' },
  'post /v1/projects/{projectId}/collectors/{collectorId}/revoke': { $ref: '#/components/schemas/CollectorCredential' },
  'post /v1/projects/{projectId}/collector-runs': { $ref: '#/components/schemas/AnalysisRunAccepted' },
  'post /v1/projects/{projectId}/sources/github': { $ref: '#/components/schemas/AnalysisRunAccepted' },
  'post /v1/projects/{projectId}/archives': { $ref: '#/components/schemas/AnalysisRunAccepted' },
  'get /v1/projects/{projectId}/analysis-runs': {
    type: 'object', additionalProperties: false, required: ['runs'],
    properties: { runs: { type: 'array', items: { $ref: '#/components/schemas/AnalysisRun' } } }
  },
  'get /v1/projects/{projectId}/analysis-runs/{runId}': { $ref: '#/components/schemas/AnalysisRun' },
  'post /v1/projects/{projectId}/analysis-runs/{runId}/retry': { $ref: '#/components/schemas/AnalysisRun' },
  'post /v1/projects/{projectId}/analysis-runs/{runId}/cancel': { $ref: '#/components/schemas/AnalysisRun' },
  'get /v1/projects/{projectId}/analysis-runs/{runId}/report': { $ref: '#/components/schemas/ObjectiveAssessmentReport' }
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
  const success = responseStatus.get(key) || (method === 'post' ? '201' : '200');
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
          [key === 'post /v1/projects/{projectId}/archives' ? 'multipart/form-data' : 'application/json']: {
            schema: requestSchemaByRoute[key] || { type: 'object', additionalProperties: true }
          }
        }
      }
    } : {}),
    responses: {
      [success]: {
        description: 'Successful response',
        ...(!['204'].includes(success) ? {
          content: { 'application/json': { schema: responseSchemaByRoute[key] || { type: 'object', additionalProperties: true } } }
        } : {})
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
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
      SuccessCriterionInput: {
        oneOf: [
          { type: 'string', minLength: 1, maxLength: 1000 },
          {
            type: 'object',
            additionalProperties: false,
            required: ['description'],
            properties: {
              description: { type: 'string', minLength: 1, maxLength: 1000 },
              required: { type: 'boolean', default: true }
            }
          }
        ]
      },
      KeyOutputInput: {
        oneOf: [
          { type: 'string', minLength: 1, maxLength: 300 },
          {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 300 },
              kind: { enum: ['artifact', 'code', 'dataset', 'figure', 'report', 'environment', 'other'], default: 'artifact' },
              expectedPathHint: { type: 'string', minLength: 1, maxLength: 500 },
              required: { type: 'boolean', default: true }
            }
          }
        ]
      },
      ProjectIntentInput: {
        type: 'object',
        required: ['objective', 'successCriteria'],
        properties: {
          objective: { type: 'string', minLength: 1, maxLength: 4000 },
          successCriteria: {
            type: 'array', minItems: 1, maxItems: 20,
            items: { $ref: '#/components/schemas/SuccessCriterionInput' }
          },
          keyOutputs: {
            type: 'array', maxItems: 20,
            items: { $ref: '#/components/schemas/KeyOutputInput' }
          },
          constraints: {
            type: 'array', maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 1000 }
          }
        }
      },
      CreateProjectRequest: {
        unevaluatedProperties: false,
        allOf: [
          { $ref: '#/components/schemas/ProjectIntentInput' },
          {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 120 },
              slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 120 }
            }
          }
        ]
      },
      CreateIntentVersionRequest: {
        unevaluatedProperties: false,
        allOf: [
          { $ref: '#/components/schemas/ProjectIntentInput' },
          {
            type: 'object',
            required: ['expectedVersion'],
            properties: { expectedVersion: { type: 'integer', minimum: 1 } }
          }
        ]
      },
      ProjectIntent: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'projectId', 'version', 'objective', 'constraints', 'legacy', 'createdBySubject', 'createdAt', 'successCriteria', 'keyOutputs'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          objective: { type: 'string' },
          constraints: { type: 'array', items: { type: 'string' } },
          legacy: { type: 'boolean' },
          createdBySubject: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          successCriteria: { type: 'array', items: { type: 'object', additionalProperties: true } },
          keyOutputs: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      ProjectSummary: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'slug', 'objective', 'intentVersion', 'intentConfigured', 'totalAssets', 'reproducibilityScores', 'openFindings', 'lastScan'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          objective: { type: ['string', 'null'] },
          intentVersion: { type: ['integer', 'null'] },
          intentConfigured: { type: 'boolean' },
          totalAssets: { type: 'integer', minimum: 0 },
          reproducibilityScores: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
          openFindings: { type: 'integer', minimum: 0 },
          lastScan: { type: 'string' }
        }
      },
      ProjectDetail: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'slug', 'createdAt', 'updatedAt', 'intent'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          currentIntentVersion: { type: 'integer', minimum: 1 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastScan: { type: 'string', format: 'date-time' },
          intent: { $ref: '#/components/schemas/ProjectIntent' }
        }
      },
      AnalysisRunStep: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'runId', 'projectId', 'name', 'status', 'attempt', 'artifactRefs', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string' },
          runId: { type: 'string' },
          projectId: { type: 'string' },
          name: { enum: ['ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize'] },
          status: { enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'] },
          attempt: { type: 'integer', minimum: 0 },
          inputSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
          outputSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
          artifactRefs: { type: 'array', items: { type: 'object', additionalProperties: true } },
          errorCode: { type: ['string', 'null'] },
          errorSummary: { type: ['string', 'null'] },
          startedAt: { type: ['string', 'null'], format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      CollectorPairing: {
        type: 'object', additionalProperties: false,
        required: ['id', 'projectId', 'status', 'createdBySubject', 'expiresAt', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string' }, projectId: { type: 'string' },
          status: { enum: ['pending', 'claimed', 'expired', 'revoked'] },
          collectorId: { type: 'string' }, sourceId: { type: 'string' },
          createdBySubject: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
          claimedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      CollectorPairingWithCode: {
        allOf: [
          { $ref: '#/components/schemas/CollectorPairing' },
          { type: 'object', required: ['code'], properties: { code: { type: 'string' } } }
        ]
      },
      CollectorCredential: {
        type: 'object', additionalProperties: false,
        required: ['id', 'collectorId', 'projectId', 'sourceId', 'pairingId', 'publicKeyFingerprint', 'status', 'expiresAt', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string' }, collectorId: { type: 'string' }, projectId: { type: 'string' },
          sourceId: { type: 'string' }, pairingId: { type: 'string' },
          publicKeyFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          status: { enum: ['active', 'revoked', 'expired'] },
          expiresAt: { type: 'string', format: 'date-time' },
          revokedAt: { type: 'string', format: 'date-time' },
          revokedBySubject: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      CollectorClaimResponse: {
        type: 'object', additionalProperties: false, required: ['pairing', 'collector', 'source', 'submitUrl'],
        properties: {
          pairing: { $ref: '#/components/schemas/CollectorPairing' },
          collector: { $ref: '#/components/schemas/CollectorCredential' },
          source: { type: 'object', additionalProperties: true },
          submitUrl: { type: 'string' }
        }
      },
      AnalysisRunAccepted: {
        type: 'object', additionalProperties: false,
        required: ['sourceId', 'runId', 'statusUrl', 'idempotent'],
        properties: {
          sourceId: { type: 'string' }, runId: { type: 'string' },
          statusUrl: { type: 'string' }, idempotent: { type: 'boolean' }
        }
      },
      AnalysisRunEvent: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'runId', 'projectId', 'eventType', 'actorSubject', 'payload', 'createdAt'],
        properties: {
          id: { type: 'string' },
          runId: { type: 'string' },
          projectId: { type: 'string' },
          eventType: { type: 'string' },
          actorSubject: { type: 'string' },
          payload: { type: 'object', additionalProperties: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      AnalysisReportSummary: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['id', 'overallStatus', 'coverageScore', 'createdAt'],
        properties: {
          id: { type: 'string' },
          overallStatus: { enum: ['supported', 'partial', 'missing', 'conflicted', 'not_assessable'] },
          coverageScore: { type: 'integer', minimum: 0, maximum: 100 },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      AnalysisRun: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'projectId', 'intentVersionId', 'intentVersion', 'sourceId', 'sourceRevision', 'status', 'currentStep', 'version', 'attempts', 'retryCount', 'deterministicReady', 'queuedAt', 'createdAt', 'updatedAt', 'steps', 'events', 'report'],
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          intentVersionId: { type: 'string' },
          intentVersion: { type: 'integer', minimum: 1 },
          sourceId: { type: ['string', 'null'] },
          sourceRevision: { type: ['string', 'null'] },
          status: { enum: ['queued', 'ingesting', 'scanning', 'graphing', 'auditing', 'summarizing', 'completed', 'partial', 'failed', 'cancelled'] },
          currentStep: { type: ['string', 'null'], enum: ['ingest', 'scan', 'graph', 'audit', 'goal_coverage', 'agent_summary', 'finalize', null] },
          version: { type: 'integer', minimum: 1 },
          attempts: { type: 'integer', minimum: 0 },
          retryCount: { type: 'integer', minimum: 0 },
          deterministicReady: { type: 'boolean' },
          errorCode: { type: ['string', 'null'] },
          errorSummary: { type: ['string', 'null'] },
          queuedAt: { type: 'string', format: 'date-time' },
          startedAt: { type: ['string', 'null'], format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          steps: { type: 'array', items: { $ref: '#/components/schemas/AnalysisRunStep' } },
          events: { type: 'array', items: { $ref: '#/components/schemas/AnalysisRunEvent' } },
          report: { $ref: '#/components/schemas/AnalysisReportSummary' }
        }
      },
      ObjectiveAssessmentReport: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'runId', 'projectId', 'intentVersionId', 'overallStatus', 'coverageScore', 'sha256', 'mediaType', 'createdAt', 'document'],
        properties: {
          id: { type: 'string' },
          runId: { type: 'string' },
          projectId: { type: 'string' },
          intentVersionId: { type: 'string' },
          auditExternalId: { type: ['string', 'null'] },
          overallStatus: { enum: ['supported', 'partial', 'missing', 'conflicted', 'not_assessable'] },
          coverageScore: { type: 'integer', minimum: 0, maximum: 100 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          mediaType: { type: 'string' },
          model: { type: ['string', 'null'] },
          traceId: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
          document: { type: 'object', additionalProperties: true }
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
