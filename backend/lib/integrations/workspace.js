import { createHash } from 'node:crypto';

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function externalKey(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function driveQueryValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

export class GoogleWorkspaceClient {
  constructor({ accessToken, fetchImpl = fetch } = {}) {
    if (!accessToken) throw new Error('Google Workspace access token is required');
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
  }

  async request(url, options = {}) {
    const response = await this.fetch(url, {
      ...options,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(options.body && !(options.body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}),
        ...options.headers
      },
      signal: AbortSignal.timeout(Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || 15_000))
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw Object.assign(new Error(`Google Workspace API ${response.status}: ${detail.slice(0, 200)}`), {
        statusCode: response.status
      });
    }
    return response.status === 204 ? null : response.json();
  }

  async createDriveReport({ name, markdown, folderId, idempotencyKey }) {
    const stableKey = idempotencyKey ? externalKey(idempotencyKey) : null;
    if (stableKey) {
      const query = `trashed=false and appProperties has { key='lablineage_idempotency_key' and value='${driveQueryValue(stableKey)}' }`;
      const lookup = new URL('https://www.googleapis.com/drive/v3/files');
      lookup.search = new URLSearchParams({
        q: query,
        fields: 'files(id,name,webViewLink)',
        pageSize: '1'
      }).toString();
      const existing = await this.request(lookup);
      if (existing.files?.[0]) return { ...existing.files[0], idempotent: true };
    }
    const boundary = `lablineage_${Date.now()}`;
    const metadata = JSON.stringify({
      name,
      mimeType: 'text/markdown',
      ...(folderId ? { parents: [folderId] } : {}),
      ...(stableKey ? { appProperties: { lablineage_idempotency_key: stableKey } } : {})
    });
    const body = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${markdown}\r\n--${boundary}--`
    );
    return this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      body,
      headers: { 'content-type': `multipart/related; boundary=${boundary}` }
    });
  }

  async appendSheetOnce({ spreadsheetId, range, auditId, row }) {
    if (!spreadsheetId) throw new Error('Google Sheets spreadsheet ID is required');
    const valuesBase = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    const readUrl = `${valuesBase}?majorDimension=ROWS`;
    const existing = await this.request(readUrl);
    if ((existing.values || []).some((candidate) => candidate[0] === auditId)) {
      return { idempotent: true, auditId };
    }
    const appendUrl = `${valuesBase}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const result = await this.request(appendUrl, {
      method: 'POST',
      body: JSON.stringify({ values: [[auditId, ...row]] })
    });
    return { idempotent: false, auditId, updates: result.updates };
  }

  async createGmailDraft({ to, subject, text, idempotencyKey }) {
    const messageId = idempotencyKey
      ? `<lablineage-${externalKey(idempotencyKey).slice(0, 40)}@guardian.local>`
      : null;
    if (messageId) {
      const lookup = new URL('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
      lookup.search = new URLSearchParams({ q: `rfc822msgid:${messageId}`, maxResults: '1' }).toString();
      const existing = await this.request(lookup);
      if (existing.drafts?.[0]) return { ...existing.drafts[0], idempotent: true };
    }
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      ...(messageId ? [`Message-ID: ${messageId}`] : []),
      'Content-Type: text/plain; charset=UTF-8',
      '',
      text
    ].join('\r\n');
    return this.request('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      body: JSON.stringify({ message: { raw: base64Url(raw) } })
    });
  }
}

export async function createGoogleWorkspaceClientFromEnv({ fetchImpl = fetch } = {}) {
  if (process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
    return new GoogleWorkspaceClient({ accessToken: process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN, fetchImpl });
  }
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw Object.assign(new Error('Google Workspace OAuth credentials are not configured'), { statusCode: 503 });
  }
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(Number(process.env.LABLINEAGE_INTEGRATION_TIMEOUT_MS || 15_000))
  });
  if (!response.ok) throw Object.assign(new Error(`Google OAuth refresh failed (${response.status})`), { statusCode: 502 });
  const token = await response.json();
  if (!token.access_token) throw Object.assign(new Error('Google OAuth refresh returned no access token'), { statusCode: 502 });
  return new GoogleWorkspaceClient({ accessToken: token.access_token, fetchImpl });
}

export function buildHandoffPayload({ summary, findings, recipient }) {
  const report = [
    `# ${summary.name} — Research Handoff`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Assets: ${summary.totalAssets}`,
    `- Open findings: ${summary.openFindings}`,
    '',
    '## Open findings',
    '',
    ...findings.flatMap((finding) => [
      `### ${finding.severity} — ${finding.title}`,
      '',
      finding.description,
      '',
      `Evidence: ${(finding.evidenceIds || []).join(', ') || 'none'}`,
      ''
    ])
  ].join('\n');
  return {
    report,
    recipient,
    subject: `LabLineage handoff — ${summary.name}`,
    emailText: `A handoff report is ready for review. ${findings.length} open findings require attention.`,
    ledgerRow: [summary.name, summary.totalAssets, summary.openFindings, new Date().toISOString()]
  };
}
