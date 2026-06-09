'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import { submitDraft, saveNotes, saveSummary, studentAdvancePhase } from '@/actions/student';
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [summaryValue, setSummaryValue] = useState(sessionData?.summary ?? '');

  async function handleSummaryBlur(value: string) {
    await saveSummary(session.id, phase, value);
  }

  async function handleNotesBlur(value: string) {
    await saveNotes(session.id, phase, value);
  }

  async function handleConfirmSubmit() {
    if (!summaryValue.trim()) { showToast('요약문을 입력해주세요.', 'error'); setShowConfirmModal(false); return; }
    setSubmitting(true);
    const res = await submitDraft(session.id, phase, summaryValue);
    if (res?.error) { showToast(res.error, 'error'); setSubmitting(false); setShowConfirmModal(false); return; }
    setSubmitted(true);
    await studentAdvancePhase(session.id);
    setSubmitting(false);
    setShowConfirmModal(false);
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 min-h-0">
      {/* Top row — fills remaining space */}
      <div className="flex gap-3 min-h-0 flex-1">
        <div className="flex-1 min-h-0">
          <ReadingPassagePanel title={passage.title} content={passage.content} />
        </div>
        <div className="flex-1 min-h-0">
          <SummaryPanel
            initialValue={sessionData?.summary ?? ''}
            onBlur={handleSummaryBlur}
            onValueChange={setSummaryValue}
            submitted={submitted}
            submitting={false}
            hideSubmit={true}
          />
        </div>
      </div>

      {/* Bottom row — fixed height */}
      <div className="flex gap-3 shrink-0 h-52">
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

      {/* Submit bar */}
      <div className="shrink-0 flex justify-end pt-1">
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={!summaryValue.trim()}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          제출
        </button>
      </div>

      {/* Confirmation modal */}
      <Modal
        open={showConfirmModal}
        onClose={() => !submitting && setShowConfirmModal(false)}
        title="요약문 제출"
      >
        <p className="text-sm text-slate-600 mb-6">
          요약문을 제출하시겠습니까?<br />
          <span className="text-slate-400 text-xs">제출 후에는 수정할 수 없습니다.</span>
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowConfirmModal(false)}
            disabled={submitting}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-40 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirmSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {submitting && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {submitting ? '처리 중...' : '제출'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
