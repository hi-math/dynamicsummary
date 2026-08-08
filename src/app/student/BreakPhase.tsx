'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/actions/student';
import { cycleKeyFromPhase } from '@/lib/phases';

// 브레이크(휴식) 화면 — 이해도검사와 동적평가 사이의 별도 단계(cycleN_break).
// 챗봇팀만 거친다. 휴먼팀은 이 단계를 건너뛰고 동적평가 화면에서 멘토를 기다린다
// (nextPhaseFor 가 팀에 따라 건너뛴다).
//
// 동적평가 첫 피드백은 이해도검사 단계에서 이미 생성이 끝나 있다. 여기서는 아무것도
// 호출하지 않고 관리자가 다음 단계로 넘길 때까지 기다리기만 한다.
export default function BreakPhase({
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
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1.5">잠시 쉬어가는 시간입니다</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          사이클 {cycleNum} 이해도 검사가 끝났습니다. 잠시 후 동적평가가 시작됩니다.<br />
          관리자가 안내할 때까지 이 화면에서 기다려 주세요.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        동적평가 대기 중...
      </div>
    </div>
  );
}
