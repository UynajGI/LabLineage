import type {
  AuditEvent,
  FileChange,
  Finding,
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

  async executeHandoffActions(): Promise<{
    exportId: string;
    files: Array<{ name: string; sha256: string; sizeBytes: number }>;
    sent: boolean;
  }> {
    return request(`/v1/projects/${await projectId()}/handoffs/export`, {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'CREATE_LOCAL_HANDOFF_PREVIEW' })
    });
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

  async sendAgentMessage(message: string): Promise<{ response: string; toolCalls: string[]; model: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
    return request(`/v1/projects/${await projectId()}/agent`, {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  },

  logAuditEvent() {
    // Security events are written by the backend at the point of execution.
  }
};
