import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileArchive, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import { api } from '../services/api';
import { useI18n } from '../i18n';

export const UploadCenter: React.FC = () => {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'reading' | 'validating' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' }>>([]);
  const input = useRef<HTMLInputElement>(null);

  const choose = (next?: File) => {
    if (!next) return;
    setFile(next);
    setState('idle');
    setLogs([]);
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs((current) => [...current, { message, type }]);
  };

  const importManifest = async () => {
    if (!file) return;
    setLogs([]);
    try {
      if (!/\.json$/iu.test(file.name)) throw new Error(t('Only manifest JSON is accepted on this legacy page.'));
      if (file.size > 5 * 1024 * 1024) throw new Error(t('Manifest exceeds the 5 MB API limit.'));
      setState('reading');
      addLog(t('Reading manifest without executing embedded content...'));
      const document = JSON.parse(await file.text());
      setState('validating');
      addLog(t('Validating lablineage.manifest.v1 schema on the backend...'));
      const result = await api.importManifest(document) as { bundleId: string; nodes: number; edges: number; evidence: number };
      setState('success');
      addLog(t('Imported {nodes} nodes, {edges} edges and {evidence} evidence records from {bundleId}.', {
        nodes: result.nodes, edges: result.edges, evidence: result.evidence, bundleId: result.bundleId
      }), 'success');
    } catch (reason) {
      setState('error');
      addLog(reason instanceof Error ? reason.message : t('Manifest import failed.'), 'error');
    }
  };

  const working = state === 'reading' || state === 'validating';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{t('Manifest Import')}</h2>
        <p className="mt-1 text-slate-600">{t('Legacy import for a validated manifest JSON. Use Deploy Project for Local Collector, GitHub, or ZIP fallback.')}</p>
        <a href="#/deploy" className="mt-3 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{t('Open Deploy Project')}</a>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); choose(event.dataTransfer.files[0]); }}
          onClick={() => input.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') input.current?.click(); }}
          role="button"
          tabIndex={0}
        >
          <input ref={input} type="file" className="hidden" accept=".json,application/json" onChange={(event) => choose(event.target.files?.[0])} />
          <UploadCloud size={48} className={`mb-4 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-lg font-medium text-slate-700">{file?.name || t('Click or drag a manifest.json here')}</p>
          <p className="mt-1 text-sm text-slate-500">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${t('Manifest JSON')}` : t('Maximum file size: 5 MB')}</p>
        </div>

        {state !== 'idle' && (
          <div className="mt-6 space-y-4" aria-live="polite">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><FileArchive className="text-blue-500" /><span className="font-medium text-slate-800">{file?.name}</span><span className="ml-auto text-sm text-slate-500">{t(state)}</span></div>
            <div className="h-56 space-y-2 overflow-y-auto rounded-lg bg-slate-900 p-4 font-mono text-sm">
              {logs.map((log, index) => <div key={`${index}-${log.message}`} className="flex items-start gap-2">{log.type === 'info' && <Loader2 size={14} className="mt-0.5 animate-spin text-blue-400" />}{log.type === 'success' && <CheckCircle2 size={14} className="mt-0.5 text-green-400" />}{log.type === 'error' && <AlertCircle size={14} className="mt-0.5 text-red-400" />}<span className={log.type === 'error' ? 'text-red-400' : 'text-slate-300'}>{log.message}</span></div>)}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck size={16} /><span>{t('Signed manifests are validated without executing embedded content.')}</span></div>
          <button type="button" onClick={() => void importManifest()} disabled={!file || working} className="rounded-md bg-slate-900 px-6 py-2 font-medium text-white disabled:opacity-50">{working ? t('Validating…') : t('Import Manifest')}</button>
        </div>
      </div>
    </div>
  );
};
