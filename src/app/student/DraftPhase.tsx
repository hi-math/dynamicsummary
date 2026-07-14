'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import SummaryPanel from '@/components/panels/SummaryPanel';
import ReferenceToolsPanel from '@/components/panels/ReferenceToolsPanel';
import NotesPanel from '@/components/panels/NotesPanel';
import { submitDraft, saveStudentNote, saveSummary, studentAdvancePhase } from '@/actions/student';
import { cycleKeyFromPhase } from '@/lib/phases';
import type { SessionCookie, SessionData } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

export default function DraftPhase({
  session,
  phase,
  passage,
  sessionData,
  note,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
  note: string;
}) {
  const { showToast } = useToast();
  const cycleKey = cycleKeyFromPhase(phase);
  const [submitted, setSubmitted] = useState(!!sessionData?.submitted_at);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [summaryValue, setSummaryValue] = useState(sessionData?.summary ?? '');
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

  async function handleSummaryBlur(value: string) {
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
      <div ref={mainAreaRef} className="flex-1 flex flex-col min-h-0">
        {/* Top row — fills remaining space */}
        <div className="flex gap-3 min-h-0 flex-1">
          <div className="flex-1 min-h-0">
            <ReadingPassagePanel
              title={passage.title}
              content={passage.content}
              highlightSummary={summaryValue}
              highlightActive={highlightOn}
            />
          </div>
          <div className="flex-1 min-h-0">
            <SummaryPanel
              initialValue={sessionData?.summary ?? ''}
              onBlur={handleSummaryBlur}
              onValueChange={setSummaryValue}
              submitted={submitted}
              submitting={false}
              hideSubmit={true}
              passageContent={passage.content}
              highlightOn={highlightOn}
              onToggleHighlight={() => setHighlightOn((v) => !v)}
              placeholder={'- 하나의 완전한 단락 형식으로 영어 요약문을 작성해 주세요. (분량: 140~200단어)\n- 요약문 작성을 마친 후, 다음 페이지로 이동하여 읽기 이해도 점검을 위한 3개의 문항에 모두 답해 주시기 바랍니다.'}
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

        {/* Bottom row — resizable height */}
        <div className="flex gap-3 shrink-0" style={{ height: bottomHeight }}>
          <div className="flex-1 min-h-0">
            <ReferenceToolsPanel />
          </div>
          <div className="flex-1 min-h-0">
            <NotesPanel
              initialValue={note}
              onSave={handleNoteSave}
              onBeaconSave={handleNoteBeacon}
            />
          </div>
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
