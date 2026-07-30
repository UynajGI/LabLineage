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
  departingMemberEmail: string;
  receivingMemberEmail: string;
  reviewerEmail: string;
  handoffDueDate: string;
}
