'use client';

import { useState } from 'react';
import { PHASE_LABEL, getSubmitLabel, PHASES } from '@/lib/phases';
import { studentAdvancePhase } from '@/actions/student';
import { useToast } from '@/components/ui/Toast';

export default function BlankPhase({ phase, studentId }: { phase: string; studentId: string }) {
  const label = PHASE_LABEL[phase as keyof typeof PHASE_LABEL] ?? phase;
  const submitLabel = getSubmitLabel(phase);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleAdvance() {
    setLoading(true);
    const res = await studentAdvancePhase(studentId);
    setLoading(false);
    if (res?.error) showToast(res.error, 'error');
  }

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-6">
      <div>
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 mx-auto">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-700 mb-2">{label}</h2>
        <p className="text-slate-500 text-sm max-w-sm">
          이 세션은 준비 중입니다. 관리자의 안내에 따라 진행해주세요.
        </p>
      </div>

      <button
        onClick={handleAdvance}
        disabled={loading || phase === PHASES[PHASES.length - 1]}
        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? '처리 중...' : submitLabel}
      </button>
    </div>
  );
}
