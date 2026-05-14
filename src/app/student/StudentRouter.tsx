'use client';

import { isBlankPhase, isDraftPhase, isDAPhase } from '@/lib/phases';
import BlankPhase from './BlankPhase';
import DraftPhase from './DraftPhase';
import DASession from './DASession';
import { ToastProvider } from '@/components/ui/Toast';
import type { SessionCookie, SessionData, AIMessage, HumanMessage } from '@/types';

type Passage = { cycle_key: string; title: string; content: string };

export default function StudentRouter({
  session,
  phase,
  passage,
  sessionData,
  aiMessages,
  humanMessages,
}: {
  session: SessionCookie;
  phase: string;
  passage: Passage;
  sessionData: SessionData | null;
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
}) {
  return (
    <ToastProvider>
      {isBlankPhase(phase) && <BlankPhase phase={phase} studentId={session.id} />}
      {isDraftPhase(phase) && (
        <DraftPhase
          session={session}
          phase={phase}
          passage={passage}
          sessionData={sessionData}
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
        />
      )}
    </ToastProvider>
  );
}
