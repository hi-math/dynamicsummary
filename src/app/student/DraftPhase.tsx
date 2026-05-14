'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import { submitDraft, saveNotes, saveSummary, studentAdvancePhase } from '@/actions/student';
import { getSubmitLabel } from '@/lib/phases';
import type { SessionCookie, SessionData } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

export default function DraftPhase({
  session,
  phase,
  passage,
  sessionData,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
}) {
  const { showToast } = useToast();
  const [submitted, setSubmitted] = useState(!!sessionData?.submitted_at);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  async function handleSubmit(summary: string) {
    if (!summary.trim()) { showToast('요약문을 입력해주세요.', 'error'); return; }
    setSubmitting(true);
    const res = await submitDraft(session.id, phase, summary);
    setSubmitting(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setSubmitted(true);
    showToast('요약문이 제출되었습니다.', 'success');
  }

  async function handleSummaryBlur(value: string) {
    await saveSummary(session.id, phase, value);
  }

  async function handleNotesBlur(value: string) {
    await saveNotes(session.id, phase, value);
  }

  async function handleAdvance() {
    setAdvancing(true);
    const res = await studentAdvancePhase(session.id);
    setAdvancing(false);
    if (res?.error) showToast(res.error, 'error');
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-0">
      {/* Top row: 75% */}
      <div className="flex gap-3 min-h-0" style={{ flex: '3' }}>
        <div className="flex-1 min-h-0">
          <ReadingPassagePanel title={passage.title} content={passage.content} />
        </div>
        <div className="flex-1 min-h-0">
          <SummaryPanel
            initialValue={sessionData?.summary ?? ''}
            onBlur={handleSummaryBlur}
            onSubmit={handleSubmit}
            submitted={submitted}
            submitting={submitting}
          />
        </div>
      </div>

      {/* Bottom row: 25% */}
      <div className="flex gap-3 min-h-0" style={{ flex: '1' }}>
        <div className="flex-1">
          <ReferenceToolsPanel />
        </div>
        <div className="flex-1">
          <NotesPanel
            initialValue={sessionData?.notes ?? ''}
            onBlur={handleNotesBlur}
          />
        </div>
      </div>

      {/* Phase advance bar */}
      <div className="shrink-0 flex justify-end pt-1">
        <button
          onClick={handleAdvance}
          disabled={advancing || !submitted}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {advancing ? '처리 중...' : getSubmitLabel(phase)}
        </button>
      </div>
    </div>
  );
}
