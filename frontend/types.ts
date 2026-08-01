export type ReproducibilityLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type NodeType = 'Project' | 'CodeVersion' | 'Dataset' | 'ParameterSet' | 'Environment' | 'Run' | 'Figure' | 'Conclusion';

export interface AgentConversation {
  id: string;
  projectId: string;
  actorId: string;
  title: string;
  updatedAt: string;
}

export interface AgentTraceItem {
  sequence: number;
  type: 'route' | 'agent' | 'tool_call' | 'tool_result' | 'error' | 'final';
  agent?: string;
  target?: string;
  tool?: string;
  message?: string;
  evidenceIds?: string[];
  reproducibility?: ReproducibilityLevel[];
  elapsedMs: number;
}

export interface AgentResponse {
  response: string;
  conversationId: string;
  route: 'evidence' | 'audit' | 'handoff';
  toolCalls: string[];
  trace: AgentTraceItem[];
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  durationMs: number;
}

export interface LineageNode {
  id: string;
  type: NodeType;
  label: string;
  status?: 'accepted' | 'candidate' | 'superseded' | 'missing' | 'conflict' | 'junk_suspected' | 'stale' | 'duplicate' | 'orphan' | 'failed_run' | 'unreproducible' | 'quarantined';
  reproducibility?: ReproducibilityLevel;
  details?: Record<string, string>;
  humanConfirmed?: boolean;
  evidenceIds?: string[];
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: 'exact' | 'strong' | 'inferred' | 'hypothesis' | 'human_verified' | 'unknown';
  humanConfirmed?: boolean;
  reviewStatus?: 'confirmed' | 'rejected';
  evidenceIds?: string[];
}

export interface Finding {
  id: string;
  type: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  affectedEntities: string[];
  proposedAction: string;
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'accepted_risk';
  evidenceIds?: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  totalAssets: number;
  reproducibilityScores: Record<ReproducibilityLevel, number>;
  openFindings: number;
  lastScan: string;
}

export interface HandoffStatus {
  status: 'draft' | 'pending_review' | 'approved';
  departingMember: string;
  receivingMember: string;
  dueDate: string;
  workspaceLinks: {
    drive?: string;
    sheets?: string;
    gmailDraft?: boolean;
  };
}

export type HandoffOrderStatus = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'receiver_accepted' | 'completed' | 'cancelled';

export interface HandoffTask {
  id: string;
  orderId: string;
  title: string;
  description: string;
  status: 'pending' | 'done' | 'blocked';
  sortOrder: number;
}

export interface HandoffReview {
  id: string;
  orderId: string;
  reviewerSubject: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}

export interface HandoffEvent {
  id: string;
  orderId: string;
  eventType: string;
  actorSubject: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface HandoffExport {
  id: string;
  orderId: string;
  kind: 'workspace' | 'local';
  previewSha256: string;
  status: 'in_progress' | 'succeeded' | 'failed';
  driveFileId?: string;
  gmailDraftId?: string;
}

export interface HandoffOrder {
  id: string;
  projectId: string;
  orderNumber: string;
  departingSubject: string;
  departingEmailSnapshot: string;
  receivingSubject: string;
  receivingEmailSnapshot: string;
  reviewerSubject: string;
  reviewerEmailSnapshot: string;
  dueAt: string | null;
  dueTimezone: string;
  status: HandoffOrderStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  tasks: HandoffTask[];
  reviews: HandoffReview[];
  exports: HandoffExport[];
}

