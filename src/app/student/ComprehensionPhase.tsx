'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { submitComprehensionAnswers, studentAdvancePhase } from '@/actions/student';
import type { SessionCookie, ComprehensionQuestion } from '@/types';

const TIME_LIMIT_SEC = 180; // 3 minutes

export default function ComprehensionPhase({
  session,
  phase,
  questions,
  alreadySubmitted,
}: {
  session: SessionCookie;
  phase: string;
  questions: ComprehensionQuestion[];
  alreadySubmitted: boolean;
}) {
  const { showToast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SEC);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  async function handleSubmit(byTimer = false) {
    if (submitting || submitted) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsed = Math.round((Date.now() - startRef.current) / 1000);
    await submitComprehensionAnswers(session.id, phase, answers, elapsed);

    if (!byTimer) showToast('이해도 검사가 제출되었습니다.', 'success');
    setSubmitted(true);
    setSubmitting(false);
  }

  async function handleAdvance() {
    setSubmitting(true);
    await studentAdvancePhase(session.id);
    setSubmitting(false);
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
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {submitting ? '처리 중...' : '다음 단계로'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-base font-semibold text-slate-800">지문 이해도 검사</h2>
        {!submitted && (
          <div className={`text-sm font-mono font-semibold px-3 py-1 rounded-lg ${timeLeft <= 30 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {mm}:{ss}
          </div>
        )}
      </div>

      {submitted ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-700 mb-1">검사 완료</p>
            <p className="text-sm text-slate-500">관리자의 안내에 따라 다음 단계를 진행해주세요.</p>
          </div>
          <button
            onClick={handleAdvance}
            disabled={submitting}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {submitting ? '처리 중...' : '동적평가 시작'}
          </button>
        </div>
      ) : (
        <>
          {/* Questions */}
          <div className="flex flex-col gap-5 flex-1">
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
          <div className="shrink-0 flex justify-end pt-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting || !allAnswered}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? '제출 중...' : '제출하고 넘어가기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
