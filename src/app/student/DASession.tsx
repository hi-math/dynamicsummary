'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ChatPanel from '@/components/panels/ChatPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import { submitToAI, saveNotes, saveSummary, studentAdvancePhase } from '@/actions/student';
import type { SessionCookie, SessionData, AIMessage, HumanMessage } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

export default function DASession({
  session,
  phase,
  passage,
  sessionData,
  aiMessages,
  humanMessages,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
}) {
  const { showToast } = useToast();
  const [submitted, setSubmitted] = useState(!!sessionData?.submitted_at);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(sessionData?.summary ?? '');

  async function handleSubmit() {
    if (!currentSummary.trim()) { showToast('요약문을 입력해주세요.', 'error'); return; }
    setSubmitting(true);

    if (session.team === 'chatbot') {
      const res = await submitToAI(session.id, phase, currentSummary, passage.content);
      setSubmitting(false);
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('AI 평가가 시작되었습니다.', 'success');
    } else {
      const { submitDraft } = await import('@/actions/student');
      const res = await submitDraft(session.id, phase, currentSummary);
      setSubmitting(false);
      if (res?.error) { showToast(res.error, 'error'); return; }
      showToast('요약문이 제출되었습니다. 멘토의 피드백을 기다려주세요.', 'success');
    }

    setSubmitted(true);
  }

  async function handleAdvance() {
    setAdvancing(true);
    const res = await studentAdvancePhase(session.id);
    setAdvancing(false);
    if (res?.error) showToast(res.error, 'error');
  }

  async function handleSummaryBlur(value: string) {
    setCurrentSummary(value);
    await saveSummary(session.id, phase, value);
  }

  async function handleNotesBlur(value: string) {
    await saveNotes(session.id, phase, value);
  }

  return (
    <div className="h-full flex p-3 gap-3 min-h-0">
      {/* Left: 4 panels (reading+summary top, reftools+notes bottom) */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Top row — 75% */}
        <div className="flex gap-3 min-h-0" style={{ flex: '3' }}>
          <div className="flex-1 min-h-0">
            <ReadingPassagePanel title={passage.title} content={passage.content} />
          </div>
          <div className="flex-1 min-h-0">
            <SummaryPanel
              initialValue={sessionData?.summary ?? ''}
              onBlur={handleSummaryBlur}
              onValueChange={setCurrentSummary}
              submitted={submitted}
              submitting={submitting}
              hideSubmit
            />
          </div>
        </div>

        {/* Bottom row — 25% */}
        <div className="flex gap-3 min-h-0" style={{ flex: '1' }}>
          <div className="flex-1 min-h-0">
            <ReferenceToolsPanel />
          </div>
          <div className="flex-1 min-h-0">
            <NotesPanel
              initialValue={sessionData?.notes ?? ''}
              onBlur={handleNotesBlur}
            />
          </div>
        </div>
      </div>

      {/* Right: Chat (full height, collapsible) */}
      <ChatPanel
        session={session}
        phase={phase}
        passageContent={passage.content}
        summary={currentSummary}
        initialAIMessages={aiMessages}
        initialHumanMessages={humanMessages}
        submitted={submitted}
        submitting={submitting}
        advancing={advancing}
        onSubmit={handleSubmit}
        onAdvance={handleAdvance}
        collapsed={chatCollapsed}
        onToggleCollapse={() => setChatCollapsed((v) => !v)}
      />
    </div>
  );
}