  export interface FileChange {
    id: string;
    path: string;
    type: 'added' | 'modified' | 'deleted' | 'moved';
    oldHash?: string;
    newHash?: string;
    oldSizeBytes?: number;
    newSizeBytes?: number;
    sizeDiffBytes?: number;
    diffSnippet?: string;
    textDiff?: {
      available: boolean;
      format?: 'unified';
      reason?: string;
      oldLineCount?: number;
      newLineCount?: number;
      truncated?: boolean;
    };
    metadata?: {
      kind?: string;
      mediaType?: string;
      extension?: string | null;
      modifiedAt?: string;
    };
    metadataChanges?: Record<string, { before: unknown; after: unknown }>;
    inference?: {
      status: 'inferred';
      kind: 'move_candidate' | 'copy_candidate';
      confidence: string;
      basis: string[];
    };
  }

export interface SnapshotSummary {
  id: string;
  projectId: string;
  collectedAt: string;
    sourceLabel: string;
    fileCount: number;
    directoryRootHash?: string;
    baseline?: boolean;
    historyCoverage?: 'observed_from_capture';
    textDiffCapture?: 'authorized_redacted' | 'disabled';
    compressedIndex?: {
      encoding: string;
      sha256: string;
      originalBytes: number;
      compressedBytes: number;
    };
    warnings: string[];
  }

export interface AuditEvent {
  id: string;
  timestamp: string;
  traceId: string;
  userSubject: string;
  action: string;
  resource: string;
  status: 'success' | 'denied' | 'failed';
  details: string;
}

export interface SecuritySummary {
  actor: {
    subject: string;
    kind: string;
    roles: string[];
  };
  serviceActors: Array<{
    id: string;
    subject: string;
    roles: string[];
    projects: string[];
  }>;
  deniedLast24Hours: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: 'completed' | 'blocked_by_permissions' | 'needs_manual_approval';
  actionLink?: string;
}

export interface SetupConfig {
  institutionName: string;
  labName: string;
  adminDisplayName: string;
  adminEmail: string;
  dataResidency: string;
  defaultRegion: string;
  defaultTimezone: string;
  notificationLanguage: string;
  defaultProjectName: string;
  defaultProjectSlug: string;
  /** Legacy event-level fields; superseded by HandoffOrder and rejected on save. */
  departingMemberEmail?: string;
  receivingMemberEmail?: string;
  reviewerEmail?: string;
  handoffDueDate?: string;
}

export interface ProjectSuccessCriterion {
  id: string;
  intentId: string;
  projectId: string;
  description: string;
  required: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectKeyOutput {
  id: string;
  intentId: string;
  projectId: string;
  name: string;
  kind: 'artifact' | 'code' | 'dataset' | 'figure' | 'report' | 'environment' | 'other';
  expectedPathHint: string | null;
  required: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectIntent {
  id: string;
  projectId: string;
  version: number;
  objective: string;
  constraints: string[];
  legacy: boolean;
  createdBySubject: string;
  createdAt: string;
  successCriteria: ProjectSuccessCriterion[];
  keyOutputs: ProjectKeyOutput[];
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  objective: string;
  successCriteria: Array<{ description: string; required: boolean }>;
  keyOutputs: Array<{
    name: string;
    kind: ProjectKeyOutput['kind'];
    expectedPathHint?: string;
    required: boolean;
  }>;
  constraints: string[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  currentIntentVersion: number;
  intent: ProjectIntent;
}

export interface ProjectSource {
  id: string;
  projectId: string;
  name: string;
  type: 'filesystem' | 'github' | 'google_drive' | 'offline_bundle';
  networkMode: string;
  status: 'active' | 'disconnected' | 'pending' | 'error';
  collectorId?: string;
  exportPolicy?: {
    rawFileContent: boolean;
    rawPaths: boolean;
    signedBundlesRequired: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CollectorPairing {
  id: string;
  projectId: string;
  status: 'pending' | 'claimed' | 'expired';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  collectorId?: string;
  sourceId?: string;
  code?: string;
}

export interface CollectorCredential {
  id: string;
  collectorId: string;
  projectId: string;
  sourceId: string;
  pairingId: string;
  publicKeyFingerprint: string;
  status: 'active' | 'revoked';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export type AnalysisRunStatus = 'queued' | 'ingesting' | 'scanning' | 'graphing' | 'auditing' | 'summarizing' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface AnalysisRunStep {
  id: string;
  runId: string;
  projectId: string;
  name: 'ingest' | 'scan' | 'graph' | 'audit' | 'goal_coverage' | 'agent_summary' | 'finalize';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  attempt: number;
  errorCode?: string | null;
  errorSummary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  artifactRefs: AnalysisArtifactRef[];
}

export interface AnalysisArtifactRef {
  kind: 'snapshot' | 'github_revision' | 'lineage_graph' | 'audit' | 'objective_assessment_draft' | 'agent_trace' | 'analysis_report';
  id?: string;
  sha?: string;
  sha256?: string;
  projectId?: string;
  runId?: string;
  traceId?: string;
}

export interface AnalysisRunEventPayload {
  sourceId?: string | null;
  sourceRevision?: string | null;
  intentVersion?: number;
  step?: AnalysisRunStep['name'];
  attempt?: number;
  nextStep?: AnalysisRunStep['name'] | null;
  errorCode?: string;
  recoverableSummaryFailure?: boolean;
  fromStep?: AnalysisRunStep['name'];
}

export interface AnalysisRunEvent {
  id: string;
  runId: string;
  projectId: string;
  eventType: string;
  actorSubject: string;
  payload: AnalysisRunEventPayload;
  createdAt: string;
}

export interface AnalysisRun {
  id: string;
  projectId: string;
  intentVersionId: string;
  intentVersion: number;
  sourceId: string | null;
  sourceRevision: string | null;
  inputKind: 'collector_manifest' | 'github' | 'zip' | null;
  inputSha256: string | null;
  status: AnalysisRunStatus;
  currentStep: AnalysisRunStep['name'] | null;
  version: number;
  attempts: number;
  retryCount: number;
  deterministicReady: boolean;
  queuedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  steps: AnalysisRunStep[];
  events: AnalysisRunEvent[];
  report: { id: string; overallStatus: AssessmentStatus; coverageScore: number; createdAt: string } | null;
}

export type AssessmentStatus = 'supported' | 'partial' | 'missing' | 'conflicted' | 'not_assessable';

export interface AssessmentResult {
  id: string;
  kind: 'criterion' | 'key_output';
  label: string;
  required: boolean;
  sortOrder: number;
  status: AssessmentStatus;
  evidenceIds: string[];
  conflictIds: string[];
  reason: string;
}

export interface ObjectiveAssessmentDocument {
  schemaVersion: 'lablineage.objective-assessment.v1';
  intentVersionId: string;
  intentVersion: number;
  objective: string;
  overallStatus: AssessmentStatus;
  coverageScore: number;
  criterionResults: AssessmentResult[];
  keyOutputResults: AssessmentResult[];
  findingIds: string[];
  audit: { id: string; level: ReproducibilityLevel; score: number } | null;
  missingEvidence: Array<{ resultId: string; reason: string }>;
  conflicts: Array<{ resultId: string; findingIds: string[] }>;
  limitations: string[];
  runId: string;
  projectId: string;
  sourceId: string | null;
  sourceRevision: string | null;
  agentExplanation: string | null;
  agentTraceId: string | null;
  model: string | null;
  agentStatus: 'available' | 'unavailable';
  createdAt: string;
}

export interface ObjectiveAssessmentReport {
  id: string;
  runId: string;
  projectId: string;
  intentVersionId: string;
  overallStatus: AssessmentStatus;
  coverageScore: number;
  sha256: string;
  createdAt: string;
  document: ObjectiveAssessmentDocument;
}
