'use client';

import { PHASE_LABEL } from '@/lib/phases';
import type { User, SessionData, AIMessage, HumanMessage, DASessionState } from '@/types';

export type StudentRecord = {
  student: User;
  sessions: SessionData[];
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
  daStates?: (DASessionState & { phase: string })[];
};

function esc(v: string | null | undefined): string {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

function exportCSV(record: StudentRecord) {
  const { student, sessions, aiMessages, humanMessages, daStates = [] } = record;
  const rows: string[][] = [];

  rows.push(['[학생 정보]']);
  rows.push(['아이디', '이름', '팀', '현재단계']);
  rows.push([student.id, student.name, student.team ?? '', student.current_phase]);
  rows.push([]);

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

  // Assessor 가 세운 지도 계획 — 어떤 항목을 왜 골랐고, 탭별 학습 단위와 그 근거가 무엇인지.
  const plans = daStates.filter((d) => d.assessor_output?.mediation_targets?.length);
  if (plans.length > 0) {
    rows.push(['[진단 및 지도 계획]']);
    rows.push(['단계', 'Tab', '항목', '선택 근거', '단위구분', 'descriptor', '심각도',
      'feedback focus', '근거 위치', '근거 문장', '참조 내용', '근거 설명',
      '문제인식(PI) 목표', '문제해결설명(PSV) 목표']);
    for (const d of plans) {
      const phaseLabel = PHASE_LABEL[d.phase as keyof typeof PHASE_LABEL] ?? d.phase;
      const items = d.assessor_output?.items ?? {};
      const targets = [...(d.assessor_output?.mediation_targets ?? [])].sort((a, b) => a.tab - b.tab);
      for (const t of targets) {
        // 근거는 unit 안에 없다 — 같은 항목의 detected_descriptors 에서 descriptor_key 로 찾는다.
        const unitRow = (u: typeof t.primary_mediation_unit, label: string, rationale: string) => {
          const dd = items[t.item]?.detected_descriptors?.find((x) => x.key === u.descriptor_key);
          const ev = dd?.evidence;
          rows.push([phaseLabel, String(t.tab), t.item, rationale, label,
            u.descriptor_key, dd?.severity ?? '', u.feedback_focus,
            ev?.problem_location ?? '', ev?.student_text ?? '', ev?.reference_content ?? '', ev?.explanation ?? '',
            u.mediation_goal?.problem_identification ?? '',
            u.mediation_goal?.problem_solution_verbalization ?? '']);
        };
        unitRow(t.primary_mediation_unit, '주 단위', t.priority_rationale ?? '');
        if (t.secondary_mediation_unit) unitRow(t.secondary_mediation_unit, '보조 단위', '');
      }
    }
    rows.push([]);
  }

  if (student.team === 'chatbot' && aiMessages.length > 0) {
    rows.push(['[AI 채팅 기록]']);
    rows.push(['단계', '역할', '내용', '시간']);
    for (const m of aiMessages) {
      rows.push([m.phase, m.role === 'user' ? '학생' : 'AI', m.content, new Date(m.created_at).toLocaleString('ko-KR')]);
    }
  } else if (student.team === 'human' && humanMessages.length > 0) {
    rows.push(['[멘토 채팅 기록]']);
    rows.push(['발신자', '내용', '시간']);
    for (const m of humanMessages) {
      rows.push([m.sender_id, m.content, new Date(m.created_at).toLocaleString('ko-KR')]);
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

export default function StudentDataCard({
  record,
  mode,
  busy = false,
  onToggleTrash,
}: {
  record: StudentRecord;
  mode: 'active' | 'trash';
  busy?: boolean;
  onToggleTrash: (studentId: string, trashed: boolean) => void;
}) {
  const { student, sessions, aiMessages, humanMessages } = record;
  const submittedSessions = sessions.filter((s) => s.submitted_at);

  return (
    <div className={`bg-white border rounded-xl p-5 ${mode === 'trash' ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-slate-800">{student.name}</h3>
            <span className="text-xs text-slate-400 font-mono">({student.id})</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              student.team === 'chatbot' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
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
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => exportCSV(record)}
            className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium">
            CSV 내보내기
          </button>
          {mode === 'active' ? (
            <button onClick={() => onToggleTrash(student.id, true)} disabled={busy}
              className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors font-medium disabled:opacity-50">
              삭제
            </button>
          ) : (
            <button onClick={() => onToggleTrash(student.id, false)} disabled={busy}
              className="text-xs px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors font-medium disabled:opacity-50">
              복원
            </button>
          )}
        </div>
      </div>

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
              {s.summary && <p className="text-slate-500 line-clamp-2 leading-relaxed">{s.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
