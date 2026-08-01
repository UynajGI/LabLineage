import React, { useEffect, useState } from 'react';
import { ShieldAlert, Key, Users, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { AuditEvent, SecuritySummary } from '../types';
import { api } from '../services/api';
import { useI18n } from '../i18n';

interface SecurityAuditProps {
  events: AuditEvent[];
}

export const SecurityAudit: React.FC<SecurityAuditProps> = ({ events }) => {
  const { t } = useI18n();
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    let active = true;
    void api.getSecuritySummary()
      .then((value) => { if (active) setSummary(value); })
      .catch((error) => {
        if (active) setSummaryError(error instanceof Error ? error.message : t('Security summary unavailable'));
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportEvents = () => {
    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['timestamp', 'trace_id', 'subject', 'action', 'resource', 'status', 'details'],
      ...events.map((event) => [
        event.timestamp,
        event.traceId,
        event.userSubject,
        event.action,
        event.resource,
        event.status,
        event.details
      ])
    ];
    const blob = new Blob([`${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lablineage-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{t('Security & Audit')}</h2>
        <p className="text-slate-600 mt-1">{t('Review system access, service accounts, and immutable audit logs.')}</p>
      </div>

      {summaryError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{summaryError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Users size={20} /></div>
            <h3 className="font-semibold text-slate-800">{t('Current Actor Roles')}</h3>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="break-all font-mono text-xs text-slate-700">{summary?.actor.subject || t('Loading…')}</li>
            {(summary?.actor.roles || []).map((role) => (
              <li key={role} className="flex justify-between items-center">
                <span className="text-slate-700">{role}</span>
                <span className="text-xs text-slate-600">{summary?.actor.kind}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Key size={20} /></div>
            <h3 className="font-semibold text-slate-800">{t('Configured Service Tokens')}</h3>
          </div>
          <ul className="space-y-3 text-sm">
            {!summary && <li className="text-slate-600">{t('Loading…')}</li>}
            {summary && summary.serviceActors.length === 0 && (
              <li className="text-slate-600">{t('No service tokens configured.')}</li>
            )}
            {summary?.serviceActors.map((actor) => (
              <li key={actor.id} className="flex justify-between items-start gap-3">
                <span className="text-slate-700 font-mono text-xs break-all">{actor.subject}</span>
                <span className="text-xs text-slate-600">{actor.roles.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><ShieldAlert size={20} /></div>
            <h3 className="font-semibold text-slate-800">{t('Gateway Denials')}</h3>
          </div>
          <div className="flex flex-col items-center justify-center h-24">
            <span className="text-3xl font-bold text-slate-800">{summary?.deniedLast24Hours ?? '—'}</span>
            <span className="text-xs text-slate-600 mt-1">{t('Denied or failed events in last 24h')}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800 flex items-center space-x-2">
            <Activity size={18} className="text-slate-500" />
            <span>{t('Immutable Audit Log')}</span>
          </h3>
          <button
            type="button"
            onClick={exportEvents}
            disabled={events.length === 0}
            className="text-sm text-blue-700 hover:text-blue-900 font-medium disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {t('Export CSV')}
          </button>
        </div>
        <div className="overflow-x-auto" tabIndex={0} aria-label={t('Audit event table')}>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">{t('Timestamp')}</th>
                <th className="px-4 py-3">{t('Trace ID')}</th>
                <th className="px-4 py-3">{t('User / Subject')}</th>
                <th className="px-4 py-3">{t('Action')}</th>
                <th className="px-4 py-3">{t('Resource')}</th>
                <th className="px-4 py-3">{t('Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map(event => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(event.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{event.traceId}</td>
                  <td className="px-4 py-3 text-slate-700">{event.userSubject}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{event.action}</td>
                  <td className="px-4 py-3 text-slate-600">{event.resource}</td>
                  <td className="px-4 py-3">
                    {event.status === 'success' ? (
                      <span className="flex items-center space-x-1 text-green-700"><CheckCircle2 size={14} /><span>{t('Success')}</span></span>
                    ) : (
                      <span className="flex items-center space-x-1 text-red-600"><XCircle size={14} /><span>{t('Denied')}</span></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
