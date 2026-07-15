'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sendHumanMessage, getMentorStudents,
  updatePresence, getPresenceBatch, getStudentSummary, getCyclePassage,
  getMentorNote, saveMentorNote, getLearningComplete, setLearningComplete,
} from '@/actions/mentor';
import { isDAPhase, cycleKeyFromPhase, PHASE_LABEL, PHASE_GROUPS } from '@/lib/phases';
import { computeHighlightPair } from '@/lib/highlight';
import { useNoteAutosave, noteStatusLabel } from '@/lib/useNoteAutosave';
import { useToast } from '@/components/ui/Toast';
import HighlightedText from '@/components/HighlightedText';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import type { HumanMessage, User, SessionCookie } from '@/types';

type Passage = { title: string; content: string };

function isOnline(lastSeen?: string): boolean {
  return !!lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 45000;
}

// Keep optimistic (tmp_) messages the server hasn't confirmed yet, so a poll landing
// before the insert commits can't momentarily wipe a just-sent message.
function mergePending(serverRows: HumanMessage[], prev: HumanMessage[]): HumanMessage[] {
  const stillPending = prev.filter(
    (m) => m.id.startsWith('tmp_') && !serverRows.some((s) => s.sender_id === m.sender_id && s.content === m.content),
  );
  return [...serverRows, ...stillPending];
}

// ─── Progress panel (non-DA phases) ───────────────────────────────────────────

