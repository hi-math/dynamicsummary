import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getSessionData, getAIMessages, getPassage, getCurrentUser } from '@/actions/student';
import { getHumanMessages } from '@/actions/mentor';
import { cycleKeyFromPhase } from '@/lib/phases';
import Navbar from '@/components/Navbar';
import PhaseBar from '@/components/PhaseBar';
import StudentRouter from './StudentRouter';

export default async function StudentPage() {
  const session = await getSession();
  if (!session || session.role !== 'student') redirect('/');

  const user = await getCurrentUser(session.id);
  if (!user) redirect('/');

  const phase = user.current_phase as string;
  const cycleKey = cycleKeyFromPhase(phase);

  const [sessionData, passage, aiMessages, humanMessages] = await Promise.all([
    getSessionData(session.id, phase),
    getPassage(cycleKey),
    getAIMessages(session.id, phase),
    getHumanMessages(session.id),
  ]);

  // Keep session cookie team info in sync with DB
  const liveSession = { ...session, team: user.team };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Navbar session={liveSession} />
      <PhaseBar currentPhase={phase} />
      <div className="flex-1 overflow-hidden pb-[2%]">
        <StudentRouter
          session={liveSession}
          phase={phase}
          passage={passage ?? { cycle_key: cycleKey, title: '', content: '' }}
          sessionData={sessionData}
          aiMessages={aiMessages}
          humanMessages={humanMessages}
        />
      </div>
    </div>
  );
}
