import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export const ImplementationChecklist: React.FC = () => {
  type Capability = Awaited<ReturnType<typeof api.getCapabilities>>['capabilities'][number];
  const [items, setItems] = useState<Capability[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems((await api.getCapabilities()).capabilities);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load capability status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const completed = items.filter((item) => item.state === 'ready' || item.state === 'configured');
  const development = items.filter((item) => item.state === 'development');
  const blocked = items.filter((item) => item.state === 'not_configured');

  const renderList = (list: Capability[], icon: React.ReactNode, title: string, bgColor: string) => (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-6`}>
      <div className={`p-4 border-b border-slate-200 flex items-center space-x-2 ${bgColor}`}>
        {icon}
        <h3 className="font-bold text-slate-800">{title} ({list.length})</h3>
      </div>
      <ul className="divide-y divide-slate-200">
        {list.length === 0 ? (
          <li className="p-4 text-sm text-slate-500 italic">No items in this category.</li>
        ) : list.map((item) => (
          <li key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
                <p className="text-sm text-slate-600 mt-1">{item.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div
      className="space-y-6 max-w-4xl mx-auto h-full overflow-y-auto pb-12"
      tabIndex={0}
      aria-label="Implementation status details"
    >
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Implementation Status</h2>
        <p className="text-slate-600 mt-1">Live capability status reported by the backend. Mock completion states are not used.</p>
      </div>

      {loading && <div className="p-6 text-slate-600 flex items-center gap-2"><RefreshCw className="animate-spin" size={18} /> Loading live status…</div>}
      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">{error}</div>}
      {!loading && !error && <>
        {renderList(completed, <CheckCircle2 className="text-green-600" size={20} />, "Implemented / Configured", "bg-green-50")}
        {renderList(development, <Clock className="text-amber-600" size={20} />, "Development Mode", "bg-amber-50")}
        {renderList(blocked, <ShieldAlert className="text-red-600" size={20} />, "Requires Configuration or External Validation", "bg-red-50")}
      </>}
    </div>
  );
};