function ProgressPanel({ student }: { student: User }) {
  const cycleKey = cycleKeyFromPhase(student.current_phase);
  const group = PHASE_GROUPS.find((g) => g.key === cycleKey);
  const phaseLabel = PHASE_LABEL[student.current_phase as keyof typeof PHASE_LABEL] ?? student.current_phase;
  const allPhases = PHASE_GROUPS.flatMap((g) => g.phases);
  const currentIdx = allPhases.indexOf(student.current_phase as typeof allPhases[0]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-base">
            {student.name[0]}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{student.name}</p>
            <p className="text-base text-slate-400">{student.id}</p>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-base text-slate-400 mb-1">현재 단계</p>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-base font-semibold bg-indigo-100 text-indigo-700">
            {phaseLabel}
          </span>
        </div>

        {group && (
          <div>
            <p className="text-base text-slate-400 mb-2">{group.label} 진행 상황</p>
            <div className="flex gap-1">
              {group.phases.map((p) => {
                const pIdx = allPhases.indexOf(p as typeof allPhases[0]);
                const isDone = pIdx < currentIdx;
                const isCurrent = p === student.current_phase;
                return (
                  <div key={p} className="flex-1 text-center">
                    <div className={`h-1.5 rounded-full mb-1 ${isDone ? 'bg-emerald-500' : isCurrent ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                    <span className={`text-xs ${isCurrent ? 'text-indigo-600 font-semibold' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {PHASE_LABEL[p as keyof typeof PHASE_LABEL]?.replace(/^C\d /, '') ?? p}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-base text-slate-400 mt-5 text-center">
          동적평가 단계가 되면 지문과 요약문을 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

// ─── Read-only summary panel ──────────────────────────────────────────────────

function StudentSummaryPanel({ summary, loading, passageContent = '', highlightOn, onToggleHighlight }: { summary: string | null; loading: boolean; passageContent?: string; highlightOn: boolean; onToggleHighlight: () => void }) {
  const highlightActive = highlightOn && !!passageContent.trim();
  const segments = useMemo(
    () => (summary && highlightActive ? computeHighlightPair(summary, passageContent).summary : null),
    [summary, highlightActive, passageContent]
  );

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-700 shrink-0">학생 요약문</h3>
        <div className="flex items-center gap-3 shrink-0">
          {loading && <span className="text-base text-slate-400">불러오는 중...</span>}
          {summary && (
            <span className="text-base text-slate-400">{summary.trim() ? summary.trim().split(/\s+/).length : 0} 단어</span>
          )}
          {passageContent.trim() && (
            <button
              type="button"
              onClick={onToggleHighlight}
              title="지문과 3단어 이상 동일한 부분을 지문·요약문에 함께 하이라이트"
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <span className={`relative w-7 h-4 rounded-full transition-colors ${highlightOn ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${highlightOn ? 'left-3.5' : 'left-0.5'}`} />
              </span>
              하이라이트
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : summary ? (
          <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap">
            {segments ? <HighlightedText segments={segments} /> : summary}
          </p>
        ) : (
          <p className="text-base text-slate-400 italic">아직 요약문이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

// ─── Mentor notes panel ───────────────────────────────────────────────────────

function MentorNotesPanel({
  noteKey,
  initialValue,
  onSave,
}: {
  noteKey: string; // student+cycle identity — reloads panel on change
  initialValue: string;
  onSave: (value: string) => Promise<{ error?: string } | void>;
}) {
  const { value, status, onChange, flush } = useNoteAutosave(initialValue, onSave, undefined, noteKey);

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-700">멘토 메모</h3>
        <span className={`text-xs ${status === 'error' ? 'text-red-500' : 'text-slate-400'}`}>{noteStatusLabel(status)}</span>
      </div>
      <textarea
        className="flex-1 p-4 text-base text-slate-700 focus:outline-none resize-none leading-relaxed"
        placeholder="학생 관찰·평가 메모를 자유롭게 입력하세요 (자동 저장, 사이클별로 구분됨)..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
      />
    </div>
  );
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanelMentor({
  session,
  selected,
  messages,
  studentOnline,
  onSend,
}: {
  session: SessionCookie;
  selected: User;
  messages: HumanMessage[];
  studentOnline: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Chat scroll management: keep the user's position when scrolled up, and show a
  // "맨 아래 보기" jump button when new messages arrive while scrolled up.
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    if (near) setShowJump(false);
  }

  function scrollChatToBottom() {
    const el = chatScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    atBottomRef.current = true;
    setShowJump(false);
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      if (atBottomRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        setShowJump(false);
      } else {
        setShowJump(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !studentOnline) return;
    atBottomRef.current = true; // scroll to show the message I just sent
    setInput('');
    setSending(true);
    await onSend(text);
    setSending(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-base font-semibold text-slate-700">{selected.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-base text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            나 (접속 중)
          </span>
          <span className={`flex items-center gap-1.5 text-base ${studentOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${studentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            {selected.name} {studentOnline ? '(접속 중)' : '(오프라인)'}
          </span>
        </div>
      </div>

      {!studentOnline && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
          <p className="text-base text-amber-700">학생이 오프라인입니다. 접속 시 채팅이 활성화됩니다.</p>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div ref={chatScrollRef} onScroll={handleChatScroll} className="h-full overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-base text-center gap-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {studentOnline ? '대화를 시작해보세요.' : '학생의 접속을 기다리고 있습니다.'}
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === session.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-base leading-relaxed whitespace-pre-wrap ${
                  isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}>
                  {!isMe && <p className="text-base font-medium text-slate-500 mb-0.5">{selected.name}</p>}
                  <p>{msg.content}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-indigo-300' : 'text-slate-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {showJump && (
          <button
            onClick={scrollChatToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-slate-800/70 hover:bg-slate-800/90 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm transition-colors"
          >
            맨 아래 보기
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-2 border-t border-slate-200 shrink-0 flex gap-2 items-stretch">
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={studentOnline ? '메시지를 입력하세요...' : '학생 접속 대기 중...'}
          disabled={!studentOnline || sending}
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-base leading-relaxed resize-none break-words focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          onClick={handleSend}
          disabled={!studentOnline || !input.trim() || sending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center w-9 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MentorClient({
  session,
  initialStudents,
}: {
  session: SessionCookie;
  initialStudents: User[];
}) {
  const { showToast } = useToast();
  const [students, setStudents] = useState<User[]>(initialStudents);
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<HumanMessage[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [passage, setPassage] = useState<Passage | null>(null);
  const [studentSummary, setStudentSummary] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  // Highlight toggle shared by the student-summary and passage panels.
  const [highlightOn, setHighlightOn] = useState(true);
  const [note, setNote] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [learningDone, setLearningDone] = useState(false);
  const [togglingDone, setTogglingDone] = useState(false);

  // Sync selected when student list refreshes (phase change, etc.)
  useEffect(() => {
    if (!selected) return;
    const fresh = students.find((s) => s.id === selected.id);
    if (fresh && fresh.current_phase !== selected.current_phase) setSelected(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  // Own heartbeat every 10s (and immediately when the tab becomes visible again).
  useEffect(() => {
    const beat = () => updatePresence(session.id);
    beat();
    const interval = setInterval(beat, 10000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [session.id]);

  // Batch presence polling every 5s (+ immediate refresh on tab focus).
  useEffect(() => {
    if (students.length === 0) return;
    async function poll() {
      const map = await getPresenceBatch(students.map((s) => s.id));
      setPresenceMap(map);
    }
    poll();
    const interval = setInterval(poll, 5000);
    const onVis = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [students]);

  // Refresh student list every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await getMentorStudents(session.id);
      setStudents(fresh);
    }, 10000);
    return () => clearInterval(interval);
  }, [session.id]);

  // Poll messages when student selected — keyed by cycle so chat resets when cycle changes
  useEffect(() => {
    if (!selected) return;
    const cycleKey = cycleKeyFromPhase(selected.current_phase);
    setMessages([]); // clear immediately on cycle/student change
    async function load() {
      if (!selected) return;
      // Poll via the GET route handler (not a Server Action) so it doesn't serialize
      // with sendHumanMessage/presence actions and add send→receive latency.
      const res = await fetch(
        `/api/human-messages?studentId=${encodeURIComponent(selected.id)}&cycleKey=${encodeURIComponent(cycleKey)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const rows = (await res.json()) as HumanMessage[];
        setMessages((prev) => mergePending(rows, prev));
      }
    }
    load();
    const interval = setInterval(load, 1200);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.current_phase]);

  // Fetch passage + summary when selected student or their phase changes
  useEffect(() => {
    if (!selected) return;
    const cycleKey = cycleKeyFromPhase(selected.current_phase);
    const daPhase = `${cycleKey}_da`;
    const draftPhase = `${cycleKey}_draft`;

    setDataLoading(true);
    Promise.all([
      getCyclePassage(cycleKey),
      getStudentSummary(selected.id, daPhase).then(
        async (s) => s ?? getStudentSummary(selected.id, draftPhase)
      ),
    ]).then(([p, s]) => {
      setPassage(p);
      setStudentSummary(s);
      setDataLoading(false);
    });

    // Poll summary every 10s to see student's live edits
    const interval = setInterval(async () => {
      const s = await getStudentSummary(selected.id, daPhase).then(
        async (v) => v ?? getStudentSummary(selected.id, draftPhase)
      );
      setStudentSummary(s);
    }, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.current_phase]);

  // Load mentor note when selected student or cycle changes
  useEffect(() => {
    if (!selected) { setNote(''); return; }
    const cycleKey = cycleKeyFromPhase(selected.current_phase);
    let cancelled = false;
    getMentorNote(session.id, selected.id, cycleKey).then((n) => {
      if (!cancelled) setNote(n);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected ? cycleKeyFromPhase(selected.current_phase) : null]);

  async function handleSend(text: string) {
    if (!selected) return;
    const cycleKey = cycleKeyFromPhase(selected.current_phase);
    // Optimistic: show my message immediately; the poll reconciles it with the row.
    const tmpId = `tmp_${Date.now()}`;
    const optimistic: HumanMessage = {
      id: tmpId,
      student_id: selected.id,
      sender_id: session.id,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const res = await sendHumanMessage(selected.id, session.id, text, cycleKey);
    if (res?.error) setMessages((prev) => prev.filter((m) => m.id !== tmpId));
  }

  async function handleSaveNote(value: string) {
    if (!selected) return;
    const cycleKey = cycleKeyFromPhase(selected.current_phase);
    const res = await saveMentorNote(session.id, selected.id, cycleKey, value);
    if (res?.error) showToast(`메모 저장 실패: ${res.error}`, 'error');
    return res;
  }

  // Load learning-completion flag for the selected student's DA phase
  // (button only renders in the DA branch, so a stale value off-DA is never shown)
  useEffect(() => {
    if (!selected || !isDAPhase(selected.current_phase)) return;
    let cancelled = false;
    getLearningComplete(selected.id, selected.current_phase).then((v) => {
      if (!cancelled) setLearningDone(v);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.current_phase]);

  async function handleToggleComplete() {
    if (!selected || togglingDone) return;
    const next = !learningDone;
    setTogglingDone(true);
    const res = await setLearningComplete(selected.id, selected.current_phase, next);
    setTogglingDone(false);
    if (!res.error) setLearningDone(next);
  }

  const inDA = selected ? isDAPhase(selected.current_phase) : false;
  const studentOnline = selected ? isOnline(presenceMap[selected.id]) : false;

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Sidebar — collapsible */}
      {sidebarCollapsed ? (
        <aside className="w-10 bg-white border-r border-slate-200 flex flex-col items-center py-3 gap-3 shrink-0">
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="학생 목록 펼치기"
            className="text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-xs text-slate-300 [writing-mode:vertical-rl] select-none mt-1">담당 학생 {students.length}</span>
        </aside>
      ) : (
        <aside className="w-52 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-700">담당 학생</h2>
              <p className="text-base text-slate-400 mt-0.5">휴먼팀 · {students.length}명</p>
            </div>
            <button
              onClick={() => setSidebarCollapsed(true)}
              title="학생 목록 접기"
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {students.length === 0 && (
              <p className="text-base text-slate-400 text-center py-6">학생이 없습니다.</p>
            )}
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                  selected?.id === s.id ? 'bg-indigo-50 border-r-2 border-indigo-600' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline(presenceMap[s.id]) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <p className={`text-base font-medium truncate ${selected?.id === s.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {s.name}
                  </p>
                </div>
                <p className="text-base text-slate-400 mt-0.5 ml-4">
                  {PHASE_LABEL[s.current_phase as keyof typeof PHASE_LABEL] ?? s.current_phase}
                </p>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main content */}
      {!selected ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
          <p className="text-base">왼쪽에서 학생을 선택하세요.</p>
        </div>
      ) : (
        /* Selected student */
        <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden">
          {inDA ? (
            /* DA phase: passage | (summary + notes) | chat */
            <>
              <div className="flex-1 min-h-0">
                <ReadingPassagePanel
                  title={passage?.title ?? ''}
                  content={passage?.content ?? ''}
                  highlightSummary={studentSummary ?? ''}
                  highlightActive={highlightOn}
                />
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  <StudentSummaryPanel
                    summary={studentSummary}
                    loading={dataLoading}
                    passageContent={passage?.content ?? ''}
                    highlightOn={highlightOn}
                    onToggleHighlight={() => setHighlightOn((v) => !v)}
                  />
                </div>
                <button
                  onClick={handleToggleComplete}
                  disabled={togglingDone}
                  className={`shrink-0 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                    learningDone
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {togglingDone ? '처리 중...' : learningDone ? '✓ 학습 완료됨 (클릭하여 취소)' : '학습 완료'}
                </button>
                <div className="h-56 shrink-0">
                  <MentorNotesPanel
                    noteKey={`${selected.id}_${cycleKeyFromPhase(selected.current_phase)}`}
                    initialValue={note}
                    onSave={handleSaveNote}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ChatPanelMentor
                  session={session}
                  selected={selected}
                  messages={messages}
                  studentOnline={studentOnline}
                  onSend={handleSend}
                />
              </div>
            </>
          ) : (
            /* Non-DA phase: progress card only (mentor notes appear in DA only) */
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ProgressPanel student={selected} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
