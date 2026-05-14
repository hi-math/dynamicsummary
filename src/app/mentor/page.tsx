import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getMentorStudents } from '@/actions/mentor';
import Navbar from '@/components/Navbar';
import MentorClient from './MentorClient';
import { ToastProvider } from '@/components/ui/Toast';

export default async function MentorPage() {
  const session = await getSession();
  if (!session || session.role !== 'mentor') redirect('/');

  const students = await getMentorStudents(session.id);

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-slate-50">
        <Navbar session={session} />
        <MentorClient session={session} initialStudents={students} />
      </div>
    </ToastProvider>
  );
}
