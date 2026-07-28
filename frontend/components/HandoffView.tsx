import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HardDrive, Loader2, Mail } from 'lucide-react';
import { api } from '../services/api';
import type { SetupConfig } from '../types';

type Preview = Awaited<ReturnType<typeof api.previewWorkspaceHandoff>>;

export const HandoffView: React.FC = () => {
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [workspaceConfigured, setWorkspaceConfigured] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      api.getSetupConfig(),
      api.getCapabilities(),
      api.previewWorkspaceHandoff(idempotencyKey)
    ]).then(([setup, status, handoffPreview]) => {
      setConfig(setup);
      setPreview(handoffPreview);
      setWorkspaceConfigured(status.capabilities.some((item) => item.id === 'workspace' && item.state === 'configured'));
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to build handoff preview');
    });
  }, [idempotencyKey]);

  const createLocalPreview = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.executeHandoffActions();
      setMessage(`Local preview created: ${result.outputDir}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Local preview failed');
    } finally {
      setBusy(false);
    }
  };

  const exportWorkspace = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.executeWorkspaceHandoff(idempotencyKey);
      setMessage(`Drive file ${result.driveFileId}, Sheets ledger updated, Gmail draft ${result.gmailDraftId}. No email was sent.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Workspace export failed');
    } finally {
      setBusy(false);
    }
  };

  if (!config || !preview) {
    return <div className="flex justify-center p-12">{error ? <p className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-blue-500" size={32} />}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Workspace Handoff</h2>
        <p className="text-slate-600 mt-1">Live preview first; external writes require explicit confirmation and an idempotency key.</p>
      </div>

      <div className="grid gap-4">
        <article className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-3"><HardDrive className="text-blue-600" /><h3 className="font-semibold">Google Drive report</h3></div>
          <p className="text-sm text-slate-600 mt-3">Create <code>{preview.drive.name}</code> ({preview.drive.bytes.toLocaleString()} bytes).</p>
        </article>
        <article className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-3"><FileSpreadsheet className="text-green-600" /><h3 className="font-semibold">Google Sheets ledger</h3></div>
          <p className="text-sm text-slate-600 mt-3">Append audit <code>{preview.sheets.auditId}</code> once; retries do not duplicate the row.</p>
        </article>
        <article className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-3"><Mail className="text-red-600" /><h3 className="font-semibold">Gmail draft</h3></div>
          <p className="text-sm text-slate-600 mt-3">Create an unsent draft to <strong>{preview.gmail.to}</strong> with subject “{preview.gmail.subject}”.</p>
        </article>
      </div>

      {!workspaceConfigured && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <AlertTriangle className="shrink-0" size={20} />
          <p>Google Workspace OAuth is not configured. You can create accurate local Markdown/CSV/EML previews; external export remains disabled.</p>
        </div>
      )}

      {workspaceConfigured && (
        <label className="flex gap-3 items-start bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-950">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
          <span>I reviewed the preview and authorize Drive creation, one idempotent Sheets append, and an unsent Gmail draft. No email may be sent.</span>
        </label>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}
      {message && <div className="flex gap-2 bg-green-50 border border-green-200 rounded-lg p-4 text-green-800"><CheckCircle2 size={20} />{message}</div>}

      <div className="flex flex-wrap gap-3 justify-end">
        <button disabled={busy} onClick={createLocalPreview} className="px-5 py-2.5 rounded-md border border-slate-300 bg-white text-slate-800 disabled:opacity-50">
          Create local preview
        </button>
        <button disabled={busy || !workspaceConfigured || !confirmed} onClick={exportWorkspace} className="px-5 py-2.5 rounded-md bg-blue-600 text-white disabled:opacity-40">
          {busy ? 'Working…' : 'Confirm Workspace export'}
        </button>
      </div>
    </div>
  );
};
