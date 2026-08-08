'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import { submitComprehensionAnswers, studentAdvancePhase, preGenerateDASession } from '@/actions/student';
import ReadingPassagePanel from '@/components/panels/ReadingPassagePanel';
import type { SessionCookie, ComprehensionQuestion } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

const TIME_LIMIT_SEC = 180; // 3 minutes

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function ComprehensionPhase({
  session,
  phase,
  questions,
  alreadySubmitted,
  draftSummary,
  passage,
}: {
  session: SessionCookie;
  phase: string;
  questions: ComprehensionQuestion[];
  alreadySubmitted: boolean;
  draftSummary?: string;
  passage: Passage;
}) {
  const { showToast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SEC);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // 동적평가 첫 피드백을 기다리는 중 (Assessor + 오프닝 생성). 제출 처리와 구분해서
  // 버튼 문구를 바꾼다 — 학생 입장에서 수십 초가 걸리는 구간은 여기다.
  const [generating, setGenerating] = useState(false);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 백그라운드로 시작한 사전 생성 작업. 제출 시 이 약속을 그대로 기다린다.
  const preGenRef = useRef<Promise<{ success: boolean; error?: string }> | null>(null);

  useEffect(() => {
    if (submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  useEffect(() => {
    if (timeLeft === 0) handleSubmitAndAdvance(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // Pre-generate DA session in background while student answers comprehension questions
  useEffect(() => {
    preGenRef.current = startPreGeneration();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 동적평가 사전 생성 시작. 이미 시작했으면 그 약속을 재사용한다.
   *
   * 제출 시 이 약속을 await 하므로, 학생이 문항을 푸는 동안 끝났으면 대기 없이 넘어가고
   * 아직 돌고 있으면 끝날 때까지 기다린다. 기다리지 않고 단계를 넘기면 DA 화면이
   * 사전 생성이 진행 중인 줄 모르고 Assessor 를 한 번 더 돌린다 (같은 평가 중복 호출).
   */
  function startPreGeneration(): Promise<{ success: boolean; error?: string }> | null {
    if (session.team !== 'chatbot') return null;
    if (!draftSummary?.trim() || !passage.content?.trim()) return null;
    const daPhase = phase.replace('_comprehension', '_da');
    return preGenerateDASession(session.id, daPhase, draftSummary, passage.content)
      .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : '피드백 생성 실패' }));
  }

  async function handleSubmitAndAdvance(byTimer = false) {
    if (submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsed = Math.round((Date.now() - startRef.current) / 1000);
    await submitComprehensionAnswers(session.id, phase, answers, elapsed);
    setSubmitted(true);
    if (!byTimer) showToast('이해도 검사가 제출되었습니다.', 'success');

    await awaitFeedbackThenAdvance();
    setShowConfirmModal(false);
  }

  /**
   * 첫 피드백이 준비된 뒤에 단계를 넘긴다.
   *
   * 여기서 기다리지 않으면 학생은 빈 동적평가 화면에서 '평가 준비 중...' 스피너만 보게 된다.
   * 어차피 같은 시간을 기다리지만, 무엇을 기다리는지 모르는 채로 기다리게 된다.
   */
  async function awaitFeedbackThenAdvance() {
    const pending = preGenRef.current ?? startPreGeneration();
    preGenRef.current = pending;
    if (pending) {
      setGenerating(true);
      const res = await pending;
      // 실패해도 단계는 넘긴다 — DA 화면에 오류와 '다시 시도' 버튼이 있다.
      if (res?.error) showToast(`피드백 생성 실패: ${res.error}`, 'error');
    }
    await studentAdvancePhase(session.id);
    setSubmitting(false);
    setGenerating(false);
  }

  // 이해도 검사 문항이 없는 경우의 '다음 단계로'. 이때도 피드백을 기다린다.
  async function handleAdvance() {
    if (submitting) return;
    setSubmitting(true);
    await awaitFeedbackThenAdvance();
  }

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]?.trim());
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');

  if (questions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-slate-500 text-sm">이해도 검사 문항이 등록되지 않았습니다.</p>
        <button
          onClick={handleAdvance}
          disabled={submitting}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {submitting && <Spinner />}
          {generating ? '동적평가 생성 중...' : submitting ? '처리 중...' : '다음 단계로'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-6 overflow-hidden">
      {/* Left: reading passage */}
      <div className="md:w-1/2 h-1/2 md:h-full shrink-0">
        <ReadingPassagePanel title={passage.title} content={passage.content} />
      </div>

      {/* Right: comprehension questions */}
      <div className="md:w-1/2 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h2 className="text-base font-semibold text-slate-800">지문 이해도 검사</h2>
          <div className={`text-sm font-mono font-semibold px-3 py-1 rounded-lg ${timeLeft <= 30 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {mm}:{ss}
          </div>
        </div>

        {/* Questions */}
        <div className="flex flex-col gap-5 flex-1 overflow-y-auto scrollbar-thin pr-1">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-sm font-medium text-slate-800 mb-3">
                <span className="text-indigo-600 font-semibold mr-2">Q{idx + 1}.</span>
                {q.stem}
              </p>
              {q.type === 'mc' && q.options ? (
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, i) => (
                    <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        className="text-indigo-600 focus:ring-indigo-400"
                      />
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={3}
                  placeholder="답변을 입력하세요..."
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="shrink-0 flex justify-end pt-3">
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting || !allAnswered}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {submitting && <Spinner />}
            {generating ? '동적평가 생성 중...' : submitting ? '처리 중...' : '제출'}
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      <Modal
        open={showConfirmModal}
        onClose={() => !submitting && setShowConfirmModal(false)}
        title="이해도 검사 제출"
      >
        <p className="text-sm text-slate-600 mb-6">
          {generating ? (
            <>
              동적평가를 생성중입니다. 잠시만 기다려주세요.<br />
              <span className="text-slate-400 text-xs">준비가 끝나면 자동으로 이동합니다. 창을 닫지 마세요.</span>
            </>
          ) : (
            <>
              이해도 검사를 제출하시겠습니까?<br />
              <span className="text-slate-400 text-xs">제출 후에는 수정할 수 없습니다.</span>
            </>
          )}
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
            onClick={() => handleSubmitAndAdvance(false)}
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {submitting && <Spinner />}
            {generating ? '동적평가 생성 중...' : submitting ? '처리 중...' : '제출'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
