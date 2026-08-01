import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import type { SetupConfig } from '../types';
import { useI18n, translateCapabilityDetail } from '../i18n';

type CapabilityResponse = Awaited<ReturnType<typeof api.getCapabilities>>;

export const SystemSetup: React.FC = () => {
  const { t } = useI18n();
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [status, setStatus] = useState<CapabilityResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [setup, capabilities] = await Promise.all([api.getSetupConfig(), api.getCapabilities()]);
      setConfig(setup);
      setStatus(capabilities);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('Unable to load setup'));
    }
  };

  useEffect(() => { void load(); }, []);

  const update = (field: keyof SetupConfig, value: string) => {
    setConfig((current) => current ? { ...current, [field]: value } : current);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.saveSetupConfig(config);
      setMessage(t('Organization and handoff settings saved.'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('Unable to save setup'));
    } finally {
      setSaving(false);
    }
  };

  if (!config || !status) {
    return <div className="flex justify-center p-12">{error ? <p className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-blue-500" size={32} />}</div>;
  }

  const fields: Array<{ key: keyof SetupConfig; label: string; type?: string }> = [
    { key: 'institutionName', label: t('Institution') },
    { key: 'labName', label: t('Lab') },
    { key: 'adminDisplayName', label: t('Administrator name') },
    { key: 'adminEmail', label: t('Administrator email'), type: 'email' },
    { key: 'defaultProjectName', label: t('Default project name') },
    { key: 'defaultProjectSlug', label: t('Default project slug') },
    { key: 'departingMemberEmail', label: t('Departing member'), type: 'email' },
    { key: 'receivingMemberEmail', label: t('Receiving member'), type: 'email' },
    { key: 'reviewerEmail', label: t('Reviewer'), type: 'email' },
    { key: 'handoffDueDate', label: t('Handoff due date'), type: 'date' }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{t('System Setup')}</h2>
        <p className="text-slate-600 mt-1">{t('Editable application settings and live integration readiness. Secrets are configured on the server, never in this browser form.')}</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-lg mb-4">{t('Organization and handoff')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <label key={field.key} className="text-sm font-medium text-slate-700">
              {field.label}
              <input
                type={field.type || 'text'}
                value={config[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </label>
          ))}
          <label className="text-sm font-medium text-slate-700">
            {t('Default region')}
            <input value={config.defaultRegion} onChange={(event) => update('defaultRegion', event.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('Default timezone')}
            <input value={config.defaultTimezone} onChange={(event) => update('defaultTimezone', event.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md" />
          </label>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={save} disabled={saving} className="flex gap-2 items-center px-5 py-2.5 bg-blue-600 text-white rounded-md disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} {t('Save settings')}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-lg mb-4">{t('Live integration readiness')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {status.capabilities.map((item) => {
            const ready = item.state === 'ready' || item.state === 'configured';
            return (
              <article key={item.id} className={`border rounded-lg p-4 ${ready ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  {ready ? <CheckCircle2 className="text-green-600" size={18} /> : <ShieldAlert className="text-amber-600" size={18} />}
                  {t(item.title)}
                </div>
                <p className="text-sm text-slate-600 mt-2">{translateCapabilityDetail(t, item.detail)}</p>
                <code className="text-xs text-slate-500 mt-2 block">{item.state}</code>
              </article>
            );
          })}
        </div>
      </section>

      {message && <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">{message}</div>}
      {error && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">{error}</div>}
    </div>
  );
};
