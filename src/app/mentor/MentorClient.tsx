'use client';

import { useEffect, useRef, useState } from 'react';
import { getHumanMessages, sendHumanMessage, getMentorStudents } from '@/actions/mentor';
import { PHASE_LABEL } from '@/lib/phases';
import type { HumanMessage, User, SessionCookie } from '@/types';

export default function MentorClient({
  session,
  initialStudents,
}: {
  session: SessionCookie;
  initialStudents: User[];
}) {
  const [students, setStudents] = useState<User[]>(initialStudents);
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<HumanMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for messages when a student is selected
  useEffect(() => {
    if (!selected) return;

    async function load() {
      if (!selected) return;
      const msgs = await getHumanMessages(selected.id);
      setMessages(msgs);
    }

    load();
    pollRef.current = setInterval(load, 1800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected]);

  // Poll student list to refresh current_phase
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await getMentorStudents(session.id);
      setStudents(fresh);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    if (!selected || !input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    await sendHumanMessage(selected.id, session.id, text);
    const msgs = await getHumanMessages(selected.id);
    setMessages(msgs);
    setSending(false);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Student list sidebar */}
      <aside className="w-52 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">담당 학생</h2>
          <p className="text-xs text-slate-400 mt-0.5">휴먼팀 · {students.length}명</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {students.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">학생이 없습니다.</p>
          )}
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                selected?.id === s.id ? 'bg-indigo-50 border-r-2 border-indigo-600' : ''
              }`}
            >
              <p className={`text-sm font-medium ${selected?.id === s.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                {s.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {PHASE_LABEL[s.current_phase as keyof typeof PHASE_LABEL] ?? s.current_phase}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            <p className="text-sm">왼쪽에서 학생을 선택하세요.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-200 bg-white shrink-0">
              <p className="font-semibold text-slate-800">{selected.name}</p>
              <p className="text-xs text-slate-500">
                {PHASE_LABEL[selected.current_phase as keyof typeof PHASE_LABEL] ?? selected.current_phase}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
              {messages.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-8">아직 메시지가 없습니다.</p>
              )}
              {messages.map((msg) => {
                const isMe = msg.sender_id === session.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'
                    }`}>
                      {!isMe && (
                        <p className="text-xs font-medium text-slate-400 mb-0.5">{selected.name}</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="메시지를 입력하세요..."
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
