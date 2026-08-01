import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Database,
  GitBranch,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  User,
  Wrench
} from 'lucide-react';
import { api } from '../services/api';
import type { AgentConversation, AgentTraceItem } from '../types';
import { useI18n } from '../i18n';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  isError?: boolean;
  toolCalls?: string[];
  trace?: AgentTraceItem[];
}

function renderText(text: string) {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={`${index}-${line.slice(0, 12)}`}>
      {line}
      {index < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
}

interface LineageCandidate {
  rationale?: string;
  nodes: Array<{ pathToken: string; kind: string; label?: string }>;
  edges: Array<{ source: string; target: string; relation: string }>;
}

function extractLineageCandidate(content: string): LineageCandidate | null {
  const match = content.match(/```json\s*([\s\S]*?)```/u);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    if (parsed.nodes.length === 0 || parsed.edges.length === 0) return null;
    return {
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
      nodes: parsed.nodes,
      edges: parsed.edges
    };
  } catch {
    return null;
  }
}

export const AgentChat: React.FC = () => {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'agent',
    content: '你好，我是由 Google ADK 驱动的 LabLineage Guardian。可以问我某张图如何生成、当前可复现等级，或交接前还有哪些风险。所有项目事实都会通过只读证据工具查询。'
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [adoptState, setAdoptState] = useState<Record<string, 'idle' | 'applying' | 'done' | 'error'>>({});
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let available = await api.listAgentConversations();
        if (!available.length) available = [await api.createAgentConversation()];
        if (!cancelled) {
          setConversations(available);
          setConversationId(available[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          setMessages((current) => [...current, {
            id: crypto.randomUUID(),
            role: 'system',
            content: error instanceof Error ? error.message : t('Unable to initialize persistent Agent session.'),
            isError: true
          }]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const message = input.trim();
    if (!message || loading || !conversationId) return;
    setInput('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setLoading(true);
    try {
      const result = await api.sendAgentMessage(message, conversationId);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'agent',
        content: result.response,
        toolCalls: result.toolCalls,
        trace: result.trace
      }]);
      setConversations((current) => current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title: conversation.title === t('New conversation') ? message.slice(0, 120) : conversation.title, updatedAt: new Date().toISOString() }
          : conversation
      ));
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'system',
        content: error instanceof Error ? error.message : 'Agent request failed.',
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function newConversation() {
    if (loading) return;
    setLoading(true);
    try {
      const conversation = await api.createAgentConversation();
      setConversations((current) => [conversation, ...current]);
      setConversationId(conversation.id);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'agent',
        content: '已创建新的持久会话。此会话按项目、当前身份和 conversationId 隔离。'
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'system',
        content: error instanceof Error ? error.message : '创建 Agent 会话失败。',
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function adoptLineage(messageId: string, candidate: LineageCandidate) {
    setAdoptState((current) => ({ ...current, [messageId]: 'applying' }));
    try {
      const result = await api.submitLineageProposal(candidate);
      setAdoptState((current) => ({ ...current, [messageId]: 'done' }));
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'system',
        content: t('Adopted {nodes} nodes, {edges} edges as inferred lineage (requires human review).', {
          nodes: result.addedNodes,
          edges: result.addedEdges
        })
      }]);
    } catch (error) {
      setAdoptState((current) => ({ ...current, [messageId]: 'error' }));
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'system',
        content: error instanceof Error ? error.message : 'Failed to adopt lineage candidates.',
        isError: true
      }]);
    }
  }

  async function clearConversation() {
    if (!conversationId || loading) return;
    setLoading(true);
    try {
      await api.clearAgentConversation(conversationId);
      const replacement = await api.createAgentConversation();
      setConversations((current) => [
        replacement,
        ...current.filter((conversation) => conversation.id !== conversationId)
      ]);
      setConversationId(replacement.id);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'system',
        content: '旧会话上下文及其 ADK 事件已清除，现已创建空白会话。'
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'system',
        content: error instanceof Error ? error.message : '清除 Agent 会话失败。',
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600 p-2 text-white"><Bot size={21} /></div>
          <div>
            <h2 className="font-semibold text-slate-900">{t('Guardian Agent')}</h2>
            <p className="text-xs text-slate-500">@google/adk · 后端保管密钥 · 只读证据工具</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={conversationId || ''}
            onChange={(event) => {
              setConversationId(event.target.value);
              setMessages([{
                id: crypto.randomUUID(),
                role: 'system',
                content: '已切换持久会话；后端 ADK 将继续使用该会话的历史上下文。'
              }]);
            }}
            disabled={!conversationId || loading}
            aria-label="选择 Agent 会话"
            className="max-w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
          <button type="button" onClick={() => void newConversation()} disabled={loading} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" aria-label="新建会话">
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => void clearConversation()} disabled={!conversationId || loading} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" aria-label="清除当前会话上下文">
            <RotateCcw size={15} />
          </button>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck size={14} /> {t('Evidence-first')}
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-5">
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
              message.role === 'user' ? 'bg-slate-800 text-white' :
              message.isError ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {message.role === 'user' ? <User size={16} /> : message.isError ? <AlertCircle size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[78%] ${message.role === 'user' ? 'text-right' : ''}`}>
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.toolCalls.map((tool) => (
                    <span key={tool} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      <Wrench size={11} /> {tool}
                    </span>
                  ))}
                </div>
              )}
              {message.trace && message.trace.length > 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-left">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <GitBranch size={13} /> {t('Agent execution trace')}
                  </div>
                  <ol className="space-y-2 border-l border-slate-200 pl-3">
                    {message.trace.map((item) => (
                      <li key={`${item.sequence}-${item.type}-${item.agent}-${item.tool}`} className="text-xs text-slate-600">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-slate-400">{item.sequence}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{item.type}</span>
                          {item.agent && <span>{item.agent}</span>}
                          {item.target && <span>→ {item.target}</span>}
                          {item.tool && <span className="inline-flex items-center gap-1 text-blue-700"><Wrench size={11} />{item.tool}</span>}
                          <span className="text-slate-400">{item.elapsedMs} ms</span>
                        </div>
                        {item.reproducibility && item.reproducibility.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {item.reproducibility.map((level) => <span key={level} className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{level}</span>)}
                          </div>
                        )}
                        {item.evidenceIds && item.evidenceIds.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.evidenceIds.map((evidenceId) => (
                              <span key={evidenceId} className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                                <Database size={10} />{evidenceId}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${
                message.role === 'user' ? 'rounded-tr-sm bg-slate-800 text-white' :
                message.isError ? 'rounded-tl-sm border border-red-200 bg-red-50 text-red-800' :
                'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
              }`}>
                {renderText(message.content)}
              </div>
              {(() => {
                if (message.role !== 'agent' || message.isError) return null;
                const candidate = extractLineageCandidate(message.content);
                if (!candidate) return null;
                const state = adoptState[message.id] || 'idle';
                return (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-violet-800">
                      <GitBranch size={15} />
                      <span>{t('Lineage candidates')}：{candidate.nodes.length} 节点 / {candidate.edges.length} 边</span>
                    </div>
                    {candidate.rationale && <p className="mt-1 text-xs text-slate-600">{candidate.rationale}</p>}
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void adoptLineage(message.id, candidate)}
                        disabled={state === 'applying' || state === 'done'}
                        className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {state === 'done' ? t('Adopted') : state === 'applying' ? t('Adopting…') : t('Adopt inferred lineage')}
                      </button>
                      {state === 'done' && (
                        <span className="text-xs text-slate-500">{t('Appears in Lineage Explorer as inferred; confirm there to make it fact.')}</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Bot size={16} /></div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Loader2 size={15} className="animate-spin" /> 正在查询证据并生成回答…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="例如：fig3.png 是怎么生成的？现在还能复现吗？"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim() || !conversationId}
            className="self-end rounded-lg bg-blue-600 p-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="发送"
          >
            <Send size={19} />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">模型回答仅供辅助；确定性分数、哈希和证据关系由后端计算。</p>
      </footer>
    </div>
  );
};
