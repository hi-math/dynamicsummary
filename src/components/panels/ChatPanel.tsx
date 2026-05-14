'use client';

import { useEffect, useRef, useState } from 'react';
import type { AIMessage, HumanMessage, SessionCookie } from '@/types';
import { getSubmitLabel } from '@/lib/phases';
import { sendAIMessage } from '@/actions/student';
import { sendHumanMessage, getHumanMessages } from '@/actions/mentor';

type Message =
  | { source: 'ai'; role: 'user' | 'assistant'; content: string; id: string }
  | { source: 'human'; sender_id: string; content: string; id: string; created_at: string };

function AIBubble({ msg, session }: { msg: Message; session: SessionCookie }) {
  if (msg.source !== 'ai') return null;
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 shrink-0 mt-0.5">
          AI
        </div>
      )}
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
        isUser ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
      }`}>
        {msg.content}
      </div>
      {isUser && (
        <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 text-xs ml-2 shrink-0 mt-0.5">
          {session.name[0]}
        </div>
      )}
    </div>
  );
}

function HumanBubble({ msg, session }: { msg: Message; session: SessionCookie }) {
  if (msg.source !== 'human') return null;
  const isMe = msg.sender_id === session.id;
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
        isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
      }`}>
        {!isMe && <p className="text-xs font-medium text-slate-500 mb-0.5">{msg.sender_id}</p>}
        {msg.content}
      </div>
    </div>
  );
}

export default function ChatPanel({
  session,
  phase,
  passageContent,
  summary,
  initialAIMessages,
  initialHumanMessages,
  submitted,
  submitting,
  advancing,
  onSubmit,
  onAdvance,
  collapsed,
  onToggleCollapse,
}: {
  session: SessionCookie;
  phase: string;
  passageContent: string;
  summary: string;
  initialAIMessages: AIMessage[];
  initialHumanMessages: HumanMessage[];
  submitted: boolean;
  submitting?: boolean;
  advancing?: boolean;
  onSubmit?: () => void;
  onAdvance?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => {
    if (session.team === 'chatbot') {
      return initialAIMessages.map((m) => ({
        source: 'ai' as const,
        role: m.role,
        content: m.content,
        id: m.id,
      }));
    }
    return initialHumanMessages.map((m) => ({
      source: 'human' as const,
      sender_id: m.sender_id,
      content: m.content,
      id: m.id,
      created_at: m.created_at,
    }));
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (session.team !== 'human') return;
    pollRef.current = setInterval(async () => {
      const fresh = await getHumanMessages(session.id);
      setMessages(fresh.map((m) => ({
        source: 'human' as const,
        sender_id: m.sender_id,
        content: m.content,
        id: m.id,
        created_at: m.created_at,
      })));
    }, 1800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session.id, session.team]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');
    setLoading(true);

    if (session.team === 'chatbot') {
      const tempId = String(Date.now());
      setMessages((prev) => [...prev, { source: 'ai', role: 'user', content: text, id: tempId }]);
      const res = await sendAIMessage(session.id, phase, text, passageContent, summary);
      if (res.error) {
        setError(res.error);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (res.reply) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          { source: 'ai', role: 'user', content: text, id: tempId },
          { source: 'ai', role: 'assistant', content: res.reply!, id: String(Date.now() + 1) },
        ]);
      }
    } else {
      await sendHumanMessage(session.id, session.id, text);
      const fresh = await getHumanMessages(session.id);
      setMessages(fresh.map((m) => ({
        source: 'human' as const,
        sender_id: m.sender_id,
        content: m.content,
        id: m.id,
        created_at: m.created_at,
      })));
    }

    setLoading(false);
  }

  /* ── Collapsed strip ── */
  if (collapsed) {
    return (
      <div className="h-full w-10 bg-white border border-slate-200 rounded-lg flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          onClick={onToggleCollapse}
          title="채팅 열기"
          className="text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs text-slate-300 [writing-mode:vertical-rl] select-none mt-2">
          {session.team === 'chatbot' ? 'AI 채팅' : '멘토 채팅'}
        </span>
      </div>
    );
  }

  /* ── Expanded panel ── */
  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shrink-0 w-80">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          {session.team === 'chatbot' ? 'AI 채팅' : '멘토 채팅'}
        </span>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs ${submitted ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${submitted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {submitted ? '연결됨' : '대기 중'}
          </span>
          <button
            onClick={onToggleCollapse}
            title="채팅 접기"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs text-center gap-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            채팅을 시작하세요.
          </div>
        )}
        {messages.map((msg) =>
          msg.source === 'ai'
            ? <AIBubble key={msg.id} msg={msg} session={session} />
            : <HumanBubble key={msg.id} msg={msg} session={session} />,
        )}
        {loading && (
          <div className="flex justify-start mb-2">
            <div className="bg-slate-100 px-3 py-2 rounded-lg text-sm text-slate-400">입력 중...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</p>
      )}

      {/* Chat input */}
      <div className="p-2 border-t border-slate-200 shrink-0 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="메시지를 입력하세요..."
          disabled={loading}
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* Submit / Advance button */}
      <div className="px-2 pb-2 shrink-0">
        {!submitted ? (
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {submitting ? '처리 중...' : '제출'}
          </button>
        ) : (
          <button
            onClick={onAdvance}
            disabled={advancing}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {advancing ? '처리 중...' : getSubmitLabel(phase) === '제출' ? '다음 단계 →' : getSubmitLabel(phase)}
          </button>
        )}
      </div>
    </div>
  );
}
