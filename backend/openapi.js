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

const responseStatuses = new Map([
  ['post /api/webhooks/github', ["202"]],
  ['put /v1/setup', ["204"]],
  ['post /v1/projects/{projectId}/sources', ["200","201"]],
  ['post /v1/sources/{sourceId}/disconnect', ["200"]],
  ['post /v1/sources/{sourceId}/bundles', ["202"]],
  ['post /v1/ingestion-jobs/{jobId}/retry', ["202"]],
  ['post /v1/lineage-edges/{edgeId}/review', ["200","201"]],
  ['post /v1/assets/{assetId}/status-proposals', ["200","201"]],
  ['post /v1/projects/{projectId}/findings/{findingId}/resolve', ["200","201"]],
  ['post /v1/projects/{projectId}/nodes/{nodeId}/confirm', ["204"]],
  ['post /v1/manifests', ["200","202"]],
  ['post /v1/manifests/batch', ["207"]],
  ['post /v1/projects/{projectId}/github/sync', ["202"]],
  ['post /v1/projects/{projectId}/repositories/sync', ["202"]],
  ['post /v1/projects/{projectId}/agent', ["200"]],
  ['post /v1/handoffs/{handoffId}/report', ["200","201"]],
  ['post /v1/projects/{projectId}/handoffs/workspace', ["200","201"]],
  ['post /v1/projects/{projectId}/collector-pairings', ["201"]],
  ['post /v1/collector/pairings/{pairingId}/claim', ["201"]],
  ['post /v1/projects/{projectId}/collector-runs', ["202"]],
  ['post /v1/projects/{projectId}/analysis-runs/{runId}/retry', ["202"]],
  ['post /v1/projects/{projectId}/analysis-runs/{runId}/cancel', ["202"]],
  ['post /v1/projects/{projectId}/sources/github', ["202"]],
  ['post /v1/projects/{projectId}/archives', ["202"]],
  ['delete /v1/projects/{projectId}/agent/conversations/{conversationId}', ["204"]],
  ['post /v1/projects/{projectId}/handoffs', ["201"]]
]);

const idempotencyRequired = new Set(
  routeDefinitions
    .filter(([method, route]) => route.startsWith('/v1/') && ['post', 'put', 'patch', 'delete'].includes(method))
    .map(([method, route]) => `${method} ${route}`)
);

