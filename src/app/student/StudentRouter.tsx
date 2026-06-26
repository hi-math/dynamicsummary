'use client';

import { isDraftPhase, isComprehensionPhase, isDAPhase } from '@/lib/phases';
import DraftPhase from './DraftPhase';
import ComprehensionPhase from './ComprehensionPhase';
import DASession from './DASession';
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
          mentorId={mentorId}
          mentorName={mentorName}
        />
      )}
    </ToastProvider>
  );
}
