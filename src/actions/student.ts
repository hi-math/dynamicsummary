'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { nextPhase, cycleKeyFromPhase } from '@/lib/phases';
import { initDASession, processTurn, createInitialState } from '@/lib/da-pipeline';
import type { TurnResult } from '@/lib/da-pipeline';
import type { UnitTurn } from '@/lib/da-nodes';
import type { APISettings, SessionData, AIMessage, Phase, DASessionState, ComprehensionQuestion } from '@/types';

// ─── Session data ─────────────────────────────────────────────────────────────

export async function getSessionData(studentId: string, phase: string): Promise<SessionData | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('session_data')
    .select('*')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  return data as SessionData | null;
}

// Student notes are shared across every phase of a cycle. They are persisted on the
// cycle's draft-phase session_data row (canonical), so draft / comprehension / DA all
// read and write the same note. Returns an error so the UI can surface save failures.
export async function saveStudentNote(studentId: string, cycleKey: string, content: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from('session_data').upsert(
    { student_id: studentId, phase: `${cycleKey}_draft`, notes: content, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function saveSummary(studentId: string, phase: string, summary: string) {
  const supabase = createServerClient();
  await supabase.from('session_data').upsert(
    { student_id: studentId, phase, summary, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,phase' },
  );
}

// ─── Draft submit ─────────────────────────────────────────────────────────────

/**
 * 제출은 **학생의 현재 단계에만** 허용한다.
 *
 * 관리자가 단계를 바꾼 뒤에도 학생 화면이 옛 단계를 붙잡고 있을 수 있다. 그대로 두면
 * 새 사이클의 글이 이전 사이클 행에 덮어써지거나(원본 손실), 반대로 이전 사이클의 글이
 * 새 사이클 행에 들어가 다음 평가가 엉뚱한 글로 실행된다. 어긋나면 저장하지 않고
 * 새로고침을 요구한다.
 */
export async function submitDraft(studentId: string, phase: string, summary: string) {
  const supabase = createServerClient();
  const { data: user } = await supabase
    .from('users').select('current_phase').eq('id', studentId).single();
  if (user && user.current_phase !== phase) {
    return { error: '단계가 변경되었습니다. 화면을 새로고침한 뒤 다시 제출해주세요.' };
  }
  const { error } = await supabase.from('session_data').upsert(
    {
      student_id: studentId,
      phase,
      summary,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,phase' },
  );
  if (error) return { error: error.message };
  revalidatePath('/student');
  return { success: true };
}

// ─── Passage ──────────────────────────────────────────────────────────────────

export async function getPassage(cycleKey: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('passages').select('*').eq('cycle_key', cycleKey).single();
  return data;
}

export async function getCurrentUser(studentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('users').select('*').eq('id', studentId).single();
  return data;
}

export async function studentAdvancePhase(studentId: string) {
  const supabase = createServerClient();
  const { data: user } = await supabase.from('users').select('current_phase').eq('id', studentId).single();
  if (!user) return { error: '사용자를 찾을 수 없습니다.' };

  const current = user.current_phase as Phase;
  const next = nextPhase(current);
  if (next === current) return { success: true };

  const { error } = await supabase.from('users').update({ current_phase: next }).eq('id', studentId);
  if (error) return { error: error.message };

  revalidatePath('/student');
  return { success: true };
}

// ─── Comprehension ────────────────────────────────────────────────────────────

export async function getComprehensionQuestions(cycleKey: string): Promise<ComprehensionQuestion[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('comprehension_questions')
    .select('questions')
    .eq('cycle_key', cycleKey)
    .single();
  return (data?.questions ?? []) as ComprehensionQuestion[];
}

export async function submitComprehensionAnswers(
  studentId: string,
  phase: string,
  answers: Record<string, string>,
  elapsedSeconds: number,
) {
  const supabase = createServerClient();
  const { error } = await supabase.from('comprehension_answers').upsert({
    student_id: studentId,
    phase,
    answers,
    elapsed_seconds: elapsedSeconds,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'student_id,phase' });
  if (error) return { error: error.message };
  return { success: true };
}

// ─── DA session state ─────────────────────────────────────────────────────────

async function loadPromptAssets(
  supabase: ReturnType<typeof createServerClient>,
  phase: string,
): Promise<Record<string, string>> {
  const { data } = await supabase.from('prompt_assets').select('key, content');
  const map = Object.fromEntries((data ?? []).map((r: { key: string; content: string }) => [r.key, r.content]));
  // 과제별(cycle) 지식자료(모범 요약문·IU 표·중요도)를 현재 phase에 맞춰 knowledge_active 로 노출한다.
  // 과제평가(Assessor)와 중재 발화 턴이 함께 쓴다 (오프닝·복구 턴에는 전달하지 않는다).
  map['knowledge_active'] = map[`knowledge_${cycleKeyFromPhase(phase)}`] ?? '';
  return map;
}

// 한 탭(항목) 안의 대화 기록. DA 파이프라인의 채팅 노드들이 현황 파악에 쓴다.
async function loadTabHistory(
  supabase: ReturnType<typeof createServerClient>,
  studentId: string,
  phase: string,
  itemIdx: number,
): Promise<{ role: string; content: string }[]> {
  const { data } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .eq('item_idx', itemIdx)
    .order('created_at', { ascending: true });
  return (data ?? []) as { role: string; content: string }[];
}

// DA 상태는 구조가 커서 state JSONB 한 칸에 통째로 저장한다.
// assessor_output 은 관리자 조회·CSV 용으로 별도 컬럼에도 함께 둔다.
export async function getDASessionState(studentId: string, phase: string): Promise<DASessionState | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('da_session_state')
    .select('state')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .single();
  return (data?.state as DASessionState | undefined) ?? null;
}

async function saveDASessionState(
  supabase: ReturnType<typeof createServerClient>,
  studentId: string,
  phase: string,
  state: DASessionState,
) {
  await supabase.from('da_session_state').upsert({
    student_id: studentId,
    phase,
    state,
    priority_queue: state.priority_queue,
    current_item_idx: state.current_item_idx,
    session_complete: state.session_complete,
    assessor_output: state.assessor_output,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,phase' });
}

/**
 * 동적평가(스테이지 3) 진입 시각을 한 번만 찍고 상태를 돌려준다.
 *
 * Assessor 는 이해도검사 단계에서 미리 돌 수 있으므로 session_started_at 은
 * 학생이 화면에 들어온 시각이 아니다. 27분 제한의 기준점은 이 값이다.
 */
export async function getDASessionStateOnEntry(
  studentId: string,
  phase: string,
): Promise<DASessionState | null> {
  const state = await getDASessionState(studentId, phase);
  if (!state || state.stage_started_at) return state;
  const stamped: DASessionState = { ...state, stage_started_at: new Date().toISOString() };
  await saveDASessionState(createServerClient(), studentId, phase, stamped);
  return stamped;
}

// Starts the DA session: runs Assessor → Priority selection → Opening message
export async function startDASession(
  studentId: string,
  phase: string,
  summary: string,
  passageContent: string,
): Promise<{ state: DASessionState; openingUtterance?: string; error?: string }> {
  const supabase = createServerClient();

  // Idempotency guard: if a session was already generated (pre-generated during the
  // comprehension phase, or by a prior visit), reuse it instead of re-running the
  // Assessor pipeline. This prevents a reconnect from overwriting the existing
  // evaluation (and its saved chat history) with a freshly-diagnosed one.
  const existing = await getDASessionState(studentId, phase);
  if (existing) return { state: existing };

  // 평가 대상 글은 **서버가 DB 에서 직접 읽는다.** 클라이언트 상태는 관리자가 단계를 바꾼 뒤
  // 이전 사이클의 요약문을 들고 있을 수 있고, 그대로 넘어오면 다음 사이클의 평가가
  // 이전 사이클 제출물로 실행된다. DB 의 해당 사이클 draft 행이 정본이다.
  const { data: draftRow } = await supabase
    .from('session_data').select('summary')
    .eq('student_id', studentId).eq('phase', `${cycleKeyFromPhase(phase)}_draft`).maybeSingle();
  const assessedSummary = (draftRow?.summary as string | null)?.trim() || summary;
  if (!assessedSummary?.trim()) {
    return { state: createInitialState(), error: '평가할 요약문이 없습니다.' };
  }

  const [apiRes, prompts] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    loadPromptAssets(supabase, phase),
  ]);
  if (!apiRes.data) return { state: createInitialState(), error: 'API 설정이 없습니다.' };

  try {
    // initDASession returns the opening utterance too, so no separate
    // generateOpeningMessage call is needed here.
    const { state, openingUtterance } = await initDASession(
      assessedSummary, passageContent, prompts, apiRes.data
    );
    await saveDASessionState(supabase, studentId, phase, state);

    await supabase.from('ai_messages').insert([
      { student_id: studentId, phase, role: 'assistant', content: openingUtterance, item_idx: state.current_item_idx },
    ]);

    return { state, openingUtterance };
  } catch (e) {
    return { state: createInitialState(), error: e instanceof Error ? e.message : 'DA 초기화 실패' };
  }
}

// Pre-generates DA session state during comprehension phase so tabs are instant on DA entry.
// Idempotent: skips if state already exists.
export async function preGenerateDASession(
  studentId: string,
  daPhase: string,
  summary: string,
  passageContent: string,
): Promise<{ success: boolean; error?: string }> {
  if (!summary.trim() || !passageContent.trim()) return { success: false, error: '지문 또는 요약문 없음' };
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('da_session_state')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('phase', daPhase)
    .single();
  if (existing) return { success: true }; // already generated
  const result = await startDASession(studentId, daPhase, summary, passageContent);
  return result.error ? { success: false, error: result.error } : { success: true };
}

// Processes one student turn through Classifier → route → Mediator
// itemIdx: which tab the student is currently on (overrides DB current_item_idx for free navigation)
// itemState: per-item cumulative state managed client-side
// 학생 메시지 1턴 처리. 활성 유닛·단계·목표는 서버 상태가 권위를 가지므로
// 클라이언트가 탭/누적 상태를 덮어쓰지 않는다 (0719 설계: 코드가 라우팅을 소유).
export async function sendDAMessage(
  studentId: string,
  phase: string,
  studentMessage: string,
  passageContent: string,
): Promise<TurnResult & { error?: string }> {
  const supabase = createServerClient();

  const [apiRes, prompts, currentState, summaryRes] = await Promise.all([
    supabase.from('api_settings').select('*').eq('id', 1).single<APISettings>(),
    loadPromptAssets(supabase, phase),
    getDASessionState(studentId, phase),
    // Analysis 가 학생 요약문 전체를 참고자료로 받는다 (근거 인용의 문맥 확인용).
    // 진단 대상은 **드래프트 행이 정본**이다 — DA 화면의 요약문 패널은 편집 가능해서
    // 세션 중 phase 행이 바뀌는데, 그러면 Assessor 가 인용한 근거 문장이 사라져
    // 모델이 "그 부분은 이미 정리되었다"는 식으로 어긋난 판단을 하게 된다.
    supabase.from('session_data').select('phase, summary')
      .eq('student_id', studentId)
      .in('phase', [`${cycleKeyFromPhase(phase)}_draft`, phase]),
  ]);

  const fail = (error: string, state?: DASessionState): TurnResult & { error: string } => ({
    utterance: '', updated_state: state ?? createInitialState(), classification: 'on_track',
    tab_unlocked: false, session_complete: false, error,
    log: {
      tab: 0, item: '', item_idx: 0,
      learner_message: studentMessage, previous_tutor_utterance: '',
      classification: null, turn_pi: null, turn_psv: null, analysis_rationale: null,
      target_before: 'problem_identification', step_before: 0, pi_before: 'absent', psv_before: 'absent',
      target_after: 'problem_identification', step_after: 0, pi_after: 'absent', psv_after: 'absent',
      off_track_streak: 0, node: 'mediation', utterance: '',
      used_target: null, used_step: null, reconcile_mismatch: error,
      confirm_decision: null, confirm_rationale: null,
      unit_closed: false, next_item: null, session_complete: false, time_limit_closed: false,
      llm_calls: 0, latency_ms: 0,
    },
  });
  if (!apiRes.data) return fail('API 설정이 없습니다.');
  if (!currentState) return fail('DA 세션이 초기화되지 않았습니다.');

  // 진입 스탬프가 없는 세션(구 기록·직접 진입)은 첫 발화 시각을 기준점으로 삼는다.
  const state: DASessionState = currentState.stage_started_at
    ? currentState
    : { ...currentState, stage_started_at: new Date().toISOString() };

  // 진단 대상 요약문 — 드래프트 행이 없을 때만 현재 phase 행으로 물러난다.
  const summaryRows = (summaryRes.data ?? []) as { phase: string; summary: string | null }[];
  const summaryOf = (p: string) => summaryRows.find((r) => r.phase === p)?.summary?.trim() ?? '';
  const assessedSummary =
    summaryOf(`${cycleKeyFromPhase(phase)}_draft`) || summaryOf(phase);

  // 현재 활성 유닛이 속한 탭의 대화만 넘긴다 (다른 탭의 대화는 섞이지 않는다).
  const itemIdx = currentState.current_item_idx;
  const rows = await loadTabHistory(supabase, studentId, phase, itemIdx);
  // prompt_mediator_common 의 History input contract 형식으로 변환.
  const history: UnitTurn[] = rows.map((m) => ({
    speaker: m.role === 'user' ? 'learner' : 'mediator',
    text: m.content,
  }));
  const latestTutorUtterance = [...history].reverse().find((t) => t.speaker === 'mediator')?.text ?? '';

  try {
    const result = await processTurn(
      state,
      studentMessage,
      latestTutorUtterance,
      history,
      {
        sourceText: passageContent,
        studentSummary: assessedSummary,
        cycleKnowledge: prompts['knowledge_active'] ?? '',
      },
      prompts,
      apiRes.data,
    );

    await saveDASessionState(supabase, studentId, phase, result.updated_state);

    // 발화는 **그 발화가 실제로 일어난 탭**에 기록한다.
    //   utterance       이 턴이 시작된 탭. 탭이 넘어간 턴이라도 마지막 발화(⑥ Provision 등)는
    //                   방금 닫힌 앞 탭의 것이다. 이것을 새 탭에 붙이면 다음 턴의
    //                   previous_tutor_utterance 가 앞 탭 발화가 되어, 학생의 새 탭 답변을
    //                   앞 탭 맥락으로 판정하게 된다.
    //   next_opening    새로 열린 탭의 첫 발화. 저장하지 않으면 새로고침 시 화면에서 사라지고,
    //                   서버도 그 탭의 직전 발화를 잃는다.
    //   closing_message 세션 종료 발화 — 마지막 탭에 남는다.
    // created_at 은 밀리초 간격으로 직접 찍는다. NOW() 는 트랜잭션 시각이라 한 번의 insert
    // 안에서 모두 같아지고, 같은 탭의 행들이 기록 순서를 잃는다.
    const outIdx = result.updated_state.current_item_idx;
    const t0 = Date.now();
    const at = (offset: number) => new Date(t0 + offset).toISOString();
    const base = { student_id: studentId, phase };
    const msgRows = [
      { ...base, role: 'user', content: studentMessage, item_idx: itemIdx, created_at: at(0) },
      ...(result.utterance
        ? [{ ...base, role: 'assistant', content: result.utterance, item_idx: itemIdx, created_at: at(1) }]
        : []),
      ...(result.next_opening
        ? [{ ...base, role: 'assistant', content: result.next_opening, item_idx: outIdx, created_at: at(2) }]
        : []),
      ...(result.closing_message
        ? [{ ...base, role: 'assistant', content: result.closing_message, item_idx: outIdx, created_at: at(3) }]
        : []),
    ];
    await supabase.from('ai_messages').insert(msgRows);

    // 턴 로그 — 연구 데이터의 원장. 채팅 저장을 막지 않도록 실패해도 넘어간다.
    const { count } = await supabase
      .from('da_turn_logs')
      .select('turn_index', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('phase', phase);
    const { error: logErr } = await supabase.from('da_turn_logs').insert({
      student_id: studentId, phase, turn_index: (count ?? 0) + 1, ...result.log,
    });
    if (logErr) console.warn('[DA] 턴 로그 저장 실패:', logErr.message);

    return result;
  } catch (e) {
    return fail(e instanceof Error ? e.message : '처리 실패', currentState);
  }
}

// ─── AI Chat 기록 ─────────────────────────────────────────────────────────────

export async function getAIMessages(studentId: string, phase: string): Promise<AIMessage[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('student_id', studentId)
    .eq('phase', phase)
    .order('created_at', { ascending: true });
  return (data ?? []) as AIMessage[];
}
