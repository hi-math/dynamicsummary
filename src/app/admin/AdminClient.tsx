'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import UsersTab from './tabs/UsersTab';
import APITab from './tabs/APITab';
import PromptsTab from './tabs/PromptsTab';
import PassagesTab from './tabs/PassagesTab';
import DataTab from './tabs/DataTab';
import { ToastProvider } from '@/components/ui/Toast';
import type { APISettings, Prompts, User, SessionCookie } from '@/types';
import type { Passage } from '@/types';

type Tab = 'users' | 'api' | 'prompts' | 'passages' | 'data';

const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: '계정 관리' },
  { key: 'api', label: 'API 설정' },
  { key: 'prompts', label: '프롬프트' },
  { key: 'passages', label: '과제 관리' },
  { key: 'data', label: '데이터 조회' },
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
  const [tab, setTab] = useState<Tab>('users');

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-slate-50">
        <Navbar session={session} />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-44 bg-white border-r border-slate-200 flex flex-col py-4 gap-1 px-2 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </aside>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-6">
            {tab === 'users' && <UsersTab initialUsers={initialUsers} initialMentors={initialMentors} />}
            {tab === 'api' && <APITab initialAPI={initialAPI} />}
            {tab === 'prompts' && <PromptsTab initialPrompts={initialPrompts} initialAssets={initialPromptAssets} />}
            {tab === 'passages' && <PassagesTab initialPassages={initialPassages} initialComprehensionQs={initialComprehensionQs as never} initialPromptAssets={initialPromptAssets} />}
            {tab === 'data' && <DataTab initialStudentsData={initialStudentsData as never} />}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
