import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Network, AlertTriangle, MessageSquare, ShieldCheck, SendToBack, History, UploadCloud, Settings, ShieldAlert, ListChecks } from 'lucide-react';
import { api } from './services/api';
import {
  beginLogin,
  completeLoginIfPresent,
  getAccessToken,
  getClientAuthConfig,
  logout,
  type ClientAuthConfig
} from './services/auth';
import type { AuditEvent, FileChange, Finding, LineageEdge, LineageNode, ProjectSummary, SnapshotSummary } from './types';

const Dashboard = lazy(() => import('./components/Dashboard').then((module) => ({ default: module.Dashboard })));
const LineageGraph = lazy(() => import('./components/LineageGraph').then((module) => ({ default: module.LineageGraph })));
const FindingsList = lazy(() => import('./components/FindingsList').then((module) => ({ default: module.FindingsList })));
const AgentChat = lazy(() => import('./components/AgentChat').then((module) => ({ default: module.AgentChat })));
const HandoffView = lazy(() => import('./components/HandoffView').then((module) => ({ default: module.HandoffView })));
const SnapshotDiffView = lazy(() => import('./components/SnapshotDiffView').then((module) => ({ default: module.SnapshotDiffView })));
const SystemSetup = lazy(() => import('./components/SystemSetup').then((module) => ({ default: module.SystemSetup })));
const UploadCenter = lazy(() => import('./components/UploadCenter').then((module) => ({ default: module.UploadCenter })));
const SecurityAudit = lazy(() => import('./components/SecurityAudit').then((module) => ({ default: module.SecurityAudit })));
const ImplementationChecklist = lazy(() => import('./components/ImplementationChecklist').then((module) => ({ default: module.ImplementationChecklist })));

const emptySummary: ProjectSummary = {
  id: '',
  name: 'No project loaded',
  totalAssets: 0,
  reproducibilityScores: { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0 },
  openFindings: 0,
  lastScan: ''
};
const validRoutes = new Set([
  '/checklist', '/dashboard', '/lineage', '/snapshots', '/findings',
  '/agent', '/handoff', '/upload', '/setup', '/security'
]);

