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
  ['post', '/v1/projects/{projectId}/archives', 'Upload a project archive (zip) and scan it'],
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
  ['post /v1/ingestion-jobs/{jobId}/retry', '202'],
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
          'application/json': {
            schema: requestSchemaByRoute[key] || { type: 'object', additionalProperties: true }
          }
        }
      }
    } : {}),
    responses: {
      [success]: {
        description: 'Successful response',
        ...(!['204'].includes(success) ? {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } }
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
