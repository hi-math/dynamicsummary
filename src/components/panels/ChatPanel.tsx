'use client';

import { useEffect, useRef, useState } from 'react';
import type { AIMessage, HumanMessage, SessionCookie } from '@/types';
import { sendHumanMessage, getHumanMessages } from '@/actions/mentor';

type Message = { source: 'human'; sender_id: string; content: string; id: string; created_at: string };

export default function ChatPanel({
  session,
  initialHumanMessages,
  submitted,
  collapsed,
  onToggleCollapse,
  cycleKey = 'cycle1',
}: {
  session: SessionCookie;
  // kept for signature compatibility but unused for chatbot
  initialAIMessages?: AIMessage[];
  initialHumanMessages: HumanMessage[];
  submitted: boolean;
  submitting?: boolean;
  advancing?: boolean;
  onSubmit?: () => void;
  onAdvance?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  cycleKey?: string;
  // unused DA props kept for compat
  phase?: string;
  passageContent?: string;
  summary?: string;
  initialDAState?: unknown;
}) {
  const [messages, setMessages] = useState<Message[]>(
    initialHumanMessages.map((m) => ({ source: 'human' as const, sender_id: m.sender_id, content: m.content, id: m.id, created_at: m.created_at }))
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const fresh = await getHumanMessages(session.id, cycleKey);
      setMessages(fresh.map((m) => ({ source: 'human' as const, sender_id: m.sender_id, content: m.content, id: m.id, created_at: m.created_at })));
    }, 1800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session.id, cycleKey]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    await sendHumanMessage(session.id, session.id, text, cycleKey);
    const fresh = await getHumanMessages(session.id, cycleKey);
    setMessages(fresh.map((m) => ({ source: 'human' as const, sender_id: m.sender_id, content: m.content, id: m.id, created_at: m.created_at })));
    setLoading(false);
  }

  if (collapsed) {
    return (
      <div className="h-full w-10 bg-white border border-slate-200 rounded-lg flex flex-col items-center py-3 gap-3 shrink-0">
        <button onClick={onToggleCollapse} title="채팅 열기" className="text-slate-400 hover:text-indigo-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs text-slate-300 [writing-mode:vertical-rl] select-none mt-2">멘토 채팅</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">멘토 채팅</span>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs ${submitted ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${submitted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {submitted ? '연결됨' : '대기 중'}
          </span>
          <button onClick={onToggleCollapse} title="채팅 접기" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs text-center gap-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            멘토의 메시지를 기다리고 있습니다.
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {!isMe && <p className="text-xs font-medium text-slate-500 mb-0.5">{msg.sender_id}</p>}
                {msg.content}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start mb-2">
            <div className="bg-slate-100 px-3 py-2 rounded-lg text-sm text-slate-400">전송 중...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-slate-200 shrink-0 flex gap-2">
        <input
          type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="메시지를 입력하세요..."
          disabled={loading}
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50"
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