const requestSchemaByRoute = {
  'post /api/webhooks/github': {"type":"object","minProperties":1,"additionalProperties":true},
  'put /v1/setup': {"type":"object","additionalProperties":false,"required":["institutionName","labName","adminDisplayName","adminEmail","dataResidency","defaultRegion","defaultTimezone","notificationLanguage","defaultProjectName","defaultProjectSlug","departingMemberEmail","receivingMemberEmail","reviewerEmail","handoffDueDate"],"properties":{"institutionName":{"type":"string"},"labName":{"type":"string"},"adminDisplayName":{"type":"string"},"adminEmail":{"type":"string"},"dataResidency":{"type":"string"},"defaultRegion":{"type":"string"},"defaultTimezone":{"type":"string"},"notificationLanguage":{"type":"string"},"defaultProjectName":{"type":"string"},"defaultProjectSlug":{"type":"string"},"departingMemberEmail":{"type":"string"},"receivingMemberEmail":{"type":"string"},"reviewerEmail":{"type":"string"},"handoffDueDate":{"type":"string"}}},
  'post /v1/projects': {"$ref":"#/components/schemas/CreateProjectRequest"},
  'post /v1/projects/{projectId}/sources': {"$ref":"#/components/schemas/CreateSourceRequest"},
  'post /v1/sources/{sourceId}/disconnect': {"type":"object","additionalProperties":false,"required":["confirmation"],"properties":{"confirmation":{"const":"DISCONNECT_SOURCE"}}},
  'post /v1/sources/{sourceId}/bundles': {"oneOf":[{"$ref":"#/components/schemas/Manifest"},{"$ref":"#/components/schemas/SignedBundle"}]},
  'post /v1/ingestion-jobs/{jobId}/retry': {"type":"object","additionalProperties":false,"required":["confirmation","manifest"],"properties":{"confirmation":{"const":"RETRY_INGESTION_JOB"},"manifest":{"$ref":"#/components/schemas/Manifest"}}},
  'post /v1/lineage-edges/{edgeId}/review': {"$ref":"#/components/schemas/EdgeReviewRequest"},
  'post /v1/assets/{assetId}/status-proposals': {"$ref":"#/components/schemas/StatusProposalRequest"},
  'post /v1/projects/{projectId}/findings/{findingId}/resolve': {"type":"object","additionalProperties":false,"required":["confirmation"],"properties":{"confirmation":{"const":"RESOLVE_FINDING"},"note":{"type":"string","maxLength":1000}}},
  'post /v1/projects/{projectId}/nodes/{nodeId}/confirm': {"type":"object","additionalProperties":false},
  'post /v1/projects/{projectId}/snapshots': {"type":"object","additionalProperties":false,"required":["path"],"properties":{"path":{"type":"string","minLength":1},"includeTextDiff":{"type":"boolean","default":false},"confirmation":{"type":"string","enum":["ALLOW_TEXT_DIFF"]}},"if":{"required":["includeTextDiff"],"properties":{"includeTextDiff":{"const":true}}},"then":{"required":["confirmation"]}},
  'post /v1/manifests': {"oneOf":[{"$ref":"#/components/schemas/Manifest"},{"$ref":"#/components/schemas/SignedBundle"}]},
  'post /v1/manifests/batch': {"type":"object","additionalProperties":false,"required":["manifests"],"properties":{"manifests":{"type":"array","minItems":1,"maxItems":20,"items":{"oneOf":[{"$ref":"#/components/schemas/Manifest"},{"$ref":"#/components/schemas/SignedBundle"}]}}}},
  'post /v1/projects/{projectId}/audits': {"type":"object","additionalProperties":false},
  'post /v1/projects/{projectId}/github/sync': {"$ref":"#/components/schemas/GitHubSyncRequest"},
  'post /v1/projects/{projectId}/repositories/sync': {"oneOf":[{"$ref":"#/components/schemas/GitHubRepositorySyncRequest"},{"type":"object","additionalProperties":false,"required":["provider","path"],"properties":{"provider":{"const":"local_git"},"path":{"type":"string","minLength":1,"maxLength":4096},"branch":{"type":"string","maxLength":250},"limit":{"type":"integer","minimum":1,"maximum":100},"treeLimit":{"type":"integer","minimum":1,"maximum":100000}}}]},
  'post /v1/projects/{projectId}/agent': {"type":"object","additionalProperties":false,"required":["message","conversationId"],"properties":{"message":{"type":"string","minLength":1,"maxLength":8000},"conversationId":{"type":"string","minLength":8,"maxLength":100}}},
  'post /v1/handoffs/{handoffId}/report': {"$ref":"#/components/schemas/HandoffReportRequest"},
  'post /v1/projects/{projectId}/handoffs/export': {"type":"object","additionalProperties":false,"required":["confirmation"],"properties":{"confirmation":{"const":"CREATE_LOCAL_HANDOFF_PREVIEW"}}},
  'post /v1/projects/{projectId}/handoffs/workspace': {"type":"object","additionalProperties":false,"required":["action","idempotencyKey"],"properties":{"action":{"enum":["preview","execute"]},"confirmation":{"const":"EXPORT_TO_GOOGLE_WORKSPACE"},"idempotencyKey":{"type":"string","minLength":8,"maxLength":200},"recipient":{"type":"string","format":"email"}},"if":{"properties":{"action":{"const":"execute"}}},"then":{"required":["confirmation"]}},
  'post /v1/projects/{projectId}/intent-versions': {"$ref":"#/components/schemas/CreateIntentVersionRequest"},
  'post /v1/projects/{projectId}/collector-pairings': {"type":"object","additionalProperties":false,"properties":{"expiresInSeconds":{"type":"integer","minimum":60,"maximum":900,"default":600}}},
  'post /v1/collector/pairings/{pairingId}/claim': {"type":"object","additionalProperties":false,"required":["code","publicKeyPem","deviceName"],"properties":{"code":{"type":"string","minLength":8,"maxLength":32},"publicKeyPem":{"type":"string","minLength":80,"maxLength":5000},"deviceName":{"type":"string","minLength":1,"maxLength":160}}},
  'post /v1/projects/{projectId}/collectors/{collectorId}/revoke': {"type":"object","additionalProperties":false,"required":["confirmation"],"properties":{"confirmation":{"const":"REVOKE_COLLECTOR"}}},
  'post /v1/projects/{projectId}/collector-runs': {"$ref":"#/components/schemas/SignedBundle"},
  'post /v1/projects/{projectId}/analysis-runs/{runId}/retry': {"type":"object","additionalProperties":false,"required":["expectedVersion","confirmation"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"confirmation":{"const":"RETRY_ANALYSIS_RUN"}}},
  'post /v1/projects/{projectId}/analysis-runs/{runId}/cancel': {"type":"object","additionalProperties":false,"required":["expectedVersion","confirmation"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"confirmation":{"const":"CANCEL_ANALYSIS_RUN"}}},
  'post /v1/projects/{projectId}/sources/github': {"type":"object","additionalProperties":false,"required":["repository"],"properties":{"repository":{"type":"string","minLength":3,"maxLength":300,"description":"github.com URL or owner/repo"},"branch":{"type":"string","minLength":1,"maxLength":250}}},
  'post /v1/projects/{projectId}/archives': {"type":"object","additionalProperties":false,"required":["file"],"properties":{"file":{"type":"string","format":"binary","description":"Project archive in .zip format"}}},
  'post /v1/projects/{projectId}/lineage-proposals': {"type":"object","additionalProperties":false,"required":["nodes","edges"],"properties":{"nodes":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","additionalProperties":false,"required":["pathToken","kind"],"properties":{"pathToken":{"type":"string","minLength":1},"kind":{"type":"string","enum":["Project","CodeVersion","Dataset","ParameterSet","Environment","Run","Figure","Conclusion","Script","Data","Output"]},"label":{"type":"string","minLength":1,"maxLength":200}}}},"edges":{"type":"array","minItems":1,"maxItems":200,"items":{"type":"object","additionalProperties":false,"required":["source","target","relation"],"properties":{"source":{"type":"string","minLength":1},"target":{"type":"string","minLength":1},"relation":{"type":"string","enum":["executed_as","used_input","used_parameter_set","used_environment","generated","supports"]}}}},"rationale":{"type":"string","maxLength":2000}}},
  'post /v1/projects/{projectId}/agent/conversations': {"type":"object","additionalProperties":false,"properties":{"title":{"type":"string","minLength":1,"maxLength":200}}},
  'post /v1/projects/{projectId}/handoffs': {"type":"object","additionalProperties":false,"required":["departingSubject","departingEmailSnapshot","receivingSubject","receivingEmailSnapshot","reviewerSubject","reviewerEmailSnapshot"],"properties":{"departingSubject":{"type":"string","minLength":1},"departingEmailSnapshot":{"type":"string","format":"email"},"receivingSubject":{"type":"string","minLength":1},"receivingEmailSnapshot":{"type":"string","format":"email"},"reviewerSubject":{"type":"string","minLength":1},"reviewerEmailSnapshot":{"type":"string","format":"email"},"dueAt":{"type":"string","format":"date-time"},"dueTimezone":{"type":"string"},"tasks":{"type":"array","maxItems":50,"items":{"type":"object","additionalProperties":false,"required":["title"],"properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"}}}}}},
  'patch /v1/handoffs/{handoffId}': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"departingSubject":{"type":"string","minLength":1},"departingEmailSnapshot":{"type":"string","format":"email"},"receivingSubject":{"type":"string","minLength":1},"receivingEmailSnapshot":{"type":"string","format":"email"},"reviewerSubject":{"type":"string","minLength":1},"reviewerEmailSnapshot":{"type":"string","format":"email"},"dueAt":{"type":"string","format":"date-time"},"dueTimezone":{"type":"string"},"tasks":{"type":"array","maxItems":50,"items":{"type":"object","additionalProperties":false,"required":["title"],"properties":{"title":{"type":"string","minLength":1},"description":{"type":"string"}}}}}},
  'post /v1/handoffs/{handoffId}/submit': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}},
  'post /v1/handoffs/{handoffId}/reviews': {"type":"object","additionalProperties":false,"required":["expectedVersion","decision","comment"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"decision":{"type":"string","enum":["approved","changes_requested"]},"comment":{"type":"string","minLength":1}}},
  'post /v1/handoffs/{handoffId}/accept': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}},
  'post /v1/handoffs/{handoffId}/complete': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}},
  'post /v1/handoffs/{handoffId}/cancel': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}},
  'post /v1/handoffs/{handoffId}/exports/preview': {"type":"object","additionalProperties":false,"required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}},
  'post /v1/handoffs/{handoffId}/tasks/{taskId}/status': {"type":"object","additionalProperties":false,"required":["expectedVersion","status"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"status":{"type":"string","enum":["pending","done","blocked"]}}},
  'post /v1/handoffs/{handoffId}/exports/execute': {"type":"object","additionalProperties":false,"required":["expectedVersion","previewSha256","confirmation"],"properties":{"expectedVersion":{"type":"integer","minimum":1},"previewSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"confirmation":{"const":"EXPORT_TO_GOOGLE_WORKSPACE"}}},
  'delete /v1/projects/{projectId}/agent/conversations/{conversationId}': {"type":"object","additionalProperties":false}
};

const responseSchemaByRoute = {
  'get /api/health': {"$ref":"#/components/schemas/Health"},
  'get /api/ready': {"$ref":"#/components/schemas/Readiness"},
  'get /api/client-config': {"$ref":"#/components/schemas/ClientConfig"},
  'get /api/version': {"$ref":"#/components/schemas/Version"},
  'get /api/openapi.json': {"type":"object","required":["openapi","info","paths"],"properties":{"openapi":{"type":"string"},"info":{"type":"object"},"paths":{"type":"object"}}},
  'post /api/webhooks/github': {"$ref":"#/components/schemas/WebhookAcceptance"},
  'get /v1/setup': {"$ref":"#/components/schemas/SetupConfig"},
  'get /v1/integrations/status': {"$ref":"#/components/schemas/IntegrationStatus"},
  'get /v1/capabilities': {"$ref":"#/components/schemas/Capabilities"},
  'get /v1/security/summary': {"$ref":"#/components/schemas/SecuritySummary"},
  'get /v1/projects': {"type":"array","items":{"$ref":"#/components/schemas/ProjectSummary"}},
  'post /v1/projects': {"$ref":"#/components/schemas/ProjectDetail"},
  'get /v1/projects/{projectId}/sources': {"type":"array","items":{"$ref":"#/components/schemas/Source"}},
  'post /v1/projects/{projectId}/sources': {"$ref":"#/components/schemas/Source"},
  'post /v1/sources/{sourceId}/disconnect': {"$ref":"#/components/schemas/Source"},
  'get /v1/sources/{sourceId}/changes': {"type":"array","items":{"$ref":"#/components/schemas/FileChange"}},
  'get /v1/sources/{sourceId}/snapshots': {"type":"array","items":{"$ref":"#/components/schemas/SnapshotSummary"}},
  'post /v1/sources/{sourceId}/bundles': {"$ref":"#/components/schemas/IngestionJob"},
  'get /v1/ingestion-jobs/{jobId}': {"$ref":"#/components/schemas/IngestionJob"},
  'post /v1/ingestion-jobs/{jobId}/retry': {"$ref":"#/components/schemas/IngestionJob"},
  'post /v1/lineage-edges/{edgeId}/review': {"$ref":"#/components/schemas/EdgeReview"},
  'post /v1/assets/{assetId}/status-proposals': {"$ref":"#/components/schemas/StatusProposal"},
  'get /v1/projects/{projectId}/summary': {"$ref":"#/components/schemas/ProjectSummary"},
  'get /v1/projects/{projectId}/lineage': {"$ref":"#/components/schemas/LineageGraph"},
  'get /v1/projects/{projectId}/findings': {"type":"array","items":{"$ref":"#/components/schemas/Finding"}},
  'post /v1/projects/{projectId}/findings/{findingId}/resolve': {"$ref":"#/components/schemas/FindingResolution"},
  'get /v1/projects/{projectId}/evidence': {"type":"array","items":{"$ref":"#/components/schemas/Evidence"}},
  'get /v1/projects/{projectId}/evidence/{evidenceId}': {"$ref":"#/components/schemas/Evidence"},
  'get /v1/projects/{projectId}/handoff': {"$ref":"#/components/schemas/Handoff"},
  'get /v1/projects/{projectId}/audit-events': {"type":"array","items":{"$ref":"#/components/schemas/AuditEvent"}},
  'post /v1/projects/{projectId}/snapshots': {"$ref":"#/components/schemas/SnapshotResult"},
  'get /v1/projects/{projectId}/changes': {"type":"array","items":{"$ref":"#/components/schemas/FileChange"}},
  'get /v1/projects/{projectId}/snapshots': {"type":"array","items":{"$ref":"#/components/schemas/SnapshotSummary"}},
  'get /v1/projects/{projectId}/snapshots/{snapshotId}/diff': {"type":"array","items":{"$ref":"#/components/schemas/FileChange"}},
  'post /v1/manifests': {"$ref":"#/components/schemas/ManifestImportResult"},
  'post /v1/manifests/batch': {"$ref":"#/components/schemas/BatchImportResult"},
  'post /v1/projects/{projectId}/audits': {"$ref":"#/components/schemas/Audit"},
  'post /v1/projects/{projectId}/github/sync': {"$ref":"#/components/schemas/RepositorySyncResult"},
  'post /v1/projects/{projectId}/repositories/sync': {"$ref":"#/components/schemas/RepositorySyncResult"},
  'get /v1/artifacts/{artifactId}/lineage': {"$ref":"#/components/schemas/ArtifactLineage"},
  'post /v1/projects/{projectId}/agent': {"$ref":"#/components/schemas/AgentResult"},
  'post /v1/handoffs/{handoffId}/report': {"$ref":"#/components/schemas/HandoffReport"},
  'get /v1/handoffs/{handoffId}/reports/{reportId}': {"$ref":"#/components/schemas/HandoffReport"},
  'post /v1/projects/{projectId}/handoffs/export': {"$ref":"#/components/schemas/HandoffExport"},
  'post /v1/projects/{projectId}/handoffs/workspace': {"$ref":"#/components/schemas/WorkspaceHandoff"},
  'get /v1/projects/{projectId}': {"$ref":"#/components/schemas/ProjectDetail"},
  'post /v1/projects/{projectId}/intent-versions': {"$ref":"#/components/schemas/ProjectIntent"},
  'get /v1/projects/{projectId}/collectors': {"type":"object","additionalProperties":false,"required":["pairings","collectors"],"properties":{"pairings":{"type":"array","items":{"$ref":"#/components/schemas/CollectorPairing"}},"collectors":{"type":"array","items":{"$ref":"#/components/schemas/CollectorCredential"}}}},
  'post /v1/projects/{projectId}/collector-pairings': {"$ref":"#/components/schemas/CollectorPairingWithCode"},
  'post /v1/collector/pairings/{pairingId}/claim': {"$ref":"#/components/schemas/CollectorClaimResponse"},
  'post /v1/projects/{projectId}/collectors/{collectorId}/revoke': {"$ref":"#/components/schemas/CollectorCredential"},
  'post /v1/projects/{projectId}/collector-runs': {"$ref":"#/components/schemas/AnalysisRunAccepted"},
  'post /v1/projects/{projectId}/sources/github': {"$ref":"#/components/schemas/AnalysisRunAccepted"},
  'post /v1/projects/{projectId}/archives': {"$ref":"#/components/schemas/AnalysisRunAccepted"},
  'get /v1/projects/{projectId}/analysis-runs': {"type":"object","additionalProperties":false,"required":["runs"],"properties":{"runs":{"type":"array","items":{"$ref":"#/components/schemas/AnalysisRun"}}}},
  'get /v1/projects/{projectId}/analysis-runs/{runId}': {"$ref":"#/components/schemas/AnalysisRun"},
  'post /v1/projects/{projectId}/analysis-runs/{runId}/retry': {"$ref":"#/components/schemas/AnalysisRun"},
  'post /v1/projects/{projectId}/analysis-runs/{runId}/cancel': {"$ref":"#/components/schemas/AnalysisRun"},
  'get /v1/projects/{projectId}/analysis-runs/{runId}/report': {"$ref":"#/components/schemas/ObjectiveAssessmentReport"},
  'get /v1/projects/{projectId}/handoffs': {"type":"object","additionalProperties":false,"required":["orders"],"properties":{"orders":{"type":"array","items":{"$ref":"#/components/schemas/HandoffOrder"}}}},
  'post /v1/projects/{projectId}/handoffs': {"$ref":"#/components/schemas/HandoffOrder"},
  'get /v1/handoffs/{handoffId}': {"$ref":"#/components/schemas/HandoffOrder"},
  'patch /v1/handoffs/{handoffId}': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/submit': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/reviews': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/accept': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/complete': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/cancel': {"$ref":"#/components/schemas/HandoffOrder"},
  'get /v1/handoffs/{handoffId}/events': {"type":"object","additionalProperties":false,"required":["events"],"properties":{"events":{"type":"array","items":{"$ref":"#/components/schemas/HandoffEvent"}}}},
  'post /v1/handoffs/{handoffId}/tasks/{taskId}/status': {"$ref":"#/components/schemas/HandoffOrder"},
  'post /v1/handoffs/{handoffId}/exports/preview': {"type":"object","additionalProperties":false,"required":["preview","sha256"],"properties":{"preview":{"$ref":"#/components/schemas/HandoffOrder"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}}},
  'post /v1/handoffs/{handoffId}/exports/execute': {"$ref":"#/components/schemas/HandoffExportResult"},
  'post /v1/projects/{projectId}/lineage-proposals': {"type":"object","additionalProperties":false,"required":["proposalId","addedNodes","addedEdges","addedEvidence","nodes","edges","confidence","requiresHumanReview"],"properties":{"proposalId":{"type":"string"},"addedNodes":{"type":"integer","minimum":0},"addedEdges":{"type":"integer","minimum":0},"addedEvidence":{"type":"integer","minimum":0},"nodes":{"type":"array","items":{"type":"object"}},"edges":{"type":"array","items":{"type":"object"}},"confidence":{"const":"inferred"},"requiresHumanReview":{"const":true}}},
  'get /v1/projects/{projectId}/lineage-proposals': {"type":"array","items":{"type":"object","additionalProperties":false,"required":["proposalId","source","actor","rationale","nodeCount","edgeCount","createdAt"],"properties":{"proposalId":{"type":"string"},"source":{"type":"string"},"actor":{"type":"string"},"rationale":{"type":"string"},"nodeCount":{"type":"integer","minimum":0},"edgeCount":{"type":"integer","minimum":0},"createdAt":{"type":"string","format":"date-time"}}}},
  'get /v1/projects/{projectId}/agent/conversations': {"type":"object","additionalProperties":false,"required":["conversations"],"properties":{"conversations":{"type":"array","items":{"type":"object"}}}},
  'post /v1/projects/{projectId}/agent/conversations': {"type":"object","additionalProperties":true}
};

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (name) => ({ type: 'array', items: schemaRef(name) });

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
    ...(['post', 'put', 'patch', 'delete'].includes(method) ? {
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
      Error: {"type":"object","required":["error"],"properties":{"error":{"type":"string"},"requestId":{"type":"string"},"issues":{"type":"array","items":{"type":"object","additionalProperties":true}}}},
      Health: {"type":"object","required":["status","version","authMode","database","adkConfigured","model"],"properties":{"status":{"const":"ok"},"version":{"type":"string"},"authMode":{"type":"string"},"database":{"type":"string"},"adkConfigured":{"type":"boolean"},"model":{"type":"string"}}},
      Readiness: {"type":"object","required":["status","database","objectStorage"],"properties":{"status":{"const":"ready"},"database":{"enum":["postgresql","json-development"]},"objectStorage":{"type":"object","required":["mode","writable","readable"],"properties":{"mode":{"enum":["local","gcs"]},"writable":{"const":true},"readable":{"const":true}}}}},
      NotReady: {"type":"object","required":["status","code"],"properties":{"status":{"const":"not_ready"},"code":{"type":"string"},"issues":{"type":"array","items":{"type":"string"}}}},
      ClientConfig: {"type":"object","required":["mode","enabled"],"properties":{"mode":{"type":"string"},"enabled":{"type":"boolean"},"issuer":{"type":"string","format":"uri"},"clientId":{"type":"string"},"authorizationEndpoint":{"type":"string","format":"uri"},"tokenEndpoint":{"type":"string","format":"uri"},"redirectUri":{"type":"string"},"scope":{"type":"string"}}},
      Version: {"type":"object","required":["api","implementation","manifestSchema","collectorMinimumNode"],"properties":{"api":{"const":"v1"},"implementation":{"type":"string"},"manifestSchema":{"type":"string"},"collectorMinimumNode":{"type":"string"}}},
      WebhookAcceptance: {"type":"object","required":["accepted"],"properties":{"accepted":{"type":"boolean"},"ignored":{"type":"boolean"},"duplicate":{"type":"boolean"},"event":{"type":"string"},"evidence":{"type":"integer","minimum":0},"reason":{"type":"string"}}},
      SetupConfig: {"type":"object","required":["institutionName","labName","adminDisplayName","adminEmail","dataResidency","defaultRegion","defaultTimezone","notificationLanguage","defaultProjectName","defaultProjectSlug","departingMemberEmail","receivingMemberEmail","reviewerEmail","handoffDueDate"],"properties":{"institutionName":{"type":"string"},"labName":{"type":"string"},"adminDisplayName":{"type":"string"},"adminEmail":{"type":"string"},"dataResidency":{"type":"string"},"defaultRegion":{"type":"string"},"defaultTimezone":{"type":"string"},"notificationLanguage":{"type":"string"},"defaultProjectName":{"type":"string"},"defaultProjectSlug":{"type":"string"},"departingMemberEmail":{"type":"string"},"receivingMemberEmail":{"type":"string"},"reviewerEmail":{"type":"string"},"handoffDueDate":{"type":"string"}}},
      IntegrationStatus: {"type":"object","required":["github","workspace","collector","objectStorage"],"properties":{"github":{"type":"object"},"workspace":{"type":"object"},"collector":{"type":"object"},"objectStorage":{"type":"object"}}},
      Capabilities: {"type":"object","required":["actor","capabilities"],"properties":{"actor":{"type":"object","required":["subject","kind","roles"]},"capabilities":{"type":"array","items":{"type":"object","required":["id","title","state","detail"],"properties":{"id":{"type":"string"},"title":{"type":"string"},"state":{"enum":["ready","configured","development","not_configured"]},"detail":{"type":"string"}}}}}},
      SecuritySummary: {"type":"object","required":["actor","serviceActors","deniedLast24Hours"],"properties":{"actor":{"type":"object"},"serviceActors":{"type":"array","items":{"type":"object"}},"deniedLast24Hours":{"type":"integer","minimum":0}}},
      Project: {"type":"object","required":["id","name","slug","createdAt","updatedAt"],"properties":{"id":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}}},
      ProjectSummary: {"type":"object","additionalProperties":false,"required":["id","name","slug","objective","intentVersion","intentConfigured","totalAssets","reproducibilityScores","openFindings","lastScan"],"properties":{"id":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"objective":{"type":["string","null"]},"intentVersion":{"type":["integer","null"]},"intentConfigured":{"type":"boolean"},"totalAssets":{"type":"integer","minimum":0},"reproducibilityScores":{"type":"object","additionalProperties":{"type":"integer","minimum":0}},"openFindings":{"type":"integer","minimum":0},"lastScan":{"type":"string"}}},
      Source: {"type":"object","required":["id","projectId","name","type","networkMode","status"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"name":{"type":"string"},"type":{"enum":["filesystem","github","google_drive","offline_bundle"]},"networkMode":{"enum":["connected","outbound_only","air_gapped"]},"status":{"enum":["active","disconnected"]},"idempotent":{"type":"boolean"}}},
      FileChange: {"type":"object","required":["id","path","type","evidence"],"properties":{"id":{"type":"string"},"path":{"type":"string"},"type":{"enum":["added","modified","deleted","moved"]},"oldHash":{"type":"string"},"newHash":{"type":"string"},"evidence":{"type":"object"},"inference":{"type":"object","properties":{"status":{"const":"inferred"},"kind":{"enum":["move_candidate","copy_candidate"]},"confidence":{"type":"string"}}}}},
      SnapshotSummary: {"type":"object","required":["id","projectId","fileCount"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"sourceId":{"type":["string","null"]},"fileCount":{"type":"integer","minimum":0},"collectedAt":{"type":"string"},"baseline":{"type":"boolean"}}},
      IngestionJob: {"type":"object","required":["id","projectId","status","attempts"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"sourceId":{"type":"string"},"bundleId":{"type":"string"},"status":{"enum":["queued","processing","completed","failed"]},"attempts":{"type":"integer","minimum":0}}},
      EdgeReview: {"type":"object","required":["id","edgeId","projectId","decision","comment","reviewer","createdAt"],"properties":{"id":{"type":"string"},"edgeId":{"type":"string"},"projectId":{"type":"string"},"decision":{"enum":["confirm","reject"]},"comment":{"type":"string"},"reviewer":{"type":"string"},"createdAt":{"type":"string","format":"date-time"}}},
      StatusProposal: {"type":"object","required":["id","projectId","assetId","proposedStatus","status","proposedBy","createdAt"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"assetId":{"type":"string"},"proposedStatus":{"type":"string"},"status":{"const":"pending"},"proposedBy":{"type":"string"},"createdAt":{"type":"string","format":"date-time"}}},
      LineageNode: {"type":"object","required":["id","type","label"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"type":{"type":"string"},"label":{"type":"string"},"status":{"type":"string"}}},
      LineageEdge: {"type":"object","required":["source","target","relation"],"properties":{"id":{"type":"string"},"source":{"type":"string"},"target":{"type":"string"},"relation":{"type":"string"},"confidence":{"type":"string"}}},
      LineageGraph: {"type":"object","required":["nodes","edges"],"properties":{"nodes":{"type":"array","items":{"$ref":"#/components/schemas/LineageNode"}},"edges":{"type":"array","items":{"$ref":"#/components/schemas/LineageEdge"}}}},
      Finding: {"type":"object","required":["id","projectId","type","severity","title","status"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"type":{"type":"string"},"severity":{"type":"string"},"title":{"type":"string"},"status":{"type":"string"}}},
      FindingResolution: {"type":"object","required":["finding","idempotent"],"properties":{"finding":{"$ref":"#/components/schemas/Finding"},"idempotent":{"type":"boolean"}}},
      Evidence: {"type":"object","required":["id","projectId","evidenceType","source","capturedAt"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"evidenceType":{"type":"string"},"source":{"type":"string"},"capturedAt":{"type":"string"},"payload":{"type":"object"}}},
      Handoff: {"type":"object","required":["status","departingMember","receivingMember","dueDate","workspaceLinks"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"status":{"type":"string"},"departingMember":{"type":"string"},"receivingMember":{"type":"string"},"dueDate":{"type":"string"},"workspaceLinks":{"type":"object"}}},
      HandoffOrder: {"type":"object","additionalProperties":false,"required":["id","projectId","orderNumber","departingSubject","departingEmailSnapshot","receivingSubject","receivingEmailSnapshot","reviewerSubject","reviewerEmailSnapshot","status","version","overdue","tasks","reviews","exports","createdAt","updatedAt"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"orderNumber":{"type":"integer","minimum":1},"departingSubject":{"type":"string"},"departingEmailSnapshot":{"type":"string","format":"email"},"receivingSubject":{"type":"string"},"receivingEmailSnapshot":{"type":"string","format":"email"},"reviewerSubject":{"type":"string"},"reviewerEmailSnapshot":{"type":"string","format":"email"},"dueAt":{"type":["string","null"],"format":"date-time"},"dueTimezone":{"type":"string"},"status":{"enum":["draft","submitted","in_review","approved","changes_requested","receiver_accepted","completed","cancelled"]},"version":{"type":"integer","minimum":1},"overdue":{"type":"boolean"},"tasks":{"type":"array","items":{"$ref":"#/components/schemas/HandoffTask"}},"reviews":{"type":"array","items":{"$ref":"#/components/schemas/HandoffReview"}},"exports":{"type":"array","items":{"$ref":"#/components/schemas/HandoffExport"}},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}}},
      HandoffTask: {"type":"object","additionalProperties":false,"required":["id","orderId","title","status","sortOrder","createdAt"],"properties":{"id":{"type":"string"},"orderId":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"status":{"enum":["pending","done","blocked"]},"sortOrder":{"type":"integer","minimum":0},"createdAt":{"type":"string","format":"date-time"}}},
      HandoffReview: {"type":"object","additionalProperties":false,"required":["id","orderId","reviewer","decision","comment","createdAt"],"properties":{"id":{"type":"string"},"orderId":{"type":"string"},"reviewer":{"type":"string"},"decision":{"enum":["approved","changes_requested"]},"comment":{"type":"string"},"createdAt":{"type":"string","format":"date-time"}}},
      HandoffEvent: {"type":"object","additionalProperties":false,"required":["id","orderId","eventType","actorSubject","createdAt"],"properties":{"id":{"type":"string"},"orderId":{"type":"string"},"eventType":{"type":"string"},"actorSubject":{"type":"string"},"payload":{"type":"object","additionalProperties":true},"createdAt":{"type":"string","format":"date-time"}}},
      HandoffExportResult: {"type":"object","additionalProperties":false,"required":["status","exportId","previewSha256","driveFileId","gmailDraftId","sent"],"properties":{"status":{"const":"succeeded"},"exportId":{"type":"string"},"previewSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"driveFileId":{"type":"string"},"gmailDraftId":{"type":"string"},"sent":{"const":false}}},
      AuditEvent: {"type":"object","required":["id","timestamp","traceId","userSubject","action","resource","status"],"properties":{"id":{"type":"string"},"timestamp":{"type":"string","format":"date-time"},"traceId":{"type":"string"},"userSubject":{"type":"string"},"action":{"type":"string"},"resource":{"type":"string"},"status":{"type":"string"}}},
      SnapshotResult: {"type":"object","required":["snapshot","changes"],"properties":{"snapshot":{"$ref":"#/components/schemas/SnapshotSummary"},"changes":{"type":"array","items":{"$ref":"#/components/schemas/FileChange"}}}},
      ManifestImportResult: {"type":"object","required":["bundleId","nodes","edges","evidence","projectId","snapshotId"],"properties":{"bundleId":{"type":"string"},"nodes":{"type":"integer","minimum":0},"edges":{"type":"integer","minimum":0},"evidence":{"type":"integer","minimum":0},"projectId":{"type":"string"},"snapshotId":{"type":"string"},"idempotent":{"type":"boolean"}}},
      BatchImportResult: {"type":"object","required":["accepted","rejected","results"],"properties":{"accepted":{"type":"integer","minimum":0},"rejected":{"type":"integer","minimum":0},"results":{"type":"array","items":{"type":"object"}}}},
      Audit: {"type":"object","required":["id","projectId","level","score","findings"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"resultId":{"type":["string","null"]},"level":{"enum":["R0","R1","R2","R3","R4"]},"score":{"type":"number","minimum":0,"maximum":100},"resultScores":{"type":"array","items":{"type":"object"}},"findings":{"type":"array","items":{"$ref":"#/components/schemas/Finding"}}}},
      RepositorySyncResult: {"type":"object","required":["repository","commits","pullRequests","workflowRuns","nodes","edges","evidence"],"properties":{"provider":{"type":"string"},"repository":{"type":"object"},"commits":{"type":"integer","minimum":0},"pullRequests":{"type":"integer","minimum":0},"workflowRuns":{"type":"integer","minimum":0},"nodes":{"type":"integer","minimum":0},"edges":{"type":"integer","minimum":0},"evidence":{"type":"integer","minimum":0}}},
      ArtifactLineage: {"type":"object","required":["root","nodes","edges","evidence","reproducibility"],"properties":{"root":{"$ref":"#/components/schemas/LineageNode"},"nodes":{"type":"array","items":{"$ref":"#/components/schemas/LineageNode"}},"edges":{"type":"array","items":{"$ref":"#/components/schemas/LineageEdge"}},"evidence":{"type":"array","items":{"$ref":"#/components/schemas/Evidence"}},"reproducibility":{"type":"object","required":["resultId","level","score","verifiedRerun","missing","resultScores"],"properties":{"resultId":{"type":["string","null"]},"level":{"enum":["R0","R1","R2","R3","R4"]},"score":{"type":"number","minimum":0,"maximum":100},"verifiedRerun":{"type":"boolean"},"missing":{"type":"array","items":{"type":"string"}},"resultScores":{"type":"array","items":{"type":"object"}}}}}},
      AgentResult: {"type":"object","required":["response","toolCalls","model"],"properties":{"response":{"type":"string"},"toolCalls":{"type":"array","items":{"type":"string"}},"model":{"type":"string"},"usage":{"type":"object"}}},
      HandoffReport: {"type":"object","required":["id","handoffId","projectId","version","format","sha256","storageUri","createdAt"],"properties":{"id":{"type":"string"},"handoffId":{"type":"string"},"projectId":{"type":"string"},"version":{"type":"integer","minimum":1},"format":{"const":"markdown"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"storageUri":{"type":"string"},"markdown":{"type":"string"},"createdAt":{"type":"string","format":"date-time"}}},
      HandoffExport: {"type":"object","required":["status","exportId","files","sent"],"properties":{"status":{"const":"preview_created"},"exportId":{"type":"string"},"files":{"type":"array","items":{"type":"object","required":["name","sha256","sizeBytes"],"properties":{"name":{"type":"string"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"sizeBytes":{"type":"integer","minimum":0}}}},"sent":{"const":false}}},
      WorkspaceHandoff: {"type":"object","required":["idempotencyKey"],"properties":{"action":{"const":"preview"},"status":{"type":"string"},"idempotencyKey":{"type":"string"},"drive":{"type":"object"},"sheets":{"type":"object"},"gmail":{"type":"object"},"driveFileId":{"type":"string"},"gmailDraftId":{"type":"string"},"sent":{"const":false}}},
      GitHubSyncRequest: {"type":"object","additionalProperties":false,"required":["owner","repo"],"properties":{"owner":{"type":"string","minLength":1,"maxLength":100},"repo":{"type":"string","minLength":1,"maxLength":100},"branch":{"type":"string","maxLength":250},"limit":{"type":"integer","minimum":1,"maximum":100}}},
      GitHubRepositorySyncRequest: {"type":"object","additionalProperties":false,"required":["provider","owner","repo"],"properties":{"provider":{"const":"github"},"owner":{"type":"string","minLength":1,"maxLength":100},"repo":{"type":"string","minLength":1,"maxLength":100},"branch":{"type":"string","maxLength":250},"limit":{"type":"integer","minimum":1,"maximum":100}}},
      Fingerprint: {"type":"object","required":["algorithm","strength","value"],"properties":{"algorithm":{"const":"sha256"},"strength":{"enum":["strong","sampled","metadata_only"]},"value":{"type":"string","pattern":"^[a-f0-9]{64}$"},"sampling_policy":{"type":"string"}}},
      Manifest: {"type":"object","required":["schema_version","bundle_id","project_key","records"],"properties":{"schema_version":{"const":"lablineage.manifest.v1"},"bundle_id":{"type":"string","minLength":1},"project_key":{"type":"string","minLength":1},"captured_at":{"type":"string","format":"date-time"},"records":{"type":"array","maxItems":50000,"items":{"type":"object","additionalProperties":true}}}},
      SignedBundle: {"type":"object","required":["manifest","signature"],"properties":{"manifest":{"$ref":"#/components/schemas/Manifest"},"signature":{"type":"object","required":["algorithm","public_key_pem","value_base64"],"properties":{"algorithm":{"const":"Ed25519"},"public_key_pem":{"type":"string"},"value_base64":{"type":"string"}}}}},
      CreateSourceRequest: {"type":"object","required":["name","type","networkMode"],"properties":{"name":{"type":"string","minLength":1,"maxLength":160},"type":{"enum":["filesystem","github","google_drive","offline_bundle"]},"networkMode":{"enum":["connected","outbound_only","air_gapped"]},"exportPolicy":{"type":"object","properties":{"rawFileContent":{"const":false},"rawPaths":{"const":false},"signedBundlesRequired":{"type":"boolean","default":true}}}}},
      EdgeReviewRequest: {"type":"object","required":["decision","comment"],"properties":{"decision":{"enum":["confirm","reject"]},"comment":{"type":"string","minLength":1,"maxLength":2000},"reviewer":{"type":"string","format":"email","description":"Ignored for authority; the authenticated subject is authoritative."}}},
      StatusProposalRequest: {"type":"object","required":["proposed_status","reason"],"properties":{"proposed_status":{"enum":["candidate","accepted","superseded","quarantined","duplicate"]},"reason":{"type":"string","minLength":1,"maxLength":2000},"replacement_asset_id":{"type":"string"}}},
      HandoffReportRequest: {"type":"object","required":["format","include_sensitive_paths"],"properties":{"format":{"const":"markdown"},"include_path_tokens":{"type":"boolean","default":true},"include_sensitive_paths":{"const":false},"include_open_findings":{"type":"boolean","default":true},"workspace_targets":{"type":"object","additionalProperties":false}}},
      SuccessCriterionInput: {"oneOf":[{"type":"string","minLength":1,"maxLength":1000},{"type":"object","additionalProperties":false,"required":["description"],"properties":{"description":{"type":"string","minLength":1,"maxLength":1000},"required":{"type":"boolean","default":true}}}]},
      KeyOutputInput: {"oneOf":[{"type":"string","minLength":1,"maxLength":300},{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":300},"kind":{"enum":["artifact","code","dataset","figure","report","environment","other"],"default":"artifact"},"expectedPathHint":{"type":"string","minLength":1,"maxLength":500},"required":{"type":"boolean","default":true}}}]},
      ProjectIntentInput: {"type":"object","required":["objective","successCriteria"],"properties":{"objective":{"type":"string","minLength":1,"maxLength":4000},"successCriteria":{"type":"array","minItems":1,"maxItems":20,"items":{"$ref":"#/components/schemas/SuccessCriterionInput"}},"keyOutputs":{"type":"array","maxItems":20,"items":{"$ref":"#/components/schemas/KeyOutputInput"}},"constraints":{"type":"array","maxItems":20,"items":{"type":"string","minLength":1,"maxLength":1000}}}},
      CreateProjectRequest: {"unevaluatedProperties":false,"allOf":[{"$ref":"#/components/schemas/ProjectIntentInput"},{"type":"object","required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":120},"slug":{"type":"string","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","maxLength":120}}}]},
      CreateIntentVersionRequest: {"unevaluatedProperties":false,"allOf":[{"$ref":"#/components/schemas/ProjectIntentInput"},{"type":"object","required":["expectedVersion"],"properties":{"expectedVersion":{"type":"integer","minimum":1}}}]},
      ProjectIntent: {"type":"object","additionalProperties":false,"required":["id","projectId","version","objective","constraints","legacy","createdBySubject","createdAt","successCriteria","keyOutputs"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"version":{"type":"integer","minimum":1},"objective":{"type":"string"},"constraints":{"type":"array","items":{"type":"string"}},"legacy":{"type":"boolean"},"createdBySubject":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"successCriteria":{"type":"array","items":{"type":"object","additionalProperties":true}},"keyOutputs":{"type":"array","items":{"type":"object","additionalProperties":true}}}},
      ProjectDetail: {"type":"object","additionalProperties":false,"required":["id","name","slug","createdAt","updatedAt","intent"],"properties":{"id":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"currentIntentVersion":{"type":"integer","minimum":1},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"lastScan":{"type":"string","format":"date-time"},"intent":{"$ref":"#/components/schemas/ProjectIntent"}}},
      AnalysisRunStep: {"type":"object","additionalProperties":false,"required":["id","runId","projectId","name","status","attempt","artifactRefs","createdAt","updatedAt"],"properties":{"id":{"type":"string"},"runId":{"type":"string"},"projectId":{"type":"string"},"name":{"enum":["ingest","scan","graph","audit","goal_coverage","agent_summary","finalize"]},"status":{"enum":["pending","running","succeeded","failed","skipped","cancelled"]},"attempt":{"type":"integer","minimum":0},"inputSha256":{"type":["string","null"],"pattern":"^[a-f0-9]{64}$"},"outputSha256":{"type":["string","null"],"pattern":"^[a-f0-9]{64}$"},"artifactRefs":{"type":"array","items":{"type":"object","additionalProperties":true}},"errorCode":{"type":["string","null"]},"errorSummary":{"type":["string","null"]},"startedAt":{"type":["string","null"],"format":"date-time"},"completedAt":{"type":["string","null"],"format":"date-time"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}}},
      CollectorPairing: {"type":"object","additionalProperties":false,"required":["id","projectId","status","createdBySubject","expiresAt","createdAt","updatedAt"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"status":{"enum":["pending","claimed","expired","revoked"]},"collectorId":{"type":"string"},"sourceId":{"type":"string"},"createdBySubject":{"type":"string"},"expiresAt":{"type":"string","format":"date-time"},"claimedAt":{"type":"string","format":"date-time"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}}},
      CollectorPairingWithCode: {"allOf":[{"$ref":"#/components/schemas/CollectorPairing"},{"type":"object","required":["code"],"properties":{"code":{"type":"string"}}}]},
      CollectorCredential: {"type":"object","additionalProperties":false,"required":["id","collectorId","projectId","sourceId","pairingId","publicKeyFingerprint","status","expiresAt","createdAt","updatedAt"],"properties":{"id":{"type":"string"},"collectorId":{"type":"string"},"projectId":{"type":"string"},"sourceId":{"type":"string"},"pairingId":{"type":"string"},"publicKeyFingerprint":{"type":"string","pattern":"^[a-f0-9]{64}$"},"status":{"enum":["active","revoked","expired"]},"expiresAt":{"type":"string","format":"date-time"},"revokedAt":{"type":"string","format":"date-time"},"revokedBySubject":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}}},
      CollectorClaimResponse: {"type":"object","additionalProperties":false,"required":["pairing","collector","source","submitUrl"],"properties":{"pairing":{"$ref":"#/components/schemas/CollectorPairing"},"collector":{"$ref":"#/components/schemas/CollectorCredential"},"source":{"type":"object","additionalProperties":true},"submitUrl":{"type":"string"}}},
      AnalysisRunAccepted: {"type":"object","additionalProperties":false,"required":["sourceId","runId","statusUrl","idempotent"],"properties":{"sourceId":{"type":"string"},"runId":{"type":"string"},"statusUrl":{"type":"string"},"idempotent":{"type":"boolean"}}},
      AnalysisRunEvent: {"type":"object","additionalProperties":false,"required":["id","runId","projectId","eventType","actorSubject","payload","createdAt"],"properties":{"id":{"type":"string"},"runId":{"type":"string"},"projectId":{"type":"string"},"eventType":{"type":"string"},"actorSubject":{"type":"string"},"payload":{"type":"object","additionalProperties":true},"createdAt":{"type":"string","format":"date-time"}}},
      AnalysisReportSummary: {"type":["object","null"],"additionalProperties":false,"required":["id","overallStatus","coverageScore","createdAt"],"properties":{"id":{"type":"string"},"overallStatus":{"enum":["supported","partial","missing","conflicted","not_assessable"]},"coverageScore":{"type":"integer","minimum":0,"maximum":100},"createdAt":{"type":"string","format":"date-time"}}},
      AnalysisRun: {"type":"object","additionalProperties":false,"required":["id","projectId","intentVersionId","intentVersion","sourceId","sourceRevision","status","currentStep","version","attempts","retryCount","deterministicReady","queuedAt","createdAt","updatedAt","steps","events","report"],"properties":{"id":{"type":"string"},"projectId":{"type":"string"},"intentVersionId":{"type":"string"},"intentVersion":{"type":"integer","minimum":1},"sourceId":{"type":["string","null"]},"sourceRevision":{"type":["string","null"]},"status":{"enum":["queued","ingesting","scanning","graphing","auditing","summarizing","completed","partial","failed","cancelled"]},"currentStep":{"type":["string","null"],"enum":["ingest","scan","graph","audit","goal_coverage","agent_summary","finalize",null]},"version":{"type":"integer","minimum":1},"attempts":{"type":"integer","minimum":0},"retryCount":{"type":"integer","minimum":0},"deterministicReady":{"type":"boolean"},"errorCode":{"type":["string","null"]},"errorSummary":{"type":["string","null"]},"queuedAt":{"type":"string","format":"date-time"},"startedAt":{"type":["string","null"],"format":"date-time"},"completedAt":{"type":["string","null"],"format":"date-time"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"steps":{"type":"array","items":{"$ref":"#/components/schemas/AnalysisRunStep"}},"events":{"type":"array","items":{"$ref":"#/components/schemas/AnalysisRunEvent"}},"report":{"$ref":"#/components/schemas/AnalysisReportSummary"}}},
      ObjectiveAssessmentReport: {"type":"object","additionalProperties":false,"required":["id","runId","projectId","intentVersionId","overallStatus","coverageScore","sha256","mediaType","createdAt","document"],"properties":{"id":{"type":"string"},"runId":{"type":"string"},"projectId":{"type":"string"},"intentVersionId":{"type":"string"},"auditExternalId":{"type":["string","null"]},"overallStatus":{"enum":["supported","partial","missing","conflicted","not_assessable"]},"coverageScore":{"type":"integer","minimum":0,"maximum":100},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"mediaType":{"type":"string"},"model":{"type":["string","null"]},"traceId":{"type":["string","null"]},"createdAt":{"type":"string","format":"date-time"},"document":{"type":"object","additionalProperties":true}}}
    }
  }
};
