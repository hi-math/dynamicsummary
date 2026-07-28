'use client';

import { PHASE_LABEL } from '@/lib/phases';
import { orderedAssessment } from '@/lib/da-state';
import type { User, SessionData, AIMessage, HumanMessage, DASessionState, TurnLog } from '@/types';

export type StudentRecord = {
  student: User;
  sessions: SessionData[];
  aiMessages: AIMessage[];
  humanMessages: HumanMessage[];
  daStates?: (DASessionState & { phase: string })[];
  turnLogs?: (TurnLog & { created_at?: string })[];
};

// [턴 로그] 열 정의 — 헤더(한국어)와 값 추출을 한 곳에 둔다.
const TURN_LOG_COLUMNS: [string, (t: TurnLog & { created_at?: string }) => unknown][] = [
  ['단계',            (t) => PHASE_LABEL[t.phase as keyof typeof PHASE_LABEL] ?? t.phase],
  ['턴',              (t) => t.turn_index],
  ['시간',            (t) => (t.created_at ? new Date(t.created_at).toLocaleString('ko-KR') : '')],
  ['탭',              (t) => t.tab],
  ['항목',            (t) => t.item],
  ['학생 발화',       (t) => t.learner_message],
  ['직전 튜터 발화',  (t) => t.previous_tutor_utterance],
  ['분류',            (t) => t.classification],
  ['턴 PI 판정',      (t) => t.turn_pi],
  ['턴 PSV 판정',     (t) => t.turn_psv],
  ['판정 근거',       (t) => t.analysis_rationale],
  ['목표(전)',        (t) => t.target_before],
  ['단계(전)',        (t) => t.step_before],
  ['PI 누적(전)',     (t) => t.pi_before],
  ['PSV 누적(전)',    (t) => t.psv_before],
  ['목표(후)',        (t) => t.target_after],
  ['단계(후)',        (t) => t.step_after],
  ['PI 누적(후)',     (t) => t.pi_after],
  ['PSV 누적(후)',    (t) => t.psv_after],
  ['연속 이탈',       (t) => t.off_track_streak],
  ['발화 노드',       (t) => t.node],
  ['튜터 발화',       (t) => t.utterance],
  ['신고 목표',       (t) => t.used_target],
  ['신고 단계',       (t) => t.used_step],
  ['불일치',          (t) => t.reconcile_mismatch],
  ['전환 판정',       (t) => t.confirm_decision],
  ['전환 판정 근거',  (t) => t.confirm_rationale],
  ['유닛 종료',       (t) => (t.unit_closed ? 'Y' : '')],
  ['다음 항목',       (t) => t.next_item],
  ['세션 종료',       (t) => (t.session_complete ? 'Y' : '')],
  ['LLM 호출수',      (t) => t.llm_calls],
  ['소요(ms)',        (t) => t.latency_ms],
];

function esc(v: string | null | undefined): string {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

function exportCSV(record: StudentRecord) {
  const { student, sessions, aiMessages, humanMessages, daStates = [], turnLogs = [] } = record;
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

  // Assessor 가 세운 지도 계획 — 어떤 항목을 왜 골랐고, 무엇을 어떤 순서로 다루는지.
  // 구 기록(mediation_targets)은 orderedAssessment 가 새 형태로 변환해 함께 내보낸다.
  const plans = daStates
    .map((d) => ({ phase: d.phase, assessment: orderedAssessment(d.assessor_output) }))
    .filter((p) => p.assessment.length > 0);
  if (plans.length > 0) {
    rows.push(['[진단 및 지도 계획]']);
    rows.push(['단계', '항목', '중재 필요성 순위', '제시 순서', '문제 내용', '학생 글 근거',
      '선정 근거', '중재 초점', '문제인식(PI) 목표', '문제해결설명(PSV) 목표']);
    for (const p of plans) {
      const phaseLabel = PHASE_LABEL[p.phase as keyof typeof PHASE_LABEL] ?? p.phase;
      for (const t of p.assessment) {
        rows.push([phaseLabel, t.item, String(t.problem_priority), String(t.presentation_order),
          t.problem_description, t.student_text_evidence.join('\n'), t.selection_rationale,
          t.mediation_focus, t.PI_goal, t.PSV_goal]);
      }
    }
    rows.push([]);
  }

  // 학생 발화 한 턴 = 한 행. 판정·전이·발화가 모두 들어 있다.
  if (turnLogs.length > 0) {
    rows.push(['[턴 로그]']);
    rows.push(TURN_LOG_COLUMNS.map(([h]) => h));
    for (const t of turnLogs) {
      rows.push(TURN_LOG_COLUMNS.map(([, get]) => {
        const v = get(t);
        return v === null || v === undefined ? '' : String(v);
      }));
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
  const { student, sessions, aiMessages, humanMessages, turnLogs = [] } = record;
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
            {turnLogs.length > 0 && ` · 턴 로그 ${turnLogs.length}행`}
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
