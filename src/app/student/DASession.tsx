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
  startDASession, sendDAMessage, studentAdvancePhase,
} from '@/actions/student';
import { sendHumanMessage, updatePresence, isUserOnline, getLearningComplete } from '@/actions/mentor';
import { cycleKeyFromPhase, isValidPhase } from '@/lib/phases';
import Modal from '@/components/ui/Modal';
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

  // 유닛 상태(PI/PSV 누적, 단계, 목표)는 서버가 소유한다 (0719 설계).
  // 클라이언트는 daState.active_unit 을 읽기만 하고 따로 미러링하지 않는다.

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
  // "사이클 종료" 확인 모달 + 전송 중 상태
  const [showFinishModal, setShowFinishModal] = useState(false);
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
  // 대기 화면에서 기다리게 되는 다음 사이클. 마지막 사이클이면 다음이 없다.
  const nextCycleNum = isValidPhase(`cycle${Number(cycleNum) + 1}_draft`)
    ? String(Number(cycleNum) + 1)
    : null;

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

  // Own heartbeat — update our presence every 10s (and immediately when the tab
  // becomes visible again, since background timers get throttled).
  useEffect(() => {
    if (isChatbot) return;
    const beat = () => updatePresence(session.id);
    beat();
    const interval = setInterval(beat, 10000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [session.id, isChatbot]);

  // Poll mentor presence every 5s. 판정은 서버가 한다 (lib/presence.ts) —
  // 클라이언트 시계로 비교하면 학생 PC 시계가 어긋난 만큼 멘토가 계속 오프라인으로 보인다.
  useEffect(() => {
    if (isChatbot || !mentorId) return;
    async function checkMentor() {
      if (!mentorId) return;
      setMentorOnline(await isUserOnline(mentorId));
    }
    checkMentor();
    const interval = setInterval(checkMentor, 5000);
    const onVis = () => { if (document.visibilityState === 'visible') checkMentor(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
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

    // 활성 유닛·단계·목표는 서버가 소유한다 (0719 설계). 클라이언트는 미러링하지 않는다.
    const res = await sendDAMessage(session.id, phase, text, passage.content);

    if (res.error) {
      setChatError(res.error);
      setMessagesPerItem((prev) => ({
        ...prev,
        [activeItemKey]: (prev[activeItemKey] ?? []).filter((m) => m.id !== tempId),
      }));
    } else {
      // 종료 발화는 앞 발화와 합치지 않고 별도 말풍선으로 띄운다.
      setMessagesPerItem((prev) => ({
        ...prev,
        [activeItemKey]: [
          ...(prev[activeItemKey] ?? []).filter((m) => m.id !== tempId),
          { role: 'user', content: text, id: tempId },
          ...(res.utterance
            ? [{ role: 'assistant' as const, content: res.utterance, id: String(Date.now() + 1) }]
            : []),
          ...(res.closing_message
            ? [{ role: 'assistant' as const, content: res.closing_message, id: String(Date.now() + 2) }]
            : []),
        ],
      }));

      setChatLoading(false);
      setDaState(res.updated_state);

      // 탭 전환은 서버 엔진이 이미 처리했다. 새 탭의 첫 발화만 그 탭에 붙인다.
      // 자동으로 넘기지 않고, 학생이 마지막 메시지를 읽은 뒤 직접 이동하게 둔다.
      // 완료 안내는 사라지는 토스트가 아니라 대화 끝에 남는 완료 카드가 담당한다.
      if (res.tab_unlocked && res.next_opening) {
        const nextKey = res.updated_state.priority_queue[res.updated_state.current_item_idx];
        if (nextKey) {
          setMessagesPerItem((prev) => ({
            ...prev,
            [nextKey]: [{ role: 'assistant', content: res.next_opening!, id: String(Date.now() + 3) }],
          }));
        }
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
  // 되돌릴 수 없는 이동이라 드래프트·이해도검사 단계와 같은 확인 모달을 거친다.
  async function handleFinishCycle() {
    if (finishing || !daFinished) return;
    setFinishing(true);
    const res = await studentAdvancePhase(session.id);
    if (res?.error) {
      showToast(res.error, 'error');
      setFinishing(false);
      setShowFinishModal(false);
      return;
    }
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
    // 넘어갈 탭이 남아 있는지로 안내 문구를 가른다. allResolved 를 함께 보는 이유는
    // 27분 제한으로 세션이 조기 종료되면 남은 탭이 한꺼번에 해제되기 때문이다 —
    // 그때는 마지막 탭이 아니어도 다음 탭으로 보내면 안 된다.
    const isFinalTask = allResolved || activeTabIdx === tabs.length - 1;

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
                // min-w-0 + nowrap: 라벨이 길어져도 줄바꿈하거나 탭 폭을 밀어내지 않는다.
                // (버튼의 기본 min-width:auto 를 그대로 두면 세 번째 탭이 패널
                //  overflow-hidden 에 잘려 사라질 수 있다.)
                className={`flex-1 min-w-0 py-2.5 px-1 whitespace-nowrap text-[11px] xl:text-xs font-semibold transition-colors border-b-2 ${
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
                Feedback {idx + 1}
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
              <div className="mt-3 mb-1 px-4 py-3 rounded-xl bg-emerald-50 border-2 border-emerald-400 shadow-sm">
                <p className="text-sm font-bold text-emerald-800 text-center leading-relaxed break-keep">
                  {isFinalTask
                    ? `Feedback ${activeTabIdx + 1} 완료! 수정본을 작성한 후 사이클을 종료해주세요 🫠`
                    : `Feedback ${activeTabIdx + 1} 완료! 채팅창 상단에서 다음 탭으로 넘어가주세요 😁`}
                </p>
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
    // 멘토 미배정(users.mentor_id 없음)은 '오프라인'과 다른 상태다. 예전에는 둘 다
    // 회색 점 + "멘토가 접속하면 채팅이 활성화됩니다."로 보여서, 관리자가 배정을 빠뜨린
    // 것인지 멘토가 아직 안 들어온 것인지 학생도 연구자도 구분할 수 없었다.
    const mentorAssigned = !!mentorId;
    const mentorLabel = mentorName ?? (mentorAssigned ? '멘토' : '멘토 미배정');
    const chatEnabled = mentorAssigned && mentorOnline;

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
            {mentorAssigned ? (
              <span className={`flex items-center gap-1.5 text-xs ${mentorOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${mentorOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                {mentorLabel} {mentorOnline ? '(접속 중)' : '(오프라인)'}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                멘토 미배정
              </span>
            )}
          </div>
        </div>

        {/* 미배정 / 오프라인 안내 — 둘은 조치할 사람이 다르므로 문구를 나눈다. */}
        {!mentorAssigned ? (
          <div className="px-3 py-2 bg-red-50 border-b border-red-100 shrink-0">
            <p className="text-xs text-red-700 font-medium">
              멘토가 배정되지 않았습니다. 관리자에게 문의해주세요.
            </p>
          </div>
        ) : !chatEnabled ? (
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
            <p className="text-xs text-amber-700">멘토가 접속하면 채팅이 활성화됩니다.</p>
          </div>
        ) : null}

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
                  멘토가 대화를 종료하였습니다. 수정본을 작성하세요.
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
          placeholder={
            learningCompleted ? '대화가 종료되었습니다.'
            : chatEnabled ? '메시지를 입력하세요...'
            : mentorAssigned ? '멘토 접속 대기 중...'
            : '멘토 미배정 — 관리자 문의'
          }
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
            모든 탭을 완료하면 종료할 수 있습니다.
          </span>
        )}
        <button
          onClick={() => setShowFinishModal(true)}
          disabled={!daFinished || finishing}
          title={daFinished ? '' : '동적평가가 완료되면 활성화됩니다.'}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {finishing ? '이동 중...' : `사이클 ${cycleNum} 종료`}
        </button>
      </div>

      {/* 사이클 종료 확인 — 되돌릴 수 없는 이동이므로 기본값은 '취소'다.
          Enter·Escape 모두 취소로 빠지도록 취소 버튼에 포커스를 준다. */}
      <Modal
        open={showFinishModal}
        onClose={() => !finishing && setShowFinishModal(false)}
        title={`사이클 ${cycleNum} 종료`}
      >
        <p className="text-sm text-slate-600 mb-3">
          {nextCycleNum ? `사이클 ${nextCycleNum} 대기화면으로 넘어갑니다.` : '대기화면으로 넘어갑니다.'}
        </p>
        <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          주의 : 수정본 작성을 완료해야 합니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            autoFocus
            onClick={() => setShowFinishModal(false)}
            disabled={finishing}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-40 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleFinishCycle}
            disabled={finishing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {finishing && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {finishing ? '이동 중...' : '완료'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
