'use client';

import { PHASE_LABEL } from '@/lib/phases';
import type { User, SessionData, AIMessage, HumanMessage } from '@/types';

type StudentRecord = {
  student: User;
  sessions: SessionData[];
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
};

export default function DataTab({ initialStudentsData }: { initialStudentsData: StudentRecord[] }) {
  function esc(v: string | null | undefined): string {
    const s = String(v ?? '');
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCSV(record: StudentRecord) {
    const { student, sessions, aiMessages, humanMessages } = record;
    const rows: string[][] = [];

    // ── 학생 정보 ──
    rows.push(['[학생 정보]']);
    rows.push(['아이디', '이름', '팀', '현재단계']);
    rows.push([student.id, student.name, student.team ?? '', student.current_phase]);
    rows.push([]);

    // ── 세션별 요약문 ──
    rows.push(['[단계별 요약문]']);
    rows.push(['단계', '요약문', '노트', '제출시간']);
    for (const s of sessions) {
      rows.push([
        PHASE_LABEL[s.phase as keyof typeof PHASE_LABEL] ?? s.phase,
        s.summary ?? '',
        s.notes ?? '',
        s.submitted_at ? new Date(s.submitted_at).toLocaleString('ko-KR') : '',
      ]);
    }
    rows.push([]);

    // ── 메시지 기록 ──
    if (student.team === 'chatbot' && aiMessages.length > 0) {
      rows.push(['[AI 채팅 기록]']);
      rows.push(['단계', '역할', '내용', '시간']);
      for (const m of aiMessages) {
        rows.push([
          m.phase,
          m.role === 'user' ? '학생' : 'AI',
          m.content,
          new Date(m.created_at).toLocaleString('ko-KR'),
        ]);
      }
    } else if (student.team === 'human' && humanMessages.length > 0) {
      rows.push(['[멘토 채팅 기록]']);
      rows.push(['발신자', '내용', '시간']);
      for (const m of humanMessages) {
        rows.push([
          m.sender_id,
          m.content,
          new Date(m.created_at).toLocaleString('ko-KR'),
        ]);
      }
    }

    const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${student.id}_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (initialStudentsData.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">데이터 조회</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          등록된 학생이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">데이터 조회</h2>
      <div className="space-y-4">
        {initialStudentsData.map((record) => {
          const { student, sessions, aiMessages, humanMessages } = record;
          const submittedSessions = sessions.filter((s) => s.submitted_at);

          return (
            <div key={student.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-slate-800">{student.name}</h3>
                    <span className="text-xs text-slate-400 font-mono">({student.id})</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      student.team === 'chatbot'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {student.team === 'chatbot' ? '챗봇팀' : student.team === 'human' ? '휴먼팀' : '팀 없음'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    현재: {PHASE_LABEL[student.current_phase as keyof typeof PHASE_LABEL] ?? student.current_phase}
                    {' · '}제출 {submittedSessions.length}건
                    {student.team === 'chatbot' && ` · AI 메시지 ${aiMessages.length}개`}
                    {student.team === 'human' && ` · 채팅 ${humanMessages.length}개`}
                  </p>
                </div>
                <button onClick={() => exportCSV(record)}
                  className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium">
                  CSV 내보내기
                </button>
              </div>

              {/* Session data preview */}
              {submittedSessions.length > 0 && (
                <div className="space-y-2">
                  {submittedSessions.map((s) => (
                    <div key={s.phase} className="bg-slate-50 rounded-lg p-3 text-xs">
                      <p className="font-medium text-slate-600 mb-1">
                        {PHASE_LABEL[s.phase as keyof typeof PHASE_LABEL] ?? s.phase}
                        <span className="text-slate-400 ml-2">
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('ko-KR') : ''}
                        </span>
                      </p>
                      {s.summary && (
                        <p className="text-slate-500 line-clamp-2 leading-relaxed">{s.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
