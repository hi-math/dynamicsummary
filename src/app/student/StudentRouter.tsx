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
  return (
    <ToastProvider>
      {isDraftPhase(phase) && (
        <DraftPhase
          session={session}
          phase={phase}
          passage={passage}
          sessionData={sessionData}
          note={note ?? ''}
        />
      )}
      {isComprehensionPhase(phase) && (
        <ComprehensionPhase
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
        <CycleCompletePhase session={session} phase={phase} />
      )}
    </ToastProvider>
  );
}
