'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import {
  submitDraft, saveStudentNote, saveSummary, getCurrentUser,
  startDASession, sendDAMessage, advanceDATab, studentAdvancePhase,
} from '@/actions/student';
import { sendHumanMessage, updatePresence, getPresence, getLearningComplete } from '@/actions/mentor';
import { cycleKeyFromPhase } from '@/lib/phases';
import type { SessionCookie, SessionData, AIMessage, HumanMessage, DASessionState } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

type LocalMsg = { role: 'user' | 'assistant'; content: string; id: string };

// Merge freshly-polled server rows with any optimistic (tmp_) messages that the server
// hasn't confirmed yet, so an in-flight poll can't momentarily wipe a just-sent message.
function mergePending(serverRows: HumanMessage[], prev: HumanMessage[]): HumanMessage[] {
  const stillPending = prev.filter(
    (m) => m.id.startsWith('tmp_') && !serverRows.some((s) => s.sender_id === m.sender_id && s.content === m.content),
  );
  return [...serverRows, ...stillPending];
}

// ─── Isolated chat input bar ────────────────────────────────────────────────────
// Keeps its text in local state so typing never re-renders the heavy DASession tree
// (this is why the mentor chat keeps focus and the old shared-state input did not).
function ChatInputBar({
  onSend,
  loading,
  placeholder,
  disabled = false,
}: {
  onSend: (text: string) => void | Promise<void>;
  loading: boolean;
  placeholder: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const t = text.trim();
    if (!t || loading || disabled) return;
    setText('');
    await onSend(t);
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className="p-2 border-t border-slate-200 shrink-0 flex gap-2 items-stretch">
      <textarea
        ref={ref}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm leading-relaxed resize-none break-words focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <button
        onClick={submit}
        disabled={loading || disabled || !text.trim()}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center w-9 shrink-0"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── "맨 아래 보기" jump button ─────────────────────────────────────────────────
// Semi-transparent bubble centered at the bottom of the message list. Shown when
// new messages arrive while the user has scrolled up.
function JumpToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-slate-800/70 hover:bg-slate-800/90 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm transition-colors"
    >
      맨 아래 보기
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DASession({
  session,
  phase,
  passage,
  sessionData,
  aiMessages,
  humanMessages,
  initialDAState,
  draftSummary,
  note,
  mentorId,
  mentorName,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
  initialDAState?: DASessionState | null;
  draftSummary?: string;
  note?: string;
  mentorId?: string;
  mentorName?: string;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const isChatbot = session.team === 'chatbot';

  // DA starts automatically on entry — the summary was already finalized in the draft stage,
  // so there is no separate submit step here.
  const submitted = true;
  const [daState, setDaState] = useState<DASessionState | null>(initialDAState ?? null);
  // draftSummary: the draft text used for Assessor judgment; falls back to saved DA summary
  const initialSummary = draftSummary ?? sessionData?.summary ?? '';
  const [currentSummary, setCurrentSummary] = useState(initialSummary);

  // Per-item chat messages (chatbot only).
  // Restore saved history into the correct task tab using each message's item_idx
  // (messages are stored per-phase with an item_idx pointing into priority_queue).
  const [messagesPerItem, setMessagesPerItem] = useState<Record<string, LocalMsg[]>>(() => {
    const initial: Record<string, LocalMsg[]> = {};
    const queue = initialDAState?.priority_queue;
    if (queue && aiMessages.length > 0) {
      for (const m of aiMessages) {
        const key = queue[m.item_idx ?? 0];
        if (!key) continue;
        (initial[key] ??= []).push({ role: m.role, content: m.content, id: m.id });
      }
    }
    return initial;
  });

  // Per-item cumulative DA state (identification, verbalization, step) — managed client-side for free navigation
  const [itemStates, setItemStates] = useState<Record<string, { identification: boolean; verbalization: boolean; step: number }>>(() => {
    const init: Record<string, { identification: boolean; verbalization: boolean; step: number }> = {};
    if (initialDAState?.priority_queue) {
      initialDAState.priority_queue.forEach((key, idx) => {
        if (idx === initialDAState.current_item_idx) {
          init[key] = {
            identification: initialDAState.item_identification_cumulative,
            verbalization: initialDAState.item_verbalization_cumulative,
            step: initialDAState.current_step,
          };
        } else {
          init[key] = { identification: false, verbalization: false, step: 1 };
        }
      });
    }
    return init;
  });

  // Active tab index (into priority_queue)
  const [activeTabIdx, setActiveTabIdx] = useState(() => initialDAState?.current_item_idx ?? 0);

  // Chat loading & error (input text lives inside <ChatInputBar/> local state)
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [daInitError, setDaInitError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const daInitRef = useRef(false);

  // Chat scroll management: keep the user's scroll position when they scroll up,
  // and show a "맨 아래 보기" jump button when new messages arrive while scrolled up.
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

  // Human messages state (human team)
  const [humanMsgs, setHumanMsgs] = useState(humanMessages);
  const [mentorOnline, setMentorOnline] = useState(false);

  // Human team: mentor's "학습 완료" flag. When true, the chat is closed with a
  // system notice and the "사이클 종료" button below becomes enabled.
  const [learningCompleted, setLearningCompleted] = useState(!!sessionData?.learning_completed);
  // "사이클 종료" button in-flight state
  const [finishing, setFinishing] = useState(false);

  // Human team: allow collapsing the chat panel to widen the reading/summary area
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Highlight toggle shared by the summary and passage panels.
  const [highlightOn, setHighlightOn] = useState(true);

  // Resizable bottom row (Reference Tools / Notes) height in px. Dragging the
  // divider grows/shrinks the passage & summary area above it.
  const [bottomHeight, setBottomHeight] = useState(208); // h-52
  const mainAreaRef = useRef<HTMLDivElement>(null);

  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomHeight;
    function onMove(ev: PointerEvent) {
      const containerH = mainAreaRef.current?.clientHeight ?? 800;
      // Drag up (negative delta) → taller bottom; drag down → shorter bottom.
      const next = startHeight - (ev.clientY - startY);
      const max = containerH - 160; // keep at least ~160px for passage/summary
      setBottomHeight(Math.max(120, Math.min(max, next)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const tabs = daState?.priority_queue ?? [];
  const activeItemKey = tabs[activeTabIdx] ?? null;

  // DA is finished — chatbot: all tasks resolved; human: mentor marked 학습 완료.
  // When finished, the "사이클 종료" button becomes enabled so the student can move
  // to the separate done phase themselves. (Admin still controls done → next cycle.)
  const allResolved = tabs.length > 0 && tabs.every((k) => daState?.resolutions[k]);
  const daFinished = isChatbot ? allResolved : learningCompleted;
  const cycleNum = cycleKeyFromPhase(phase).replace('cycle', '');

  // Poll the student's phase; when the admin advances it (e.g. to the cycle-done phase),
  // re-render so the router switches away from the DA page. The completion/waiting screen
  // now lives in a separate phase (cycleN_done → CycleCompletePhase), not here.
  useEffect(() => {
    const interval = setInterval(async () => {
      const u = await getCurrentUser(session.id);
      if (u && u.current_phase !== phase) router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, session.id, router]);

  // New messages: auto-scroll only if the user is already at the bottom; otherwise
  // keep their position and reveal the "맨 아래 보기" jump button. Runs after paint so
  // scrollHeight reflects the newly appended message.
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
  }, [messagesPerItem, humanMsgs, chatLoading]);

  // Tab switch (chatbot) — always jump to the bottom of the newly shown conversation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
      atBottomRef.current = true;
      setShowJump(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeItemKey]);

  // Runs the Assessor pipeline (or adopts a pre-generated session). Surfaces failures
  // so the panel can show an error + retry instead of spinning forever.
  async function runDAInit() {
    const assessmentSummary = draftSummary || currentSummary;
    if (!assessmentSummary) { setDaInitError('요약문이 없어 평가를 시작할 수 없습니다. 관리자에게 문의해주세요.'); return; }
    setDaInitError('');
    setChatLoading(true);
    const res = await startDASession(session.id, phase, assessmentSummary, passage.content);
    setChatLoading(false);
    if (res.error) { setDaInitError(res.error); return; }
    setDaState(res.state);
    setActiveTabIdx(0);
    if (res.openingUtterance && res.state.priority_queue[0]) {
      const key = res.state.priority_queue[0];
      setMessagesPerItem({ [key]: [{ role: 'assistant', content: res.openingUtterance, id: String(Date.now()) }] });
    }
  }

  // Auto-start DA on entry (chatbot). Uses the pre-generated state if present
  // (built during the comprehension phase); otherwise runs the Assessor pipeline now.
  useEffect(() => {
    if (!isChatbot || daState || daInitRef.current) return;
    const assessmentSummary = draftSummary || currentSummary;
    if (!assessmentSummary) return;
    daInitRef.current = true;
    runDAInit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record DA-phase entry once (summary already finalized in draft stage) so data is captured.
  useEffect(() => {
    if (sessionData?.submitted_at) return;
    const assessmentSummary = draftSummary || currentSummary;
    if (!assessmentSummary.trim()) return;
    submitDraft(session.id, phase, assessmentSummary);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Human team polling
  const cycleKey = cycleKeyFromPhase(phase);
  useEffect(() => {
    if (isChatbot) return;
    async function poll() {
      const res = await fetch(
        `/api/human-messages?studentId=${encodeURIComponent(session.id)}&cycleKey=${encodeURIComponent(cycleKey)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const rows = (await res.json()) as HumanMessage[];
        setHumanMsgs((prev) => mergePending(rows, prev));
      }
    }
    pollRef.current = setInterval(poll, 1200);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session.id, isChatbot, cycleKey]);

  // Human team: poll the mentor's "학습 완료" flag. When set, close the chat and
  // enable the "사이클 종료" button (student then advances to the done phase).
  useEffect(() => {
    if (isChatbot) return;
    async function checkLearning() {
      const done = await getLearningComplete(session.id, phase);
      setLearningCompleted(done);
    }
    checkLearning();
    const interval = setInterval(checkLearning, 3000);
    return () => clearInterval(interval);
  }, [session.id, phase, isChatbot]);

  // Own heartbeat — update our presence every 15s
  useEffect(() => {
    if (isChatbot) return;
    updatePresence(session.id);
    const interval = setInterval(() => updatePresence(session.id), 15000);
    return () => clearInterval(interval);
  }, [session.id, isChatbot]);

  // Poll mentor presence every 5s
  useEffect(() => {
    if (isChatbot || !mentorId) return;
    async function checkMentor() {
      if (!mentorId) return;
      const lastSeen = await getPresence(mentorId);
      setMentorOnline(!!lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 30000);
    }
    checkMentor();
    const interval = setInterval(checkMentor, 5000);
    return () => clearInterval(interval);
  }, [isChatbot, mentorId]);

  function isTabLocked(idx: number): boolean {
    if (!daState) return true;
    return idx > (daState.current_item_idx ?? 0);
  }

  async function handleSend(text: string) {
    if (!text.trim() || chatLoading || !activeItemKey) return;
    if (!daState) { setChatError('먼저 요약문을 제출해주세요.'); return; }
    if (daState.resolutions[activeItemKey]) return;

    setChatError('');
    setChatLoading(true);
    atBottomRef.current = true; // scroll to show the message I just sent

    const tempId = String(Date.now());
    setMessagesPerItem((prev) => ({
      ...prev,
      [activeItemKey]: [...(prev[activeItemKey] ?? []), { role: 'user', content: text, id: tempId }],
    }));

    const currentItemState = itemStates[activeItemKey] ?? { identification: false, verbalization: false, step: 1 };
    const res = await sendDAMessage(session.id, phase, text, currentSummary, passage.content, activeTabIdx, currentItemState);

    if (res.error) {
      setChatError(res.error);
      setMessagesPerItem((prev) => ({
        ...prev,
        [activeItemKey]: (prev[activeItemKey] ?? []).filter((m) => m.id !== tempId),
      }));
    } else {
      setItemStates((prev) => ({
        ...prev,
        [activeItemKey]: {
          identification: res.updated_state.item_identification_cumulative,
          verbalization: res.updated_state.item_verbalization_cumulative,
          step: res.updated_state.current_step,
        },
      }));

      setMessagesPerItem((prev) => ({
        ...prev,
        [activeItemKey]: [
          ...(prev[activeItemKey] ?? []).filter((m) => m.id !== tempId),
          { role: 'user', content: text, id: tempId },
          { role: 'assistant', content: res.utterance, id: String(Date.now() + 1) },
        ],
      }));

      // Reply is on screen — drop the "입력 중..." indicator now. The next-tab opening
      // below (advanceDATab) is prep work for a still-locked tab, so it must not keep
      // the current turn looking like it's still waiting.
      setChatLoading(false);

      if (res.tab_unlocked && !res.session_complete) {
        // Item resolved — advance DB state and pre-generate next tab opening,
        // but do NOT auto-switch; let student read the final message first
        const advRes = await advanceDATab(session.id, phase);
        if (advRes.error) {
          setChatError(advRes.error);
        } else if (advRes.state) {
          setDaState(advRes.state);
          const nextKey = advRes.state.priority_queue[advRes.state.current_item_idx];
          if (nextKey && advRes.openingUtterance) {
            setMessagesPerItem((prev) => ({
              ...prev,
              [nextKey]: [{ role: 'assistant', content: advRes.openingUtterance!, id: String(Date.now() + 2) }],
            }));
          }
          showToast(`과제 ${activeTabIdx + 1} 완료! 과제 ${activeTabIdx + 2} 탭을 클릭해 다음 과제로 이동하세요.`, 'success');
        }
      } else if (res.session_complete) {
        setDaState(res.updated_state);
        showToast('모든 과제를 완료했습니다! 다음 단계로 이동하세요.', 'success');
      } else {
        setDaState(res.updated_state);
      }
    }

    setChatLoading(false);
  }

  async function handleHumanSend(text: string) {
    if (!text.trim()) return;
    atBottomRef.current = true; // scroll to show the message I just sent
    // Optimistic: show my message immediately. The next poll reconciles it with the
    // persisted row, so we don't block on the send + refetch round trip.
    const tmpId = `tmp_${Date.now()}`;
    const optimistic: HumanMessage = {
      id: tmpId,
      student_id: session.id,
      sender_id: session.id,
      content: text,
      created_at: new Date().toISOString(),
    };
    setHumanMsgs((prev) => [...prev, optimistic]);
    const res = await sendHumanMessage(session.id, session.id, text, cycleKey);
    if (res?.error) {
      setHumanMsgs((prev) => prev.filter((m) => m.id !== tmpId));
      setChatError(res.error);
    }
  }

  async function handleSummaryBlur(value: string) {
    setCurrentSummary(value);
    await saveSummary(session.id, phase, value);
  }

  async function handleNoteSave(value: string) {
    const res = await saveStudentNote(session.id, cycleKey, value);
    if (res?.error) showToast(`노트 저장 실패: ${res.error}`, 'error');
    return res;
  }

  function handleNoteBeacon(value: string) {
    const payload = JSON.stringify({ studentId: session.id, cycleKey, content: value });
    navigator.sendBeacon('/api/save-note', new Blob([payload], { type: 'application/json' }));
  }

  // "사이클 종료" — advance the student from cycleN_da to the separate cycleN_done phase.
  async function handleFinishCycle() {
    if (finishing || !daFinished) return;
    setFinishing(true);
    const res = await studentAdvancePhase(session.id);
    if (res?.error) { showToast(res.error, 'error'); setFinishing(false); return; }
    router.refresh();
  }

  // ─── Right panel ─────────────────────────────────────────────────────────────

  function renderChatbotPanel() {
    // Init failed (e.g. AI provider quota/rate limit) — show the error and let the
    // student retry, instead of spinning forever with the failure hidden.
    if (!daState && daInitError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-white border border-slate-200 rounded-lg p-6 gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9 16H3l9-16z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">평가를 시작하지 못했습니다</p>
          <p className="text-xs text-slate-400 break-words max-w-full">{daInitError}</p>
          <button
            onClick={runDAInit}
            disabled={chatLoading}
            className="mt-1 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {chatLoading ? '재시도 중...' : '다시 시도'}
          </button>
        </div>
      );
    }

    // DA not ready yet (pipeline still running)
    if (!daState || tabs.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-white border border-slate-200 rounded-lg p-6 gap-3">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">평가 준비 중...</p>
        </div>
      );
    }

    const activeMessages = messagesPerItem[activeItemKey] ?? [];
    const isResolved = daState.resolutions[activeItemKey] ?? false;

    return (
      <div className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 shrink-0">
          {tabs.map((key, idx) => {
            const locked = isTabLocked(idx);
            const resolved = daState.resolutions[key] ?? false;
            const isActive = activeTabIdx === idx;
            return (
              <button
                key={key}
                onClick={() => { if (!locked) setActiveTabIdx(idx); }}
                disabled={locked}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                  resolved && isActive
                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                    : resolved
                    ? 'border-transparent text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                    : isActive
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : locked
                    ? 'border-transparent text-slate-300 cursor-not-allowed'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                과제 {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="h-full overflow-y-auto p-3">
            {activeMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs text-center gap-2 px-4">
                대화를 시작해주세요.
              </div>
            )}
            {activeMessages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 shrink-0 mt-0.5">AI</div>
                  )}
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            {chatLoading && activeItemKey === tabs[daState.current_item_idx ?? 0] && (
              <div className="flex justify-start mb-2">
                <div className="bg-slate-100 px-3 py-2 rounded-lg text-sm text-slate-400">입력 중...</div>
              </div>
            )}
            {isResolved && (
              <div className="flex justify-center my-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">과제 완료 ✓</span>
              </div>
            )}
          </div>
          {showJump && <JumpToBottomButton onClick={scrollChatToBottom} />}
        </div>

        {chatError && (
          <p className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100 shrink-0">{chatError}</p>
        )}

        {/* Input — hidden when tab is resolved */}
        {!isResolved && (
          <ChatInputBar onSend={handleSend} loading={chatLoading} placeholder="메시지를 입력하세요..." />
        )}
      </div>
    );
  }

  function renderHumanPanel() {
    const mentorLabel = mentorName ?? '멘토';
    const chatEnabled = mentorOnline;

    return (
      <div className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Header with presence */}
        <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-700">{mentorLabel}</span>
            <button
              onClick={() => setChatCollapsed(true)}
              title="채팅 접기"
              className="text-slate-400 hover:text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              나 (접속 중)
            </span>
            <span className={`flex items-center gap-1.5 text-xs ${mentorOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mentorOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {mentorLabel} {mentorOnline ? '(접속 중)' : '(오프라인)'}
            </span>
          </div>
        </div>

        {/* Offline notice */}
        {!chatEnabled && (
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
            <p className="text-xs text-amber-700">멘토가 접속하면 채팅이 활성화됩니다.</p>
          </div>
        )}

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="h-full overflow-y-auto p-3">
            {humanMsgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs text-center gap-2 px-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {chatEnabled ? '대화를 시작해보세요.' : '멘토의 접속을 기다리고 있습니다.'}
              </div>
            )}
            {humanMsgs.map((msg) => {
              const isMe = msg.sender_id === session.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                    isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div className="flex justify-start mb-2">
                <div className="bg-slate-100 px-3 py-2 rounded-lg text-sm text-slate-400">전송 중...</div>
              </div>
            )}
            {learningCompleted && (
              <div className="flex justify-start mb-2">
                <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed bg-amber-100 text-amber-800 border border-amber-200">
                  멘토가 대화를 종료하였습니다. 요약문을 작성하세요.
                </div>
              </div>
            )}
          </div>
          {showJump && <JumpToBottomButton onClick={scrollChatToBottom} />}
        </div>

        {/* Input */}
        <ChatInputBar
          onSend={handleHumanSend}
          loading={chatLoading}
          disabled={!chatEnabled || learningCompleted}
          placeholder={learningCompleted ? '대화가 종료되었습니다.' : chatEnabled ? '메시지를 입력하세요...' : '멘토 접속 대기 중...'}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-0">
      {/* Main area */}
      <div ref={mainAreaRef} className="flex-1 flex gap-3 min-h-0">
        {/* Left: 4 panels (passage + summary on top, reference + notes below) */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex gap-3 min-h-0 flex-1">
            <div className="flex-1 min-h-0">
              <ReadingPassagePanel
                title={passage.title}
                content={passage.content}
                highlightSummary={currentSummary}
                highlightActive={highlightOn}
              />
            </div>
            <div className="flex-1 min-h-0">
              <SummaryPanel
                initialValue={initialSummary}
                onBlur={handleSummaryBlur}
                onValueChange={setCurrentSummary}
                submitted={submitted}
                submitting={false}
                hideSubmit={true}
                passageContent={passage.content}
                highlightOn={highlightOn}
                onToggleHighlight={() => setHighlightOn((v) => !v)}
              />
            </div>
          </div>

          {/* Vertical resize handle — drag up/down to resize passage & summary */}
          <div
            onPointerDown={handleResizeStart}
            title="위아래로 드래그하여 크기 조절"
            className="group shrink-0 h-3 my-1 flex items-center justify-center cursor-row-resize"
          >
            <div className="w-16 h-1 rounded-full bg-slate-300 group-hover:bg-indigo-400 transition-colors" />
          </div>

          <div className="flex gap-3 shrink-0" style={{ height: bottomHeight }}>
            <div className="flex-1 min-h-0"><ReferenceToolsPanel /></div>
            <div className="flex-1 min-h-0">
              <NotesPanel initialValue={note ?? ''} onSave={handleNoteSave} onBeaconSave={handleNoteBeacon} />
            </div>
          </div>
        </div>

        {/* Right: chatbot or human panel */}
        {!isChatbot && chatCollapsed ? (
          <div className="shrink-0 flex flex-col items-center gap-2 pt-1">
            <button
              onClick={() => setChatCollapsed(false)}
              title="채팅 열기"
              className="flex flex-col items-center gap-2 px-2 py-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors h-full"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs text-slate-500 [writing-mode:vertical-rl]">채팅 열기</span>
              {mentorOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </button>
          </div>
        ) : (
          <div className="basis-[24%] min-w-0 shrink-0">
            {isChatbot ? renderChatbotPanel() : renderHumanPanel()}
          </div>
        )}
      </div>

      {/* Cycle-finish bar — enabled once the DA is finished (chatbot: all tasks resolved,
          human: mentor marked 학습 완료). Moves the student to the separate done phase. */}
      <div className="shrink-0 flex items-center justify-end gap-3 pt-1">
        {!daFinished && isChatbot && (
          <span className="text-xs text-slate-400">
            모든 과제를 완료하면 종료할 수 있습니다.
          </span>
        )}
        <button
          onClick={handleFinishCycle}
          disabled={!daFinished || finishing}
          title={daFinished ? '' : '동적평가가 완료되면 활성화됩니다.'}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {finishing ? '이동 중...' : `사이클 ${cycleNum} 종료`}
        </button>
      </div>
    </div>
  );
}
