'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import { submitDraft, saveSummary, saveNotes, studentAdvancePhase } from '@/actions/student';
import { getSubmitLabel } from '@/lib/phases';
import type { SessionCookie, SessionData } from '@/types';
import NotesPanel from '@/components/panels/NotesPanel';

type Passage = { cycle_key: string; title: string; content: string };

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function RevisionPhase({
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
  const [value, setValue] = useState(sessionData?.summary ?? '');
  const [submitted, setSubmitted] = useState(!!sessionData?.submitted_at);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  async function handleBlur() {
    await saveSummary(session.id, phase, value);
  }

  async function handleNotesBlur(v: string) {
    await saveNotes(session.id, phase, v);
  }

  async function handleSubmit() {
    if (!value.trim()) { showToast('재제출 요약문을 입력해주세요.', 'error'); return; }
    setSubmitting(true);
    const res = await submitDraft(session.id, phase, value);
    setSubmitting(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setSubmitted(true);
    showToast('재제출되었습니다.', 'success');
  }

  async function handleAdvance() {
    setAdvancing(true);
    await studentAdvancePhase(session.id);
    setAdvancing(false);
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-0">
      <div className="flex gap-3 min-h-0 flex-1">
        {/* Reading passage */}
        <div className="flex-1 min-h-0">
          <ReadingPassagePanel title={passage.title} content={passage.content} />
        </div>

        {/* Revision textarea */}
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">재제출 요약문</h3>
            <span className="text-xs text-slate-400">{countWords(value)} 단어</span>
          </div>
          <textarea
            className="flex-1 p-4 text-sm text-slate-700 focus:outline-none resize-none leading-relaxed"
            placeholder="DA 피드백을 바탕으로 수정한 요약문을 작성하세요..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
          />
          <div className="px-4 py-2 border-t border-slate-200 shrink-0 text-xs text-amber-600 bg-amber-50">
            재제출 이후 추가 피드백은 제공되지 않습니다. 연구 자료로 활용됩니다.
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex gap-3 shrink-0 h-52">
        <div className="flex-1 min-h-0">
          <NotesPanel
            initialValue={sessionData?.notes ?? ''}
            onBlur={handleNotesBlur}
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-2 justify-end">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || !value.trim()}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? '제출 중...' : '재제출'}
            </button>
          ) : (
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {advancing ? '처리 중...' : getSubmitLabel(phase)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
