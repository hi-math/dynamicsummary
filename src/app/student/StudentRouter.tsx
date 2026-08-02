'use client';

import { isDraftPhase, isComprehensionPhase, isDAPhase, isDonePhase } from '@/lib/phases';
import DraftPhase from './DraftPhase';
import ComprehensionPhase from './ComprehensionPhase';
import DASession from './DASession';
import CycleCompletePhase from './CycleCompletePhase';
import { ToastProvider } from '@/components/ui/Toast';
import type { SessionCookie, SessionData, AIMessage, HumanMessage, ComprehensionQuestion, DASessionState } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

export default function StudentRouter({
  session,
  phase,
  passage,
  sessionData,
  aiMessages,
  humanMessages,
  comprehensionQuestions,
  comprehensionSubmitted,
  daSessionState,
  draftSummary,
  note,
  mentorId,
  mentorName,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
  comprehensionQuestions: ComprehensionQuestion[];
  comprehensionSubmitted: boolean;
  daSessionState: DASessionState | null;
  draftSummary?: string;
  note?: string;
  mentorId?: string;
  mentorName?: string;
}) {
  // key={phase} 는 필수다. 같은 종류의 화면끼리 단계가 바뀌면(cycle1_draft → cycle2_draft,
  // cycle1_da → cycle2_da) React 가 같은 인스턴스를 재사용해 useState 초기값이 갱신되지 않는다.
  // 그러면 2차 사이클 화면에 1차 사이클의 요약문·채팅·DA 상태가 남고, 그대로 제출하면
  // 다음 사이클의 평가가 1차 제출물로 실행된다. 단계가 바뀌면 항상 새로 마운트한다.
  return (
    <ToastProvider>
      {isDraftPhase(phase) && (
        <DraftPhase
          key={phase}
          session={session}
          phase={phase}
          passage={passage}
          sessionData={sessionData}
          note={note ?? ''}
        />
      )}
      {isComprehensionPhase(phase) && (
        <ComprehensionPhase
          key={phase}
          session={session}
          phase={phase}
          questions={comprehensionQuestions}
          alreadySubmitted={comprehensionSubmitted}
          draftSummary={draftSummary}
          passage={passage}
        />
      )}
      {isDAPhase(phase) && (
        <DASession
          key={phase}
          session={session}
          phase={phase}
          passage={passage}
          sessionData={sessionData}
          aiMessages={aiMessages}
          humanMessages={humanMessages}
          initialDAState={daSessionState}
          draftSummary={draftSummary}
          note={note ?? ''}
          mentorId={mentorId}
          mentorName={mentorName}
        />
      )}
      {isDonePhase(phase) && (
        <CycleCompletePhase key={phase} session={session} phase={phase} />
      )}
    </ToastProvider>
  );
}
