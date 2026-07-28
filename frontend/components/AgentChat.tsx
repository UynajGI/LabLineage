import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, Send, ShieldCheck, User, Wrench } from 'lucide-react';
import { api } from '../services/api';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  isError?: boolean;
  toolCalls?: string[];
}

function renderText(text: string) {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={`${index}-${line.slice(0, 12)}`}>
      {line}
      {index < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
}

export const AgentChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'agent',
    content: '你好，我是由 Google ADK 驱动的 LabLineage Guardian。可以问我某张图如何生成、当前可复现等级，或交接前还有哪些风险。所有项目事实都会通过只读证据工具查询。'
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;
    setInput('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setLoading(true);
    try {
      const result = await api.sendAgentMessage(message);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'agent',
        content: result.response,
        toolCalls: result.toolCalls
      }]);
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

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600 p-2 text-white"><Bot size={21} /></div>
          <div>
            <h2 className="font-semibold text-slate-900">Guardian Agent</h2>
            <p className="text-xs text-slate-500">@google/adk · 后端保管密钥 · 只读证据工具</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck size={14} /> Evidence-first
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
              <div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${
                message.role === 'user' ? 'rounded-tr-sm bg-slate-800 text-white' :
                message.isError ? 'rounded-tl-sm border border-red-200 bg-red-50 text-red-800' :
                'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
              }`}>
                {renderText(message.content)}
              </div>
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
            disabled={loading || !input.trim()}
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
