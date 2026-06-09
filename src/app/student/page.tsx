import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import {
  getSessionData, getAIMessages, getPassage, getCurrentUser,
  getComprehensionQuestions, getDASessionState,
} from '@/actions/student';
import { getHumanMessages } from '@/actions/mentor';
import { cycleKeyFromPhase, isComprehensionPhase } from '@/lib/phases';
import Navbar from '@/components/Navbar';
import StudentRouter from './StudentRouter';

export default async function StudentPage() {
  const session = await getSession();
  if (!session || session.role !== 'student') redirect('/');

  const user = await getCurrentUser(session.id);
  if (!user) redirect('/');

  const phase = user.current_phase as string;
  const cycleKey = cycleKeyFromPhase(phase);

  const draftPhase = phase.endsWith('_da')
    ? phase.replace('_da', '_draft')
    : phase.endsWith('_comprehension')
    ? phase.replace('_comprehension', '_draft')
    : null;

  const [sessionData, passage, aiMessages, humanMessages, draftSessionData] = await Promise.all([
    getSessionData(session.id, phase),
    getPassage(cycleKey),
    getAIMessages(session.id, phase),
    getHumanMessages(session.id),
    draftPhase ? getSessionData(session.id, draftPhase) : Promise.resolve(null),
  ]);

  // Comprehension questions (only needed on comprehension phase)
  const comprehensionQuestions = isComprehensionPhase(phase)
    ? await getComprehensionQuestions(cycleKey)
    : [];

  // Comprehension already submitted?
  const comprehensionSubmitted = isComprehensionPhase(phase)
    ? !!(await import('@/lib/supabase-server').then(async ({ createServerClient }) => {
        const sb = createServerClient();
        const { data } = await sb.from('comprehension_answers')
          .select('submitted_at').eq('student_id', session.id).eq('phase', phase).single();
        return data?.submitted_at;
      }))
    : false;

  // DA session state (only needed on da phase)
  const daSessionState = phase.endsWith('_da')
    ? await getDASessionState(session.id, phase)
    : null;

  const liveSession = { ...session, team: user.team };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Navbar session={liveSession} currentPhase={phase} />
      <div className="flex-1 overflow-hidden pb-[2%]">
        <StudentRouter
          session={liveSession}
          phase={phase}
          passage={passage ?? { cycle_key: cycleKey, title: '', content: '' }}
          sessionData={sessionData}
          aiMessages={aiMessages}
          humanMessages={humanMessages}
          comprehensionQuestions={comprehensionQuestions}
          comprehensionSubmitted={comprehensionSubmitted}
          daSessionState={daSessionState}
          draftSummary={draftSessionData?.summary ?? undefined}
        />
      </div>
    </div>
  );
}
