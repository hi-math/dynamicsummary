'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import {
  submitDraft, saveNotes, saveSummary, studentAdvancePhase,
  startDASession, sendDAMessage, advanceDATab,
} from '@/actions/student';
import { sendHumanMessage, getHumanMessages, updatePresence, getPresence, getLearningComplete } from '@/actions/mentor';
import { cycleKeyFromPhase } from '@/lib/phases';
import type { SessionCookie, SessionData, AIMessage, HumanMessage, DASessionState } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

type LocalMsg = { role: 'user' | 'assistant'; content: string; id: string };

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
  const ref = useRef<HTMLInputElement>(null);

  async function submit() {
    const t = text.trim();
    if (!t || loading || disabled) return;
    setText('');
    await onSend(t);
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className="p-2 border-t border-slate-200 shrink-0 flex gap-2">
      <input
        ref={ref}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <button
        onClick={submit}
        disabled={loading || disabled || !text.trim()}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center w-9"
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
  mentorId?: string;
  mentorName?: string;
}) {
  const { showToast } = useToast();
  const isChatbot = session.team === 'chatbot';

  // DA starts automatically on entry — the summary was already finalized in the draft stage,
  // so there is no separate submit step here.
  const submitted = true;
  const [advancing, setAdvancing] = useState(false);
  // Human team: mentor must mark "학습 완료" before the student can advance.
  const [learningCompleted, setLearningCompleted] = useState(!!sessionData?.learning_completed);
  const [daState, setDaState] = useState<DASessionState | null>(initialDAState ?? null);
  // draftSummary: the draft text used for Assessor judgment; falls back to saved DA summary
  const initialSummary = draftSummary ?? sessionData?.summary ?? '';
  const [currentSummary, setCurrentSummary] = useState(initialSummary);

  // Per-item chat messages (chatbot only)
  const [messagesPerItem, setMessagesPerItem] = useState<Record<string, LocalMsg[]>>(() => {
    const initial: Record<string, LocalMsg[]> = {};
    const firstItem = initialDAState?.priority_queue?.[0];
    if (firstItem && aiMessages.length > 0) {
      initial[firstItem] = aiMessages.map((m) => ({ role: m.role, content: m.content, id: m.id }));
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
  const bottomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const daInitRef = useRef(false);

  // Human messages state (human team)
  const [humanMsgs, setHumanMsgs] = useState(humanMessages);
  const [mentorOnline, setMentorOnline] = useState(false);

  const tabs = daState?.priority_queue ?? [];
  const allResolved = tabs.length > 0 && tabs.every((k) => daState?.resolutions[k]);
  const currentItemKey = tabs[daState?.current_item_idx ?? 0] ?? null;
  const activeItemKey = tabs[activeTabIdx] ?? null;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeItemKey) {
      bottomRefs.current[activeItemKey]?.scrollIntoView({ behavior: 'smooth' });
    }
    bottomRefs.current['human']?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesPerItem, activeItemKey, humanMsgs]);

  // Auto-start DA on entry (chatbot). Uses the pre-generated state if present
  // (built during the comprehension phase); otherwise runs the Assessor pipeline now.
  useEffect(() => {
    const assessmentSummary = draftSummary || currentSummary;
    if (!isChatbot || daState || daInitRef.current || !assessmentSummary) return;
    daInitRef.current = true;
    setChatLoading(true);
    startDASession(session.id, phase, assessmentSummary, passage.content).then((res) => {
      setChatLoading(false);
      if (res.error) { setChatError(res.error); return; }
      setDaState(res.state);
      setActiveTabIdx(0);
      if (res.openingUtterance && res.state.priority_queue[0]) {
        const key = res.state.priority_queue[0];
        setMessagesPerItem({ [key]: [{ role: 'assistant', content: res.openingUtterance, id: String(Date.now()) }] });
      }
    });
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
  const cycleNum = cycleKey.replace('cycle', '');
  useEffect(() => {
    if (isChatbot) return;
    pollRef.current = setInterval(async () => {
      const fresh = await getHumanMessages(session.id, cycleKey);
      setHumanMsgs(fresh);
    }, 1800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [session.id, isChatbot]);

  // Human team: poll mentor's learning-completion approval to enable the advance button
  useEffect(() => {
    if (isChatbot || learningCompleted) return;
    const interval = setInterval(async () => {
      const done = await getLearningComplete(session.id, phase);
      if (done) setLearningCompleted(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [session.id, phase, isChatbot, learningCompleted]);

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
    if (!text.trim() || chatLoading) return;
    setChatLoading(true);
    await sendHumanMessage(session.id, session.id, text, cycleKey);
    const fresh = await getHumanMessages(session.id, cycleKey);
    setHumanMsgs(fresh);
    setChatLoading(false);
  }

  async function handleAdvance() {
    setAdvancing(true);
    const res = await studentAdvancePhase(session.id);
    setAdvancing(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast(`사이클 ${cycleNum}이 종료되었습니다. 수고하셨습니다.`, 'success');
  }

  async function handleSummaryBlur(value: string) {
    setCurrentSummary(value);
    await saveSummary(session.id, phase, value);
  }

  async function handleNotesBlur(value: string) {
    await saveNotes(session.id, phase, value);
  }

  // ─── Right panel ─────────────────────────────────────────────────────────────

  function renderChatbotPanel() {
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
        <div className="flex-1 overflow-y-auto p-3">
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
          <div ref={(el) => { bottomRefs.current[activeItemKey] = el; }} />
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
        <div className="flex-1 overflow-y-auto p-3">
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
          <div ref={(el) => { if (el) bottomRefs.current['human'] = el; }} />
        </div>

        {/* Input */}
        <ChatInputBar
          onSend={handleHumanSend}
          loading={chatLoading}
          disabled={!chatEnabled}
          placeholder={chatEnabled ? '메시지를 입력하세요...' : '멘토 접속 대기 중...'}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-0">
      {/* Main area */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left: 4 panels (passage 33% + summary 33% = 76%) */}
        <div className="basis-[76%] min-w-0 flex flex-col gap-3 min-h-0">
          <div className="flex gap-3 min-h-0 flex-1">
            <div className="flex-1 min-h-0">
              <ReadingPassagePanel title={passage.title} content={passage.content} />
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
              />
            </div>
          </div>
          <div className="flex gap-3 shrink-0 h-52">
            <div className="flex-1 min-h-0"><ReferenceToolsPanel /></div>
            <div className="flex-1 min-h-0">
              <NotesPanel initialValue={sessionData?.notes ?? ''} onBlur={handleNotesBlur} />
            </div>
          </div>
        </div>

        {/* Right: chatbot or human panel (24%) */}
        <div className="basis-[24%] min-w-0 shrink-0">
          {isChatbot ? renderChatbotPanel() : renderHumanPanel()}
        </div>
      </div>

      {/* Bottom advance button */}
      <div className="shrink-0 flex justify-end">
        <button
          onClick={handleAdvance}
          disabled={advancing || (isChatbot ? !allResolved : !learningCompleted)}
          title={!isChatbot && !learningCompleted ? '멘토가 학습 완료를 승인하면 활성화됩니다.' : undefined}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {advancing && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {advancing ? '처리 중...' : `사이클 ${cycleNum} 종료`}
        </button>
      </div>
    </div>
  );
}
