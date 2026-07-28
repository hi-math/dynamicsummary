import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AdminClient from './AdminClient';
import {
  getUsers,
  getAPISettings,
  getPassages,
  getAllStudentsData,
  getMentors,
  getPromptAssets,
  getComprehensionQuestionsAdmin,
} from '@/actions/admin';

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/');

  const [users, api, passages, studentsData, mentors, promptAssets, comprehensionQs] = await Promise.all([
    getUsers(),
    getAPISettings(),
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
      initialPassages={passages}
      initialStudentsData={studentsData}
      initialMentors={mentors}
      initialPromptAssets={promptAssets}
      initialComprehensionQs={comprehensionQs}
    />
  );
}
