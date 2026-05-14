'use client';

import { PHASE_GROUPS } from '@/lib/phases';

export default function PhaseBar({ currentPhase }: { currentPhase: string }) {
  const currentGroup = PHASE_GROUPS.find((g) => g.phases.includes(currentPhase as never))?.key;

  return (
    <div className="bg-white border-b border-slate-200 px-4 h-10 flex items-center gap-1 shrink-0 overflow-x-auto">
      {PHASE_GROUPS.map((group, idx) => {
        const isActive = group.key === currentGroup;
        const groupPhases = group.phases as string[];
        const isDone = PHASE_GROUPS.findIndex((g) => g.key === currentGroup) > idx;

        return (
          <div key={group.key} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : isDone
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              {isDone && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {group.label}

              {/* Sub-phase dots for active group */}
              {isActive && group.phases.length > 1 && (
                <span className="flex gap-0.5 ml-1">
                  {groupPhases.map((p) => (
                    <span
                      key={p}
                      className={`w-1.5 h-1.5 rounded-full ${
                        p === currentPhase ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