function routeFromHash(): string {
  const route = window.location.hash.replace(/^#/, '') || '/checklist';
  return validRoutes.has(route) ? route : '/checklist';
}

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [summary, setSummary] = useState<ProjectSummary>(emptySummary);
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [actor, setActor] = useState({ subject: 'unknown', kind: 'unknown', roles: [] as string[] });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'connected' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [authConfig, setAuthConfig] = useState<ClientAuthConfig | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(routeFromHash);
  const loadSequence = useRef(0);

  const loadProject = async (requestedProjectId?: string) => {
    const sequence = ++loadSequence.current;
    setLoadState('loading');
    setLoadError('');
    try {
      const availableProjects = await api.listProjects();
      if (!availableProjects.length) throw new Error('No project exists. Create a project in the API first.');
      const stored = localStorage.getItem('lablineage.activeProjectId');
      const target = requestedProjectId ||
        (stored && availableProjects.some((project) => project.id === stored) ? stored : availableProjects[0].id);
      api.selectProject(target);
      const [projectSummary, lineage, currentFindings, changes, snapshotHistory, events, capabilityStatus] = await Promise.all([
        api.getProjectSummary(),
        api.getLineage(),
        api.getFindings(),
        api.getFileChanges(),
        api.getSnapshots(),
        api.getAuditEvents(),
        api.getCapabilities()
      ]);
      if (sequence !== loadSequence.current) return;
      setProjects(availableProjects);
      setSummary(projectSummary);
      setNodes(lineage.nodes);
      setEdges(lineage.edges);
      setFindings(currentFindings);
      setFileChanges(changes);
      setSnapshots(snapshotHistory);
      setAuditEvents(events);
      setActor(capabilityStatus.actor);
      setLoadState('connected');
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setLoadError(error instanceof Error ? error.message : 'Backend request failed');
      setLoadState('error');
    }
  };

  useEffect(() => {
    let active = true;
    void getClientAuthConfig()
      .then(async (config) => {
        if (!active) return;
        setAuthConfig(config);
        await completeLoginIfPresent(config);
        if (!active) return;
        setAuthenticated(Boolean(getAccessToken()));
        await loadProject();
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Authentication initialization failed');
        setLoadState('error');
      });
    return () => {
      active = false;
      loadSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    const updateRoute = () => {
      const route = routeFromHash();
      if (window.location.hash !== `#${route}`) {
        window.history.replaceState({}, document.title, `#${route}`);
      }
      setCurrentRoute(route);
    };
    updateRoute();
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const navItems = [
    { path: '/checklist', label: 'Implementation Status', icon: <ListChecks size={20} /> },
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/lineage', label: 'Lineage Explorer', icon: <Network size={20} /> },
    { path: '/snapshots', label: 'Directory Diff', icon: <History size={20} /> },
    { path: '/findings', label: 'Audit Findings', icon: <AlertTriangle size={20} /> },
    { path: '/agent', label: 'Guardian Agent', icon: <MessageSquare size={20} /> },
    { path: '/handoff', label: 'Workspace Handoff', icon: <SendToBack size={20} /> },
  ];

  const adminNavItems = [
    { path: '/upload', label: 'Upload Center', icon: <UploadCloud size={20} />, requiredRole: 'editor' },
    { path: '/setup', label: 'System Setup', icon: <Settings size={20} />, requiredRole: 'admin' },
    { path: '/security', label: 'Security & Audit', icon: <ShieldAlert size={20} />, requiredRole: 'admin' },
  ];
  const roleRank: Record<string, number> = { viewer: 10, auditor: 20, editor: 30, admin: 40 };
  const actorRank = Math.max(0, ...actor.roles.map((role) => roleRank[role] || 0));
  const visibleAdminNavItems = adminNavItems.filter((item) => actorRank >= roleRank[item.requiredRole]);
  const accessDenied = (
    <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <h2 className="text-xl font-bold text-red-900">Access denied</h2>
      <p className="mt-2 text-sm text-red-800">Your current role does not permit this administration page.</p>
    </div>
  );
  const pageContent = (() => {
    switch (currentRoute) {
      case '/dashboard': return <Dashboard summary={summary} />;
      case '/lineage': return (
        <div className="space-y-4 h-full flex flex-col">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Lineage Explorer</h2>
            <p className="text-slate-600">Visualizing dependencies for key conclusions and figures. Review and confirm inferred relationships.</p>
          </div>
          <div className="flex-1 min-h-[600px]">
            <LineageGraph nodes={nodes} edges={edges} />
          </div>
        </div>
      );
      case '/snapshots': return <SnapshotDiffView changes={fileChanges} snapshots={snapshots} />;
      case '/findings': return <FindingsList findings={findings} />;
      case '/agent': return (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-800">Guardian Agent</h2>
          <p className="text-slate-600">Ask the Gemini-powered agent to analyze lineage, explain conflicts, or draft handoff emails.</p>
          <AgentChat />
        </div>
      );
      case '/handoff': return <HandoffView />;
      case '/upload': return actorRank >= roleRank.editor ? <UploadCenter /> : accessDenied;
      case '/setup': return actorRank >= roleRank.admin ? <SystemSetup /> : accessDenied;
      case '/security': return actorRank >= roleRank.admin ? <SecurityAudit events={auditEvents} /> : accessDenied;
      default: return <ImplementationChecklist />;
    }
  })();

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
        <div className={`${loadState === 'error' ? 'bg-red-700 text-white' : loadState === 'connected' ? 'bg-emerald-700 text-white' : 'bg-amber-500 text-amber-950'} text-xs font-bold px-4 py-1 text-center flex justify-center items-center space-x-2 z-50`}>
          <AlertTriangle size={14} />
          <span>{loadState === 'connected' ? 'LIVE API / 真实后端数据' : loadState === 'loading' ? '正在连接 Guardian API…' : `API 连接失败：${loadError}`}</span>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className={`bg-slate-900 text-slate-300 w-64 flex-shrink-0 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full hidden'}`}>
            <div className="p-4 flex items-center space-x-3 border-b border-slate-800">
              <ShieldCheck className="text-blue-500" size={28} />
              <span className="text-xl font-bold text-white tracking-tight">LabLineage</span>
            </div>
            
            <div className="p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Current Project</p>
              <div className="bg-slate-800 rounded p-2 text-sm text-slate-200 border border-slate-700">
                <span className="bg-emerald-500 text-emerald-950 text-[10px] px-1.5 py-0.5 rounded mr-2 font-bold">{actor.kind.toUpperCase()}</span>
                <select
                  aria-label="Current project"
                  value={summary.id}
                  onChange={(event) => void loadProject(event.target.value)}
                  className="mt-2 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                >
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <a
                  key={item.path}
                  href={`#${item.path}`}
                  aria-current={currentRoute === item.path ? 'page' : undefined}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
                    currentRoute === item.path ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              ))}

              {visibleAdminNavItems.length > 0 && (
                <div className="pt-4 pb-2">
                  <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administration</p>
                </div>
              )}
              
              {visibleAdminNavItems.map((item) => (
                <a
                  key={item.path}
                  href={`#${item.path}`}
                  aria-current={currentRoute === item.path ? 'page' : undefined}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
                    currentRoute === item.path ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              ))}
            </nav>

            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center space-x-3 mb-4 px-2">
                <div className="h-8 w-8 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm">
                  {actor.subject.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-sm">
                  <p className="text-white font-medium truncate max-w-36">{actor.subject}</p>
                  <p className="text-slate-400 text-xs">{actor.roles.join(', ') || 'no role'}</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <header className="bg-white border-b border-slate-200 h-14 flex items-center px-6 justify-between flex-shrink-0">
              <div className="flex items-center">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  aria-label={isSidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
                  aria-expanded={isSidebarOpen}
                  className="text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded mr-4"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
                <h2 className="text-lg font-semibold text-slate-800">Handoff Audit Mode</h2>
              </div>
              <div className="flex items-center space-x-4">
                {authConfig?.enabled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (authenticated) logout();
                      else void beginLogin(authConfig).catch((error) => {
                        setLoadError(error instanceof Error ? error.message : 'Unable to start sign-in');
                        setLoadState('error');
                      });
                    }}
                    className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {authenticated ? 'Sign out' : 'Sign in'}
                  </button>
                )}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                  {actor.kind}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                  {loadState === 'connected' ? 'Connected' : loadState}
                </span>
              </div>
            </header>

            <div
              className="flex-1 overflow-auto p-6"
              tabIndex={0}
              aria-label="Page content"
            >
              <div className="max-w-6xl mx-auto h-full">
                <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading page…</div>}>
                {pageContent}
                </Suspense>
              </div>
            </div>
          </main>
        </div>
    </div>
  );
};

export default App;
