'use client';

import { logout } from '@/actions/auth';
import type { SessionCookie } from '@/types';

const roleLabel: Record<string, string> = {
  admin: '관리자',
  mentor: '멘토',
  student: '학생',
};

export default function Navbar({ session }: { session: SessionCookie }) {
  return (
    <nav className="bg-white border-b border-slate-200 px-4 h-12 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-slate-800">Dynamic Summary</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">
          {session.name}
          {session.role === 'student' && session.team && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
              {session.team === 'chatbot' ? '챗봇팀' : '멘토팀'}
            </span>
          )}
          <span className="text-slate-400 ml-1">({roleLabel[session.role]})</span>
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-300 hover:border-slate-400 px-2.5 py-1 rounded transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </nav>
  );
}
