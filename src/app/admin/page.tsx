import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AdminClient from './AdminClient';
import {
  getUsers,
  getAPISettings,
  getPrompts,
  getPassages,
  getAllStudentsData,
  getMentors,
  getPromptAssets,
  getComprehensionQuestionsAdmin,
} from '@/actions/admin';

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/');

  const [users, api, prompts, passages, studentsData, mentors, promptAssets, comprehensionQs] = await Promise.all([
    getUsers(),
    getAPISettings(),
    getPrompts(),
    getPassages(),
    getAllStudentsData(),
    getMentors(),
    getPromptAssets(),
    getComprehensionQuestionsAdmin(),
  ]);

  return (
    <AdminClient
      session={session}
      initialUsers={users}
      initialAPI={api}
      initialPrompts={prompts}
      initialPassages={passages}
      initialStudentsData={studentsData}
      initialMentors={mentors}
      initialPromptAssets={promptAssets}
      initialComprehensionQs={comprehensionQs}
    />
  );
}
