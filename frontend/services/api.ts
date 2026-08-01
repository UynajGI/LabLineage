import type {
  AgentConversation,
  AgentResponse,
  AuditEvent,
  FileChange,
  Finding,
  HandoffEvent,
  HandoffOrder,
  HandoffStatus,
  LineageEdge,
  LineageNode,
  ProjectSummary,
  SecuritySummary,
  SnapshotSummary,
  SetupConfig
} from '../types';
import { getAccessToken } from './auth';

const API_ROOT = '';
type CapabilitiesResponse = {
  actor: { subject: string; kind: string; roles: string[] };
  capabilities: Array<{ id: string; title: string; state: 'ready' | 'configured' | 'development' | 'not_configured'; detail: string }>;
};
let activeProjectId: string | null = null;
let projectIdRequest: Promise<string> | null = null;
let projectsRequest: Promise<ProjectSummary[]> | null = null;
let capabilitiesRequest: Promise<CapabilitiesResponse> | null = null;

const TRANSIENT_GET_RETRY_DELAYS_MS = [150, 300, 600];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const idempotencyKey = ['GET', 'HEAD', 'OPTIONS'].includes(method)
    ? null
    : globalThis.crypto.randomUUID();
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= TRANSIENT_GET_RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${url}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...init?.headers
        }
      });
    } catch (error) {
      lastNetworkError = error;
      if (method !== 'GET' || attempt >= TRANSIENT_GET_RETRY_DELAYS_MS.length) throw error;
      await delay(TRANSIENT_GET_RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const shouldRetry = method === 'GET'
      && response.status >= 500
      && attempt < TRANSIENT_GET_RETRY_DELAYS_MS.length;
    if (shouldRetry) {
      await delay(TRANSIENT_GET_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error('Backend request failed');
}

async function projectId(): Promise<string> {
  if (activeProjectId) return activeProjectId;
  projectIdRequest ||= (async () => {
    const projects = await request<ProjectSummary[]>('/v1/projects');
    if (!projects[0]) throw new Error('No project exists. Create or seed a project first.');
    const preferred = typeof localStorage === 'undefined' ? null : localStorage.getItem('lablineage.activeProjectId');
    activeProjectId = preferred && projects.some((project) => project.id === preferred) ? preferred : projects[0].id;
    return activeProjectId!;
  })();
  try {
    return await projectIdRequest;
  } catch (error) {
    projectIdRequest = null;
    throw error;
  }
}

export const api = {
  async listProjects(): Promise<ProjectSummary[]> {
    projectsRequest ||= request<ProjectSummary[]>('/v1/projects').catch((error) => {
      projectsRequest = null;
      throw error;
    });
    return projectsRequest;
  },

  selectProject(projectId: string) {
    activeProjectId = projectId;
    projectIdRequest = Promise.resolve(projectId);
    if (typeof localStorage !== 'undefined') localStorage.setItem('lablineage.activeProjectId', projectId);
  },

  async getCapabilities(): Promise<CapabilitiesResponse> {
    capabilitiesRequest ||= request<CapabilitiesResponse>('/v1/capabilities').catch((error) => {
      capabilitiesRequest = null;
      throw error;
    });
    return await capabilitiesRequest;
  },

  async getSecuritySummary(): Promise<SecuritySummary> {
    return request('/v1/security/summary');
  },

  async getSetupConfig(): Promise<SetupConfig> {
    return request('/v1/setup');
  },

  async saveSetupConfig(config: SetupConfig): Promise<void> {
    await request('/v1/setup', { method: 'PUT', body: JSON.stringify(config) });
  },

  async getProjectSummary(): Promise<ProjectSummary> {
    return request(`/v1/projects/${await projectId()}/summary`);
  },

  async getLineage(): Promise<{ nodes: LineageNode[]; edges: LineageEdge[] }> {
    return request(`/v1/projects/${await projectId()}/lineage`);
  },

  async getFindings(): Promise<Finding[]> {
    return request(`/v1/projects/${await projectId()}/findings`);
  },

  async resolveFinding(findingId: string, note?: string): Promise<{ finding: Finding; idempotent: boolean }> {
    return request(`/v1/projects/${await projectId()}/findings/${encodeURIComponent(findingId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'RESOLVE_FINDING', note })
    });
  },

  async getHandoffStatus(): Promise<HandoffStatus> {
    return request(`/v1/projects/${await projectId()}/handoff`);
  },

  async listHandoffOrders(filter?: string): Promise<HandoffOrder[]> {
    const query = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    const body = await request<{ orders: HandoffOrder[] }>(`/v1/projects/${await projectId()}/handoffs${query}`);
    return body.orders;
  },

  async createHandoffOrder(input: {
    departingSubject: string;
    departingEmailSnapshot: string;
    receivingSubject: string;
    receivingEmailSnapshot: string;
    reviewerSubject: string;
    reviewerEmailSnapshot: string;
    dueAt: string | null;
    dueTimezone: string;
    tasks?: Array<{ title: string; description?: string }>;
  }): Promise<HandoffOrder> {
    return request(`/v1/projects/${await projectId()}/handoffs`, { method: 'POST', body: JSON.stringify(input) });
  },

  async getHandoffOrder(orderId: string): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}`);
  },

  async updateHandoffOrder(orderId: string, patch: { expectedVersion: number; departingSubject?: string; departingEmailSnapshot?: string; receivingSubject?: string; receivingEmailSnapshot?: string; reviewerSubject?: string; reviewerEmailSnapshot?: string; dueAt?: string | null; dueTimezone?: string; tasks?: Array<{ title: string; description?: string }> }): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async submitHandoffOrder(orderId: string, expectedVersion: number): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}/submit`, { method: 'POST', body: JSON.stringify({ expectedVersion }) });
  },

  async reviewHandoffOrder(orderId: string, expectedVersion: number, decision: 'approved' | 'changes_requested', comment: string): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}/reviews`, { method: 'POST', body: JSON.stringify({ expectedVersion, decision, comment }) });
  },

  async acceptHandoffOrder(orderId: string, expectedVersion: number): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}/accept`, { method: 'POST', body: JSON.stringify({ expectedVersion }) });
  },

  async completeHandoffOrder(orderId: string, expectedVersion: number): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}/complete`, { method: 'POST', body: JSON.stringify({ expectedVersion }) });
  },

  async cancelHandoffOrder(orderId: string, expectedVersion: number): Promise<HandoffOrder> {
    return request(`/v1/handoffs/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ expectedVersion }) });
  },

  async getHandoffOrderEvents(orderId: string): Promise<HandoffEvent[]> {
    const body = await request<{ events: HandoffEvent[] }>(`/v1/handoffs/${orderId}/events`);
    return body.events;
  },

  async previewHandoffExport(orderId: string): Promise<{ preview: { orderId: string; orderNumber: string; drive: { name: string; bytes: number }; sheets: { auditId: string; row: string }; gmail: { to: string; subject: string; mode: string } }; sha256: string }> {
    const order = await this.getHandoffOrder(orderId);
    return request(`/v1/handoffs/${orderId}/exports/preview`, { method: 'POST', body: JSON.stringify({ expectedVersion: order.version }) });
  },

  async executeHandoffExport(orderId: string, expectedVersion: number, previewSha256: string): Promise<{ status: string; exportId: string; driveFileId?: string; gmailDraftId?: string; sent: boolean }> {
    return request(`/v1/handoffs/${orderId}/exports/execute`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion, previewSha256, confirmation: 'EXPORT_TO_GOOGLE_WORKSPACE' })
    });
  },

  async getFileChanges(): Promise<FileChange[]> {
    return request(`/v1/projects/${await projectId()}/changes`);
  },

  async getSnapshots(): Promise<SnapshotSummary[]> {
    return request(`/v1/projects/${await projectId()}/snapshots`);
  },

  async getAuditEvents(): Promise<AuditEvent[]> {
    return request(`/v1/projects/${await projectId()}/audit-events`);
  },

  async confirmNode(nodeId: string): Promise<void> {
    await request(`/v1/projects/${await projectId()}/nodes/${encodeURIComponent(nodeId)}/confirm`, { method: 'POST' });
  },

  async proposeAssetStatus(
    assetId: string,
    proposedStatus: 'candidate' | 'accepted' | 'superseded' | 'quarantined' | 'duplicate',
    reason: string,
    replacementAssetId?: string
  ): Promise<{ id: string; status: 'pending'; proposedStatus: string }> {
    return request(`/v1/assets/${encodeURIComponent(assetId)}/status-proposals`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        proposed_status: proposedStatus,
        reason,
        ...(replacementAssetId ? { replacement_asset_id: replacementAssetId } : {})
      })
    });
  },

  async reviewLineageEdge(
    edgeId: string,
    decision: 'confirm' | 'reject',
    comment: string
  ): Promise<{ id: string; decision: 'confirm' | 'reject'; reviewer: string }> {
    return request(`/v1/lineage-edges/${encodeURIComponent(edgeId)}/review`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ decision, comment })
    });
  },

  async executeHandoffActions(): Promise<{ outputDir: string; files: string[]; sent: boolean }> {
    return request(`/v1/projects/${await projectId()}/handoffs/export`, { method: 'POST', body: '{}' });
  },

  async previewWorkspaceHandoff(idempotencyKey: string): Promise<{
    action: 'preview';
    drive: { name: string; bytes: number };
    sheets: { auditId: string; row: unknown[] };
    gmail: { to: string; subject: string; mode: 'draft-only' };
  }> {
    return request(`/v1/projects/${await projectId()}/handoffs/workspace`, {
      method: 'POST',
      body: JSON.stringify({ action: 'preview', idempotencyKey })
    });
  },

  async executeWorkspaceHandoff(idempotencyKey: string): Promise<{
    status: string;
    driveFileId: string;
    gmailDraftId: string;
    sheetIdempotent: boolean;
    sent: false;
  }> {
    return request(`/v1/projects/${await projectId()}/handoffs/workspace`, {
      method: 'POST',
      body: JSON.stringify({ action: 'execute', confirmation: 'EXPORT_TO_GOOGLE_WORKSPACE', idempotencyKey })
    });
  },

  async runAudit() {
    return request(`/v1/projects/${await projectId()}/audits`, { method: 'POST', body: '{}' });
  },

  async scanDirectory(path: string, includeTextDiff = false): Promise<{ snapshot: SnapshotSummary; changes: FileChange[] }> {
    return request(`/v1/projects/${await projectId()}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({
        path,
        includeTextDiff,
        ...(includeTextDiff ? { confirmation: 'ALLOW_TEXT_DIFF' } : {})
      })
    });
  },

  async importManifest(manifest: unknown) {
    return request('/v1/manifests', { method: 'POST', body: JSON.stringify(manifest) });
  },

  async listAgentConversations(): Promise<AgentConversation[]> {
    const result = await request<{ conversations: AgentConversation[] }>(
      `/v1/projects/${await projectId()}/agent/conversations`
    );
    return result.conversations;
  },

  async createAgentConversation(title?: string): Promise<AgentConversation> {
    return request(`/v1/projects/${await projectId()}/agent/conversations`, {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {})
    });
  },

  async clearAgentConversation(conversationId: string): Promise<void> {
    await request(
      `/v1/projects/${await projectId()}/agent/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' }
    );
  },

  async sendAgentMessage(message: string, conversationId: string): Promise<AgentResponse> {
    return request(`/v1/projects/${await projectId()}/agent`, {
      method: 'POST',
      body: JSON.stringify({ message, conversationId })
    });
  },

  logAuditEvent() {
    // Security events are written by the backend at the point of execution.
  }
};
