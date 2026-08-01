import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckCircle2, Circle, FolderSync, GitBranch, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type {
  AnalysisRun,
  AssessmentResult,
  CollectorCredential,
  CollectorPairing,
  ObjectiveAssessmentReport,
  ProjectDetail,
  ProjectKeyOutput,
  ProjectSource
} from '../types';

type SourceChoice = 'collector' | 'github' | 'zip';
type Stage = 'project' | 'source' | 'analysis' | 'report';

interface ProjectDeploymentProps {
  activeProjectId: string;
  actorRoles: string[];
  onProjectSelected: (projectId: string) => Promise<void>;
  onAnalysisCompleted: (projectId: string) => Promise<void>;
}

const terminalStatuses = new Set(['completed', 'partial', 'failed', 'cancelled']);

function hashSelection(): { projectId: string; runId: string } {
  const query = window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  return { projectId: params.get('project') || '', runId: params.get('run') || '' };
}

function persistSelection(projectId: string, runId = '') {
  const params = new URLSearchParams();
  if (projectId) params.set('project', projectId);
  if (runId) params.set('run', runId);
  const query = params.toString();
  window.history.replaceState({}, document.title, `#/deploy${query ? `?${query}` : ''}`);
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function resultTone(status: AssessmentResult['status']): string {
  if (status === 'supported') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'conflicted') return 'border-red-200 bg-red-50 text-red-900';
  return 'border-slate-200 bg-slate-50 text-slate-800';
}

