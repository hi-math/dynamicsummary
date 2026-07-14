'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import UsersTab from './tabs/UsersTab';
import APITab from './tabs/APITab';
import PromptsTab from './tabs/PromptsTab';
import PassagesTab from './tabs/PassagesTab';
import DataTab from './tabs/DataTab';
import TrashTab from './tabs/TrashTab';
import { type StudentRecord } from './tabs/StudentDataCard';
import { setDataTrashed } from '@/actions/admin';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import type { APISettings, Prompts, User, SessionCookie } from '@/types';
import type { Passage } from '@/types';

type Tab = 'users' | 'api' | 'prompts' | 'passages' | 'data' | 'trash';

const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: '계정 관리' },
  { key: 'api', label: 'API 설정' },
  { key: 'prompts', label: '프롬프트' },
  { key: 'passages', label: '과제 관리' },
  { key: 'data', label: '데이터 조회' },
  { key: 'trash', label: '휴지통' },
];

export default function AdminClient({
  session,
  initialUsers,
  initialAPI,
  initialPrompts,
  initialPassages,
  initialStudentsData,
  initialMentors,
  initialPromptAssets,
  initialComprehensionQs,
}: {
  session: SessionCookie;
  initialUsers: User[];
  initialAPI: APISettings | null;
  initialPrompts: Prompts | null;
  initialPassages: Passage[];
  initialStudentsData: unknown[];
  initialMentors: User[];
  initialPromptAssets: Record<string, string>;
  initialComprehensionQs: unknown[];
}) {
  return (
    <ToastProvider>
      <AdminContent
        session={session}
        initialUsers={initialUsers}
        initialAPI={initialAPI}
        initialPrompts={initialPrompts}
        initialPassages={initialPassages}
        initialStudentsData={initialStudentsData}
        initialMentors={initialMentors}
        initialPromptAssets={initialPromptAssets}
        initialComprehensionQs={initialComprehensionQs}
      />
    </ToastProvider>
  );
}

function AdminContent({
  session,
  initialUsers,
  initialAPI,
  initialPrompts,
  initialPassages,
  initialStudentsData,
  initialMentors,
  initialPromptAssets,
  initialComprehensionQs,
}: {
  session: SessionCookie;
  initialUsers: User[];
  initialAPI: APISettings | null;
  initialPrompts: Prompts | null;
  initialPassages: Passage[];
  initialStudentsData: unknown[];
  initialMentors: User[];
  initialPromptAssets: Record<string, string>;
  initialComprehensionQs: unknown[];
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('users');
  const [studentsData, setStudentsData] = useState<StudentRecord[]>(initialStudentsData as StudentRecord[]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeRecords = studentsData.filter((r) => !r.student.data_trashed);
  const trashedRecords = studentsData.filter((r) => r.student.data_trashed);

  function patchTrashed(studentId: string, trashed: boolean) {
    setStudentsData((prev) =>
      prev.map((r) => (r.student.id === studentId ? { ...r, student: { ...r.student, data_trashed: trashed } } : r)),
    );
  }

  async function handleSetTrashed(studentId: string, trashed: boolean) {
    setBusyId(studentId);
    patchTrashed(studentId, trashed); // optimistic
    const res = await setDataTrashed(studentId, trashed);
    setBusyId(null);
    if (res?.error) {
      patchTrashed(studentId, !trashed); // revert
      showToast(`처리 실패: ${res.error}`, 'error');
      return;
    }
    showToast(trashed ? '휴지통으로 이동했습니다.' : '데이터 조회로 복원했습니다.', 'success');
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Navbar session={session} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-44 bg-white border-r border-slate-200 flex flex-col py-4 gap-1 px-2 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                tab === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.key === 'trash' && trashedRecords.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  {trashedRecords.length}
                </span>
              )}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === 'users' && <UsersTab initialUsers={initialUsers} initialMentors={initialMentors} />}
          {tab === 'api' && <APITab initialAPI={initialAPI} />}
          {tab === 'prompts' && <PromptsTab initialPrompts={initialPrompts} initialAssets={initialPromptAssets} />}
          {tab === 'passages' && <PassagesTab initialPassages={initialPassages} initialComprehensionQs={initialComprehensionQs as never} initialPromptAssets={initialPromptAssets} />}
          {tab === 'data' && <DataTab records={activeRecords} busyId={busyId} onTrash={handleSetTrashed} />}
          {tab === 'trash' && <TrashTab records={trashedRecords} busyId={busyId} onRestore={handleSetTrashed} />}
        </main>
      </div>
    </div>
  );
}
