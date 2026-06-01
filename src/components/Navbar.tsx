'use client';

import { logout } from '@/actions/auth';
import { PHASE_GROUPS, stageShortLabel } from '@/lib/phases';
import type { SessionCookie } from '@/types';
import type { Phase } from '@/lib/phases';

const roleLabel: Record<string, string> = {
  admin: '관리자',
  mentor: '멘토',
  student: '학생',
};

export default function Navbar({
  session,
  currentPhase,
}: {
  session: SessionCookie;
  currentPhase?: string;
}) {
  const activeGroupIdx = currentPhase
    ? PHASE_GROUPS.findIndex((g) => g.phases.includes(currentPhase as Phase))
    : -1;

  return (
    <nav className="relative bg-white border-b border-slate-200 px-4 h-12 flex items-center justify-between shrink-0">
      {/* Left: logo */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-slate-800">Dynamic Summary</span>
      </div>

      {/* Center: stepper (students only) */}
      {currentPhase && session.role === 'student' && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {PHASE_GROUPS.map((group, idx) => {
            const isActive = idx === activeGroupIdx;
            const isDone = activeGroupIdx > idx;

            return (
              <div key={group.key} className="flex items-center gap-1.5">
                {idx > 0 && (
                  <div className={`w-5 h-px ${isDone || isActive ? 'bg-indigo-200' : 'bg-slate-200'}`} />
                )}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'text-slate-400 border border-slate-200'
                }`}>
                  {isDone && (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span>{group.label}</span>
                  {isActive && (
                    <>
                      <span className="opacity-50 font-normal">·</span>
                      <span className="font-bold">{stageShortLabel(currentPhase)}</span>
                      <span className="flex gap-0.5 ml-0.5">
                        {group.phases.map((p) => (
                          <span
                            key={p}
                            className={`rounded-full transition-all ${
                              p === currentPhase
                                ? 'w-2 h-2 bg-white'
                                : 'w-1.5 h-1.5 bg-white/35'
                            }`}
                          />
                        ))}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Right: user info + logout */}
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
