'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/actions/student';
import { cycleKeyFromPhase } from '@/lib/phases';

// 사이클 종료(대기) 화면 — 동적평가와 분리된 별도 단계(cycleN_done).
// 학생은 여기서 관리자가 다음 단계로 안내할 때까지 대기한다. (단계 전환은 admin이 제어)
export default function CycleCompletePhase({
  session,
  phase,
}: {
  session: { id: string };
  phase: string;
}) {
  const router = useRouter();
  const cycleNum = cycleKeyFromPhase(phase).replace('cycle', '');

  // 관리자가 다음 단계로 이동시키면 화면을 새로고침한다.
  useEffect(() => {
    const interval = setInterval(async () => {
      const u = await getCurrentUser(session.id);
      if (u && u.current_phase !== phase) router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, session.id, router]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 gap-5 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1.5">사이클 {cycleNum} 동적평가를 완료했습니다</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          수고하셨습니다. 관리자가 다음 단계로 안내할 때까지<br />
          이 화면에서 잠시 기다려 주세요.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        다음 단계 대기 중...
      </div>
    </div>
  );
}