export const ProjectDeployment: React.FC<ProjectDeploymentProps> = ({
  activeProjectId,
  actorRoles,
  onProjectSelected,
  onAnalysisCompleted
}) => {
  const { t } = useI18n();
  const initial = useMemo(hashSelection, []);
  const [projectId, setProjectId] = useState(initial.projectId || activeProjectId);
  const [runId, setRunId] = useState(initial.runId);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [report, setReport] = useState<ObjectiveAssessmentReport | null>(null);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>('collector');
  const [pairing, setPairing] = useState<CollectorPairing | null>(null);
  const [collectors, setCollectors] = useState<CollectorCredential[]>([]);
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [objective, setObjective] = useState('');
  const [criteria, setCriteria] = useState('');
  const [outputs, setOutputs] = useState('');
  const [constraints, setConstraints] = useState('');
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);
  const completedRefreshes = useRef(new Set<string>());
  const createInFlight = useRef(false);
  const isAdmin = actorRoles.includes('admin');
  const canManageSources = isAdmin || actorRoles.includes('editor');

  const stage: Stage = report
    ? 'report'
    : runId
      ? 'analysis'
      : projectId
        ? 'source'
        : 'project';

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let active = true;
    void api.getProjectDetail(projectId)
      .then((value) => { if (active) setProject(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t('Unable to load project.')); });
    return () => { active = false; };
  }, [projectId, t]);

  useEffect(() => {
    persistSelection(projectId, runId);
  }, [projectId, runId]);

  useEffect(() => {
    if (!projectId || runId || !pairing) return;
    let active = true;
    const poll = async () => {
      try {
        const [collectorState, projectSources, projectRuns] = await Promise.all([
          api.listCollectors(projectId),
          api.listProjectSources(projectId),
          api.listAnalysisRuns(projectId)
        ]);
        if (!active) return;
        setCollectors(collectorState.collectors);
        setSources(projectSources);
        const currentPairing = collectorState.pairings.find((item) => item.id === pairing.id);
        if (currentPairing) setPairing((old) => ({ ...old, ...currentPairing }));
        const sourceId = currentPairing?.sourceId;
        const nextRun = sourceId ? projectRuns.find((item) => item.sourceId === sourceId) : undefined;
        if (nextRun) setRunId(nextRun.id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : t('Unable to refresh Collector status.'));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pairing?.id, projectId, runId, t]);

  useEffect(() => {
    if (!projectId || !runId) return;
    let active = true;
    let timer = 0;
    let attempt = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      try {
        const current = await api.getAnalysisRun(projectId, runId, controller.signal);
        if (!active) return;
        setRun(current);
        setError('');
        if (terminalStatuses.has(current.status)) {
          if (current.report) {
            const currentReport = await api.getAnalysisReport(projectId, runId);
            if (active) setReport(currentReport);
          }
          if (!completedRefreshes.current.has(runId)) {
            completedRefreshes.current.add(runId);
            await onAnalysisCompleted(projectId);
          }
          return;
        }
        attempt += 1;
        const delay = document.hidden ? 30000 : Math.min(15000, 1000 * (2 ** Math.min(attempt, 4)));
        timer = window.setTimeout(() => void poll(), delay);
      } catch (reason) {
        if (!active || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : t('Unable to refresh analysis status.'));
        timer = window.setTimeout(() => void poll(), document.hidden ? 30000 : 8000);
      }
    };
    const visibility = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [onAnalysisCompleted, pollGeneration, projectId, runId, t]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || busy || createInFlight.current) return;
    createInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const successCriteria = lines(criteria).map((description) => ({ description, required: true }));
      if (!successCriteria.length) throw new Error(t('Add at least one success criterion.'));
      const keyOutputs = lines(outputs).map((row) => {
        const [outputName, expectedPathHint] = row.split('|').map((item) => item.trim());
        return { name: outputName, kind: 'artifact' as ProjectKeyOutput['kind'], ...(expectedPathHint ? { expectedPathHint } : {}), required: true };
      });
      if (!keyOutputs.length || keyOutputs.some((item) => !item.name)) throw new Error(t('Add at least one key output.'));
      const created = await api.createProject({
        name: name.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        objective: objective.trim(),
        successCriteria,
        keyOutputs,
        constraints: lines(constraints)
      });
      setProject(created);
      setProjectId(created.id);
      await onProjectSelected(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to create project.'));
    } finally {
      createInFlight.current = false;
      setBusy(false);
    }
  };

  const createPairing = async () => {
    if (!projectId || !canManageSources || busy) return;
    setBusy(true);
    setError('');
    try {
      setPairing(await api.createCollectorPairing(projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to create pairing code.'));
    } finally {
      setBusy(false);
    }
  };

  const connectGitHub = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || !canManageSources || busy) return;
    setBusy(true);
    setError('');
    try {
      const accepted = await api.connectGitHubSource(projectId, { repository: repository.trim(), ...(branch.trim() ? { branch: branch.trim() } : {}) });
      setRunId(accepted.runId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to connect GitHub repository.'));
    } finally {
      setBusy(false);
    }
  };

  const revokeCollector = async () => {
    if (!projectId || !collector || !isAdmin || busy) return;
    if (!window.confirm(t('Revoke this Collector? Future syncs will be rejected and a new pairing will be required.'))) return;
    setBusy(true);
    setError('');
    try {
      const revoked = await api.revokeCollector(projectId, collector.collectorId);
      setCollectors((items) => items.map((item) => item.collectorId === revoked.collectorId ? revoked : item));
      setSources(await api.listProjectSources(projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to revoke Collector.'));
    } finally {
      setBusy(false);
    }
  };

  const uploadZip = async () => {
    if (!projectId || !archive || !canManageSources || busy) return;
    if (archive.size > 100 * 1024 * 1024) {
      setError(t('Archives are limited to 100 MB.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const accepted = await api.uploadArchiveForAnalysis(projectId, archive);
      setRunId(accepted.runId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Archive import failed.'));
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!run || !canManageSources || busy) return;
    setBusy(true);
    try {
      const next = await api.retryAnalysisRun(projectId, run);
      setRun(next);
      setReport(null);
      completedRefreshes.current.delete(run.id);
      setPollGeneration((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to retry analysis.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!run || !canManageSources || busy) return;
    setBusy(true);
    try {
      setRun(await api.cancelAnalysisRun(projectId, run));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to cancel analysis.'));
    } finally {
      setBusy(false);
    }
  };

  const resetForNewProject = () => {
    setProjectId('');
    setProject(null);
    setRunId('');
    setRun(null);
    setReport(null);
    setPairing(null);
    setError('');
    persistSelection('');
  };

  const stageNames: Array<{ id: Stage; label: string }> = [
    { id: 'project', label: t('Project information') },
    { id: 'source', label: t('Data source') },
    { id: 'analysis', label: t('Automatic analysis') },
    { id: 'report', label: t('Objective report') }
  ];
  const stageIndex = stageNames.findIndex((item) => item.id === stage);
  const source = pairing?.sourceId ? sources.find((item) => item.id === pairing.sourceId) : undefined;
  const collector = pairing?.collectorId ? collectors.find((item) => item.collectorId === pairing.collectorId) : undefined;
  const collectorState = pairing?.status === 'pending'
    ? t('Waiting for pairing')
    : collector?.status === 'revoked' || source?.status === 'disconnected'
      ? t('Access revoked')
      : source && Date.now() - Date.parse(source.updatedAt) > 10 * 60 * 1000
        ? t('Collector offline')
        : runId
          ? t('Scanning and analyzing')
          : t('Collector connected');
  const collectorCommand = pairing
    ? `npm run collector -- pair --project "${project?.slug || ''}" --root "<${t('local directory')}>" --url "${window.location.origin}" --pairing "${pairing.id}" --code "${pairing.code || ''}"`
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Deploy a project')}</h1>
          <p className="mt-1 text-slate-600">{t('Connect a local directory or GitHub repository and automatically build evidence, audit it, and assess the project objective.')}</p>
        </div>
        {projectId && isAdmin && (
          <button type="button" onClick={resetForNewProject} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">
            {t('Deploy another project')}
          </button>
        )}
      </div>

      <ol className="grid gap-3 md:grid-cols-4" aria-label={t('Deployment stages')}>
        {stageNames.map((item, index) => (
          <li key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-sm ${index <= stageIndex ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-500'}`} aria-current={item.id === stage ? 'step' : undefined}>
            {index < stageIndex ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            <span>{index + 1}. {item.label}</span>
          </li>
        ))}
      </ol>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

      {!isAdmin && stage === 'project' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">{t('Administrator permission required')}</h2>
          <p className="mt-2 text-sm text-amber-900">{t('You can view existing analysis, but only an administrator can create a project or connect a source.')}</p>
        </div>
      )}
      {!canManageSources && stage === 'source' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">{t('Editor permission required')}</h2>
          <p className="mt-2 text-sm text-amber-900">{t('You can view existing analysis, but an editor or administrator must connect a source.')}</p>
        </div>
      )}

      {stage === 'project' && (
        <form onSubmit={createProject} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('Describe the project and its definition of done')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('Every analysis run is permanently bound to this objective version.')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-800">{t('Project name')}<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-800">{t('Project slug (optional)')}<input pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={120} value={slug} onChange={(event) => setSlug(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          </div>
          <label className="block text-sm font-medium text-slate-800">{t('Project objective')}<textarea required maxLength={4000} rows={4} value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium text-slate-800">{t('Success criteria (one per line)')}<textarea required rows={4} value={criteria} onChange={(event) => setCriteria(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium text-slate-800">{t('Key outputs (name | expected relative path, one per line)')}<textarea required rows={3} value={outputs} onChange={(event) => setOutputs(event.target.value)} placeholder={t('Final report | reports/final.pdf')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium text-slate-800">{t('Constraints (one per line)')}<textarea rows={3} value={constraints} onChange={(event) => setConstraints(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <button disabled={!isAdmin || busy} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />}{t('Create project and choose source')}
          </button>
        </form>
      )}

      {stage === 'source' && project && (
        <div className="space-y-5">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <strong>{project.name}</strong> · {t('Objective version {version}', { version: project.intent.version })}
          </div>
          <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label={t('Choose a data source')}>
            {([
              ['collector', FolderSync, t('Local directory'), t('Recommended. Source code stays local by default; a signed evidence bundle is sent outbound.')],
              ['github', GitBranch, t('GitHub App'), t('Connect an authorized repository without entering a personal token.')],
              ['zip', Archive, t('ZIP fallback'), t('One-time fallback import when Collector or GitHub cannot be used.')]
            ] as const).map(([choice, Icon, label, detail]) => (
              <button key={choice} type="button" role="radio" aria-checked={sourceChoice === choice} onClick={() => setSourceChoice(choice)} className={`rounded-xl border p-5 text-left focus-visible:ring-2 focus-visible:ring-blue-500 ${sourceChoice === choice ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <Icon className="mb-3 text-blue-700" />
                <span className="block font-semibold text-slate-900">{label}</span>
                <span className="mt-2 block text-sm text-slate-600">{detail}</span>
              </button>
            ))}
          </div>

          {sourceChoice === 'collector' && (
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-start gap-3"><ShieldCheck className="text-emerald-600" /><div><h2 className="font-semibold text-slate-900">{t('Connect Local Collector')}</h2><p className="mt-1 text-sm text-slate-600">{t('The cloud service never reads your local path directly. Collector scans locally and sends signed metadata and evidence.')}</p></div></div>
              {!pairing ? (
                <div className="mt-5"><p className="mb-3 text-sm text-slate-600">{t('Collector not paired')}</p><button type="button" disabled={!canManageSources || busy} onClick={() => void createPairing()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />}{t('Generate pairing code')}</button></div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div aria-live="polite" className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-sm text-blue-800">{collectorState}</div><div className="mt-1 font-mono text-2xl font-bold tracking-wider text-blue-950">{pairing.code || t('Code claimed')}</div><div className="mt-1 text-xs text-blue-800">{t('Expires at {time}', { time: new Date(pairing.expiresAt).toLocaleString() })}</div></div>
                  <div><div className="mb-2 text-sm font-medium text-slate-800">{t('Run from the repository root on the machine that owns the directory:')}</div><pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100"><code>{collectorCommand}</code></pre></div>
                  <ul className="space-y-1 text-sm text-slate-600"><li>{t('Raw file contents: disabled')}</li><li>{t('Absolute local paths: disabled')}</li><li>{t('Transport: outbound HTTPS with Ed25519 signature')}</li></ul>
                  {isAdmin && collector?.status === 'active' && <button type="button" disabled={busy} onClick={() => void revokeCollector()} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-50">{t('Revoke Collector')}</button>}
                </div>
              )}
            </section>
          )}

          {sourceChoice === 'github' && (
            <form onSubmit={connectGitHub} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold text-slate-900">{t('Connect a GitHub repository')}</h2>
              <p className="text-sm text-slate-600">{t('The configured GitHub App is read-only. No personal access token is requested or stored.')}</p>
              <label className="block text-sm font-medium text-slate-800">{t('Repository URL or owner/repo')}<input required value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="https://github.com/owner/repository" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium text-slate-800">{t('Branch (optional)')}<input value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <button disabled={!canManageSources || busy} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />}{t('Connect and analyze')}</button>
            </form>
          )}

          {sourceChoice === 'zip' && (
            <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
              <div><h2 className="font-semibold text-amber-950">{t('One-time ZIP fallback')}</h2><p className="mt-1 text-sm text-amber-900">{t('Use only when a continuous Collector or GitHub connection is unavailable. Maximum size: 100 MB.')}</p></div>
              <input type="file" accept=".zip,application/zip" onChange={(event) => setArchive(event.target.files?.[0] || null)} className="block w-full rounded-md border border-amber-300 bg-white p-2 text-sm" />
              <button type="button" disabled={!canManageSources || !archive || busy} onClick={() => void uploadZip()} className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-5 py-2.5 font-medium text-white disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />}{t('Import once and analyze')}</button>
            </section>
          )}
        </div>
      )}

      {stage === 'analysis' && (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6" aria-live="polite">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">{t('Automatic analysis')}</h2><p className="mt-1 text-sm text-slate-600">{run ? t('Run status: {status}', { status: t(run.status) }) : t('Waiting for server status…')}</p></div>{run && !terminalStatuses.has(run.status) && <Loader2 className="animate-spin text-blue-600" />}</div>
          <ol className="space-y-2">
            {(run?.steps || []).map((step) => (
              <li key={step.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                {step.status === 'succeeded' || step.status === 'skipped' ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} /> : step.status === 'failed' ? <XCircle className="mt-0.5 text-red-600" size={18} /> : step.status === 'running' ? <Loader2 className="mt-0.5 animate-spin text-blue-600" size={18} /> : <Circle className="mt-0.5 text-slate-400" size={18} />}
                <div><div className="font-medium text-slate-900">{t(step.name)} · {t(step.status)}</div><div className="text-xs text-slate-600">{t('Attempt {attempt}', { attempt: step.attempt })}{step.startedAt ? ` · ${t('Started {time}', { time: new Date(step.startedAt).toLocaleString() })}` : ''}{step.completedAt ? ` · ${t('Completed {time}', { time: new Date(step.completedAt).toLocaleString() })}` : ''}</div>{step.errorSummary && <div className="mt-1 text-sm text-red-700">{step.errorSummary}</div>}</div>
              </li>
            ))}
          </ol>
          {run?.status === 'failed' && canManageSources && <button type="button" disabled={busy} onClick={() => void retry()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white"><RefreshCw size={17} />{t('Retry failed stage')}</button>}
          {run && !terminalStatuses.has(run.status) && canManageSources && <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-md border border-red-300 px-4 py-2 text-red-800">{t('Cancel analysis')}</button>}
          {run && terminalStatuses.has(run.status) && !run.report && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('This run ended without a report. Review the failed stage and retry when allowed.')}</div>}
        </section>
      )}

      {stage === 'report' && report && (
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">{t('Objective coverage report')}</h2><p className="mt-1 text-sm text-slate-600">{report.document.objective}</p></div><div className="text-right"><div className="text-4xl font-bold text-blue-700">{report.coverageScore}%</div><div className="text-sm text-slate-600">{t(report.overallStatus)}</div></div></div>
            {report.document.audit && <div className="mt-4 text-sm text-slate-700">{t('Deterministic audit: {level}, score {score}', { level: report.document.audit.level, score: report.document.audit.score })}</div>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[...report.document.criterionResults, ...report.document.keyOutputResults].map((result) => (
              <article key={result.id} className={`rounded-lg border p-4 ${resultTone(result.status)}`}>
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{result.label}</h3><span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium">{t(result.status)}</span></div>
                <p className="mt-2 text-sm">{result.reason}</p>
                {result.evidenceIds.length > 0 && <div className="mt-3 text-xs"><span className="font-semibold">{t('Evidence')}</span>: {result.evidenceIds.map((id, index) => <React.Fragment key={id}>{index > 0 ? ', ' : ''}<a className="underline" href={`#/lineage?evidence=${encodeURIComponent(id)}`}>{id}</a></React.Fragment>)}</div>}
                {result.conflictIds.length > 0 && <div className="mt-2 text-xs"><span className="font-semibold">{t('Conflicts')}</span>: {result.conflictIds.join(', ')}</div>}
              </article>
            ))}
          </div>
          {report.document.findingIds.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-5"><h2 className="font-semibold text-red-950">{t('Audit findings')}</h2><div className="mt-2 text-sm text-red-900">{report.document.findingIds.map((id, index) => <React.Fragment key={id}>{index > 0 ? ', ' : ''}<a className="underline" href={`#/findings?finding=${encodeURIComponent(id)}`}>{id}</a></React.Fragment>)}</div></div>}
          {report.document.missingEvidence.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">{t('Missing evidence')}</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{report.document.missingEvidence.map((item) => <li key={`${item.resultId}:${item.reason}`}>{item.resultId}: {item.reason}</li>)}</ul></div>}
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-6"><h2 className="font-semibold text-violet-950">{t('Google ADK explanation')}</h2>{report.document.agentStatus === 'available' ? <p className="mt-3 whitespace-pre-wrap text-sm text-violet-900">{report.document.agentExplanation}</p> : <p className="mt-3 text-sm text-violet-900">{t('The deterministic report is complete, but the optional ADK explanation is unavailable.')}</p>}</div>
          <div className="rounded-xl border border-slate-300 bg-slate-100 p-5"><h2 className="font-semibold text-slate-900">{t('Limitations')}</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{report.document.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3 font-medium text-slate-900">{t('Evidence coverage does not prove scientific correctness.')}</p></div>
        </section>
      )}
    </div>
  );
};
