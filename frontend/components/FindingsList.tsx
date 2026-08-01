import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Loader2, Play } from 'lucide-react';
import { Finding } from '../types';
import { api } from '../services/api';
import { useI18n } from '../i18n';

interface FindingsListProps {
  findings: Finding[];
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'P0': return <AlertCircle className="text-red-600" size={20} />;
    case 'P1': return <AlertTriangle className="text-orange-500" size={20} />;
    case 'P2': return <AlertTriangle className="text-yellow-500" size={20} />;
    case 'P3': return <Info className="text-blue-500" size={20} />;
    default: return <Info className="text-slate-500" size={20} />;
  }
};

const getSeverityBadge = (severity: string, t: (text: string) => string) => {
  const baseClasses = "px-2 py-1 text-xs font-bold rounded-full border";
  switch (severity) {
    case 'P0': return <span className={`${baseClasses} bg-red-50 text-red-700 border-red-200`}>{t('P0 Critical')}</span>;
    case 'P1': return <span className={`${baseClasses} bg-orange-50 text-orange-700 border-orange-200`}>{t('P1 High')}</span>;
    case 'P2': return <span className={`${baseClasses} bg-yellow-50 text-yellow-700 border-yellow-200`}>{t('P2 Medium')}</span>;
    case 'P3': return <span className={`${baseClasses} bg-blue-50 text-blue-700 border-blue-200`}>{t('P3 Low')}</span>;
    default: return <span className={`${baseClasses} bg-slate-50 text-slate-700 border-slate-200`}>{severity}</span>;
  }
};

export const FindingsList: React.FC<FindingsListProps> = ({ findings }) => {
  const { t } = useI18n();
  const [currentFindings, setCurrentFindings] = useState(findings);
  const [running, setRunning] = useState(false);
  const [resolvingId, setResolvingId] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => setCurrentFindings(findings), [findings]);

  const runAudit = async () => {
    setRunning(true);
    try {
      await api.runAudit();
      setCurrentFindings(await api.getFindings());
    } finally {
      setRunning(false);
    }
  };

  const resolveFinding = async (finding: Finding) => {
    if (!window.confirm(t('Resolve “{title}”? This records your identity and an immutable audit event.', { title: finding.title }))) return;
    setResolvingId(finding.id);
    setActionError('');
    try {
      await api.resolveFinding(finding.id);
      setCurrentFindings((items) => items.filter((item) => item.id !== finding.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('Unable to resolve finding'));
    } finally {
      setResolvingId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t('Audit Findings')}</h2>
        <div className="flex space-x-2">
          <span className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
            {t('Total:')} {currentFindings.length}
          </span>
          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {t('Run audit')}
          </button>
        </div>
      </div>

      {actionError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}

      {currentFindings.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center flex flex-col items-center">
          <CheckCircle2 className="text-green-500 mb-2" size={48} />
          <h3 className="text-lg font-semibold text-green-800">{t('All Clear!')}</h3>
          <p className="text-green-600">{t('No open findings found in the current snapshot.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentFindings.map((finding) => (
            <div key={finding.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="mt-1">{getSeverityIcon(finding.severity)}</div>
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <h3 className="text-lg font-semibold text-slate-800">{finding.title}</h3>
                      {getSeverityBadge(finding.severity, t)}
                    </div>
                    <p className="text-slate-600 mb-3">{finding.description}</p>

                    <div className="bg-slate-50 rounded p-3 border border-slate-100 mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t('Affected Entities')}</span>
                      <div className="flex flex-wrap gap-2">
                        {finding.affectedEntities.map(entity => (
                          <span key={entity} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-800">
                            {entity}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t('Proposed Action')}</span>
                      <p className="text-sm text-slate-700 bg-blue-50 border border-blue-100 p-2 rounded">
                        {finding.proposedAction}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void resolveFinding(finding)}
                  disabled={resolvingId === finding.id}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {resolvingId === finding.id ? t('Resolving…') : t('Resolve')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
