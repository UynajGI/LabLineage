import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Plus, RefreshCw, Send, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useI18n } from '../i18n';
import type { HandoffEvent, HandoffOrder } from '../types';

interface PreviewResult {
  preview: {
    orderId: string;
    orderNumber: string;
    drive: { name: string; bytes: number };
    sheets: { auditId: string; row: string };
    gmail: { to: string; subject: string; mode: string };
  };
  sha256: string;
}

const STATUS_KEYS: Record<string, string> = {
  draft: 'draft',
  submitted: 'submitted',
  in_review: 'in_review',
  changes_requested: 'changes_requested',
  approved: 'approved',
  receiver_accepted: 'receiver_accepted',
  completed: 'completed',
  cancelled: 'cancelled'
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'approved': case 'receiver_accepted': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in_review': case 'submitted': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'cancelled': return 'bg-slate-100 text-slate-600 border-slate-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const HandoffView: React.FC = () => {
  const { t } = useI18n();
  const [orders, setOrders] = useState<HandoffOrder[]>([]);
  const [selected, setSelected] = useState<HandoffOrder | null>(null);
  const [events, setEvents] = useState<HandoffEvent[]>([]);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [form, setForm] = useState({
    departingSubject: 'departing-member',
    departingEmailSnapshot: 'departing@example.edu',
    receivingSubject: 'local-developer',
    receivingEmailSnapshot: 'receiver@example.edu',
    reviewerSubject: 'local-developer',
    reviewerEmailSnapshot: 'reviewer@example.edu',
    dueAt: '',
    dueTimezone: 'Asia/Shanghai'
  });
  const [taskDrafts, setTaskDrafts] = useState<Array<{ title: string; description: string }>>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  const load = useCallback(async (keepSelection: string | null = null) => {
    setBusy(true);
    setError('');
    try {
      const list = await api.listHandoffOrders(filter || undefined);
      setOrders(list);
      const targetId = keepSelection || selected?.id || null;
      if (targetId) {
        const order = await api.getHandoffOrder(targetId);
        setSelected(order);
        setEvents(await api.getHandoffOrderEvents(targetId));
        setPreview(null);
      } else {
        setSelected(null);
        setEvents([]);
        setPreview(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('Unable to build handoff preview'));
    } finally {
      setBusy(false);
    }
  }, [filter, selected?.id, t]);

  useEffect(() => { void load(null); }, [load]);

  const refresh = async () => {
    await load(selected?.id || null);
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (successMessage) setMessage(successMessage);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const createOrder = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await api.createHandoffOrder({
        departingSubject: form.departingSubject.trim(),
        departingEmailSnapshot: form.departingEmailSnapshot.trim(),
        receivingSubject: form.receivingSubject.trim(),
        receivingEmailSnapshot: form.receivingEmailSnapshot.trim(),
        reviewerSubject: form.reviewerSubject.trim(),
        reviewerEmailSnapshot: form.reviewerEmailSnapshot.trim(),
        dueAt: form.dueAt || '',
        dueTimezone: form.dueTimezone || 'UTC',
        tasks: taskDrafts
      });
      setMessage(`${t('Handoff order created')} ${created.orderNumber}`);
      setShowCreate(false);
      setTaskDrafts([]);
      setTaskTitle('');
      setTaskDescription('');
      await load(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const addTaskDraft = () => {
    const title = taskTitle.trim();
    if (!title) return;
    setTaskDrafts((current) => [...current, { title, description: taskDescription.trim() }]);
    setTaskTitle('');
    setTaskDescription('');
  };

  const filters = [
    { value: '', label: t('All') },
    { value: 'needs_review', label: t('Needs my review') },
    { value: 'needs_accept', label: t('Needs my acceptance') },
    { value: 'overdue', label: t('Overdue') },
    { value: 'completed', label: t('Completed') }
  ];

  const can = (action: string) => {
    if (!selected) return false;
    switch (action) {
      case 'submit': return selected.status === 'draft' || selected.status === 'changes_requested';
      case 'review': return selected.status === 'submitted' || selected.status === 'in_review';
      case 'accept': return selected.status === 'approved';
      case 'complete': return selected.status === 'receiver_accepted';
      case 'cancel': return ['draft', 'submitted', 'in_review', 'approved'].includes(selected.status);
      case 'preview': return Boolean(selected);
      case 'execute': return Boolean(selected && preview && ['receiver_accepted', 'completed'].includes(selected.status));
      default: return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t('Handoff Orders')}</h2>
          <p className="text-slate-600 mt-1">{t('Live preview first; external writes require explicit confirmation and an idempotency key.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" aria-label="刷新">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} /> {t('New Handoff Order')}
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {message && <div className="flex gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={16} />{message}</div>}

      {showCreate && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">{t('New Handoff Order')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              ['departingSubject', t('Departing subject')],
              ['departingEmailSnapshot', t('Departing email')],
              ['receivingSubject', t('Receiving subject')],
              ['receivingEmailSnapshot', t('Receiving email')],
              ['reviewerSubject', t('Reviewer subject')],
              ['reviewerEmailSnapshot', t('Reviewer email')]
            ] as const).map(([key, label]) => (
              <label key={key} className="text-sm font-medium text-slate-700">
                {label}
                <input
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </label>
            ))}
            <label className="text-sm font-medium text-slate-700">
              {t('Due at')}
              <input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              {t('Timezone')}
              <input value={form.dueTimezone} onChange={(event) => setForm((current) => ({ ...current, dueTimezone: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md" />
            </label>
          </div>

          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{t('Tasks')}</h4>
            <div className="flex gap-2">
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder={t('Task title')} className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm" />
              <input value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder={t('Task description')} className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm" />
              <button type="button" onClick={addTaskDraft} className="rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-white">{t('Add task')}</button>
            </div>
            {taskDrafts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {taskDrafts.map((task, index) => (
                  <li key={`${index}-${task.title}`} className="text-sm text-slate-700 flex justify-between">
                    <span>{task.title}{task.description ? ` — ${task.description}` : ''}</span>
                    <button type="button" onClick={() => setTaskDrafts((current) => current.filter((_, i) => i !== index))} className="text-red-600">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void createOrder()} disabled={busy} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? t('Working…') : t('Create')}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => { setFilter(item.value); setSelected(null); }}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${filter === item.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {t('Handoff Orders')} ({orders.length})
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center text-slate-500">{t('No handoff orders yet. Create one to start.')}</div>
          ) : (
            <ul className="divide-y divide-slate-200 max-h-[560px] overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => void load(order.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selected?.id === order.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-sm font-bold text-slate-800">{order.orderNumber}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(order.status)}`}>
                        {t(STATUS_KEYS[order.status] || order.status)}
                        {order.overdue && <span className="text-red-700 font-bold">· {t('Overdue')}</span>}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {t('Departing Member')}: {order.departingSubject} · {t('Receiving Member')}: {order.receivingSubject}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{t('Updated')}: {new Date(order.updatedAt).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          {!selected ? (
            <div className="p-8 text-center text-slate-500">{t('Select a file to view changes')}</div>
          ) : (
            <div className="p-5 space-y-5 max-h-[560px] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-mono text-lg font-bold text-slate-800">{selected.orderNumber}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {t('Version')} {selected.version} · {t(STATUS_KEYS[selected.status] || selected.status)}
                    {selected.overdue && <span className="ml-2 text-red-700 font-semibold">{t('Overdue')}</span>}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">{t('Departing Member')}</p>
                  <p className="font-medium text-slate-800">{selected.departingSubject}</p>
                  <p className="text-xs text-slate-500">{selected.departingEmailSnapshot}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">{t('Receiving Member')}</p>
                  <p className="font-medium text-slate-800">{selected.receivingSubject}</p>
                  <p className="text-xs text-slate-500">{selected.receivingEmailSnapshot}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">{t('Reviewer')}</p>
                  <p className="font-medium text-slate-800">{selected.reviewerSubject}</p>
                  <p className="text-xs text-slate-500">{selected.reviewerEmailSnapshot}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">{t('Due Date')}</p>
                  <p className="font-medium text-slate-800">{selected.dueAt ? new Date(selected.dueAt).toLocaleString() : '—'}</p>
                  <p className="text-xs text-slate-500">{selected.dueTimezone}</p>
                </div>
              </div>

              {selected.tasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">{t('Tasks & Evidence')}</h4>
                  <ul className="space-y-1">
                    {selected.tasks.map((task) => (
                      <li key={task.id} className="flex justify-between items-center text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2">
                        <span>{task.title}</span>
                        <span className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${task.status === 'done' ? 'bg-green-100 text-green-800' : task.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{task.status}</span>
                          {!['completed', 'cancelled'].includes(selected.status) && (
                            <button
                              type="button"
                              onClick={() => void runAction(() => api.setHandoffTaskStatus(selected.id, task.id, selected.version, task.status === 'done' ? 'pending' : 'done'), '')}
                              disabled={busy}
                              className="text-xs text-blue-700 hover:text-blue-900"
                            >
                              {task.status === 'done' ? t('Mark pending') : t('Mark done')}
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.reviews.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">{t('Approvals')}</h4>
                  <ul className="space-y-1">
                    {selected.reviews.map((review) => (
                      <li key={review.id} className="text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2">
                        <span className="font-medium">{review.reviewerSubject}</span> · {t(review.decision === 'approved' ? 'approved' : 'changes_requested')}
                        <p className="text-xs text-slate-500 mt-0.5">{review.comment}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {can('review') && (
                <div className="space-y-2">
                  <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={2} placeholder={t('Review comment')} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void runAction(() => api.reviewHandoffOrder(selected.id, selected.version, 'approved', reviewComment.trim()), t('Review recorded'))} disabled={busy || !reviewComment.trim()} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                      {t('Approve')}
                    </button>
                    <button type="button" onClick={() => void runAction(() => api.reviewHandoffOrder(selected.id, selected.version, 'changes_requested', reviewComment.trim()), t('Review recorded'))} disabled={busy || !reviewComment.trim()} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                      {t('Request changes')}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {can('submit') && (
                  <button type="button" onClick={() => void runAction(() => api.submitHandoffOrder(selected.id, selected.version), t('Order submitted'))} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    <Send size={14} /> {t('Submit for review')}
                  </button>
                )}
                {can('accept') && (
                  <button type="button" onClick={() => void runAction(() => api.acceptHandoffOrder(selected.id, selected.version), t('Handoff accepted'))} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {t('Accept handoff')}
                  </button>
                )}
                {can('complete') && (
                  <button type="button" onClick={() => void runAction(() => api.completeHandoffOrder(selected.id, selected.version), t('Handoff completed'))} disabled={busy} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                    {t('Complete')}
                  </button>
                )}
                {can('cancel') && (
                  <button type="button" onClick={() => void runAction(() => api.cancelHandoffOrder(selected.id, selected.version), t('Order cancelled'))} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <XCircle size={14} /> {t('Cancel')}
                  </button>
                )}
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1"><FileText size={14} /> {t('Preview')}</h4>
                  <button type="button" onClick={() => void runAction(async () => setPreview(await api.previewHandoffExport(selected.id)), '')} disabled={busy || !can('preview')} className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50">
                    {t('Generate preview')}
                  </button>
                </div>
                {preview && (
                  <div className="space-y-1 text-sm text-slate-700">
                    <p><span className="font-medium">{t('Google Drive report')}:</span> {preview.preview.drive.name} ({preview.preview.drive.bytes} B)</p>
                    <p><span className="font-medium">{t('Gmail draft')}:</span> {preview.preview.gmail.to} — {preview.preview.gmail.subject}</p>
                    <p className="text-xs text-slate-500 break-all"><span className="font-medium">{t('Preview checksum')}:</span> {preview.sha256}</p>
                    <button
                      type="button"
                      onClick={() => void runAction(() => api.executeHandoffExport(selected.id, selected.version, preview.sha256), t('Export executed'))}
                      disabled={busy || !can('execute')}
                      className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {t('Execute Workspace export')}
                    </button>
                    {!['receiver_accepted', 'completed'].includes(selected.status) && (
                      <p className="text-xs text-amber-700 mt-1">{t('Accept handoff')} → {t('Complete')}</p>
                    )}
                  </div>
                )}
              </div>

              {events.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">{t('Event Timeline')}</h4>
                  <ol className="space-y-1 border-l border-slate-200 pl-3">
                    {events.map((event) => (
                      <li key={event.id} className="text-xs text-slate-600">
                        <span className="font-mono text-slate-400">{new Date(event.createdAt).toLocaleTimeString()}</span> · <span className="font-medium">{event.eventType}</span> · {event.actorSubject}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
