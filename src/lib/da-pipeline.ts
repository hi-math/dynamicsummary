// DA 파이프라인 — Assessor(진단) + 턴 엔진.
//
// 역할 분담:
//   da-state.ts  상태 전이·라우팅 (LLM 없음, 순수 함수)
//   da-nodes.ts  LLM 노드 (턴마다 프롬프트 자산 하나)
//   da-output.ts 호출별 출력 계약 (코드 소유)
//   이 파일       셋을 엮는 오케스트레이션 + Assessor

import { callLLMNode } from './ai';
import type {
  APISettings,
  AssessmentItem,
  AssessorOutput,
  Classification,
  DASessionState,
  ResponseContext,
  TurnLog,
  TurnNode,
  UnitOutcome,
} from '@/types';
import { descriptorBlockAll, itemsFrom } from './descriptors';
import {
  MAX_TABS, advanceTo, applyClassification, applyGoalVerdict, closeUnit,
  isTerminalStep, newUnit, nextDestination, orderedAssessment, reconcileWithUtterance,
} from './da-state';
import {
  runAnalysis, runClosing, runConfirmInvite, runConfirmation, runMediation, runOpening,
  runPostConfirm, runProvision, runRecovery, type MediationContext, type UnitTurn,
} from './da-nodes';
import { OUTPUT_ASSESSOR, withOutputContract } from './da-output';

// ─── Assessor ─────────────────────────────────────────────────────────────────

function prependSystem(prompts: Record<string, string>, sysPrompt: string): string {
  const overview = prompts['prompt_system']?.trim();
  return overview ? `${overview}\n\n---\n\n${sysPrompt}` : sysPrompt;
}

export function tabsFromPlan(assessorOutput: AssessorOutput | null): string[] {
  return orderedAssessment(assessorOutput).map((t) => t.item);
}

// Assessor 의 user 입력. IU 표·모범 요약문·중요도는 별도 자료가 아니라
// knowledge_<cycle> 안에 들어 있다 (passages.idea_units 컬럼은 폐기).
function assessorSourceBlock(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
): string {
  const knowledge = prompts['knowledge_active']?.trim();
  const knowledgeBlock = knowledge ? `\n\n[CYCLE KNOWLEDGE RESOURCE]\n${knowledge}` : '';
  return `[SOURCE TEXT]\n${passageContent}${knowledgeBlock}\n\n[STUDENT SUMMARY]\n${summary}`;
}

/**
 * 응답에서 JSON 값을 뽑아낸다.
 *
 * 프롬프트가 "JSON only" 를 지시하지 않으면 모델은 추론 서술을 앞에 붙이고
 * ```json 펜스 안에 결과를 넣는다. 최상위 값이 객체가 아니라 배열일 수도 있다.
 * 그래서 (1) 코드펜스 안, (2) 본문 전체 순으로 괄호 균형을 맞춰 스캔하고,
 * 파싱에 성공하는 첫 값을 돌려준다.
 */
function extractJsonValue(raw: string): unknown {
  const fences = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const text of [...fences, raw]) {
    for (const candidate of balancedCandidates(text)) {
      try { return JSON.parse(candidate); } catch { /* 다음 후보 */ }
    }
  }
  return undefined;
}

/** 문자열 리터럴을 건너뛰며 괄호가 닫히는 지점까지를 후보로 잘라 낸다. */
function* balancedCandidates(text: string): Generator<string> {
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) { yield text.slice(i, j + 1); break; }
    }
  }
}

// prompt_assessor 가 비어 있을 때만 쓰이는 폴백. 출력 형식은 여기 쓰지 않는다 —
// 계약은 da-output.ts 가 소유하고 코드가 프롬프트 뒤에 붙인다.
const ASSESSOR_FALLBACK = `You are the Assessor of a Dynamic Assessment pipeline for EFL summary writing.
Diagnose the learner's summary and select at most ${MAX_TABS} assessment items that genuinely
require mediation.

- problem_priority: relative need for mediation among the selected items (1 = greatest need).
- presentation_order: instructional order in the feedback session (1 = presented first).
  The two need not match — sequence the session higher-order concerns first.
- PI_goal / PSV_goal: what the learner must understand (PI) and be able to explain in their
  own words (PSV). One sentence each.`;

/** Assessor 출력 정규화 — 순위 결측/중복을 코드가 메운다. */
function normalizeAssessment(raw: unknown, itemKeys: Set<string>): AssessmentItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const ITEM_KEYS = itemKeys;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  // 프롬프트는 인용 1~2개를 배열로 요구하지만, 모델이 문자열 하나로 낼 때도 받아 준다.
  const quotes = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [v]).filter((q): q is string => typeof q === 'string' && q.trim() !== '');

  const seen = new Set<string>();
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter((t) => ITEM_KEYS.has(String(t.item)))
    // 항목 하나 = 탭 하나. 같은 항목이 중복되면 탭 키가 겹치므로 첫 번째만 남긴다.
    .filter((t) => !seen.has(String(t.item)) && seen.add(String(t.item)))
    .map((t, i) => ({
      item: String(t.item),
      problem_priority: num(t.problem_priority, i + 1),
      presentation_order: num(t.presentation_order, num(t.problem_priority, i + 1)),
      problem_description: str(t.problem_description),
      student_text_evidence: quotes(t.student_text_evidence),
      selection_rationale: str(t.selection_rationale),
      mediation_focus: str(t.mediation_focus),
      PI_goal: str(t.PI_goal),
      PSV_goal: str(t.PSV_goal),
    }))
    .slice(0, MAX_TABS);
}

/**
 * Assessor — 단일 호출.
 *
 * 입력: prompt_system(과제 개요) + prompt_assessor + 평가 기준 6항목(descriptors)
 *       + knowledge_<cycle>(지식자료) + 지문 + 학생 요약문
 * 출력: 중재할 항목 목록 — 항목별 우선순위·제시순서·문제·근거·선정근거·초점·PI/PSV 목표.
 */
export async function runAssessor(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<AssessorOutput> {
  const items = itemsFrom(prompts);
  const base = prompts['prompt_assessor']?.trim() || ASSESSOR_FALLBACK;
  // 평가 기준(6항목 전체)과 출력 계약은 프롬프트가 아니라 코드가 붙인다.
  const sysPrompt = withOutputContract(
    `${base}

---

${descriptorBlockAll(items)}`,
    OUTPUT_ASSESSOR,
  );
  const userInput = assessorSourceBlock(summary, passageContent, prompts);
  const raw = await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api);
  const parsed = extractJsonValue(raw);
  if (parsed === undefined) {
    throw new Error(`Assessor 응답에서 JSON 을 찾지 못했습니다: ${raw.slice(0, 200)}`);
  }

  // 최상위가 배열일 수도, 래퍼 객체일 수도 있다 (프롬프트 판에 따라 다르다).
  const root = parsed as Record<string, unknown>;
  const assessment = normalizeAssessment(
    Array.isArray(parsed) ? parsed : root.selected_items ?? root.assessment ?? root.items,
    new Set(items.map((i) => i.key)),
  );
  if (!assessment.length) throw new Error('Assessor 가 중재 항목을 반환하지 않았습니다 (selected_items 없음).');
  return { assessment };
}

// ─── 세션 상태 ────────────────────────────────────────────────────────────────

export function createInitialState(): DASessionState {
  return {
    priority_queue: [],
    current_item_idx: 0,
    active_unit: newUnit(1, ''),
    session_started_at: null,
    closing_phase: false,
    awaiting_confirmation: false,
    completed_units: [],
    resolutions: {},
    session_complete: false,
    assessor_output: null,
  };
}

function buildInitState(assessor: AssessorOutput): DASessionState {
  const queue = tabsFromPlan(assessor);
  return {
    ...createInitialState(),
    priority_queue: queue,
    active_unit: newUnit(1, queue[0] ?? ''),
    session_started_at: new Date().toISOString(),
    assessor_output: assessor,
  };
}

export type TurnContext = {
  sourceText: string;
  studentSummary: string;   // Analysis 가 근거 인용을 문맥 안에서 해석할 때 쓴다
  cycleKnowledge: string;
};

export async function initDASession(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<{ state: DASessionState; openingUtterance: string }> {
  const assessor = await runAssessor(summary, passageContent, prompts, api);
  const state = buildInitState(assessor);
  const openingUtterance = await mediate(state, 'opening', [], undefined, {
    sourceText: passageContent,
    studentSummary: summary,
    cycleKnowledge: prompts['knowledge_active'] ?? '',
  }, prompts, api);
  return { state, openingUtterance };
}

// 턴별 발화 라우터. LLM 호출 턴마다 프롬프트 자산이 다르다.
//   opening                                → prompt_opening
//   confusion_rephrase / off_topic_redirect → prompt_recovery
//   on_track_continue (step 1~4)           → prompt_mediation
//   on_track_continue (step 5, terminal)   → prompt_provision
//   confirmation_invite                    → prompt_confirm_invite
//   post_confirmation_help                 → prompt_post_confirm
//   session_closing                        → prompt_closing
async function mediate(
  state: DASessionState,
  ctx: ResponseContext,
  history: UnitTurn[],
  latestLearnerResponse: string | undefined,
  turnCtx: TurnContext,
  prompts: Record<string, string>,
  api: APISettings,
  previousTutorUtterance = '',
): Promise<string> {
  const unit = state.active_unit;

  if (ctx === 'opening') {
    return runOpening(unit, state.priority_queue.length, prompts, api);
  }
  if (ctx === 'confusion_rephrase' || ctx === 'off_topic_redirect') {
    return runRecovery(
      unit,
      ctx === 'confusion_rephrase' ? 'confusion' : 'off_topic',
      previousTutorUtterance,
      latestLearnerResponse ?? '',
      history,
      prompts,
      api,
    );
  }

  const mctx: MediationContext = {
    latestLearnerResponse,
    history,
    completedUnits: state.completed_units,
    totalTabs: state.priority_queue.length,
    sourceText: turnCtx.sourceText,
    studentSummary: turnCtx.studentSummary,
    cycleKnowledge: turnCtx.cycleKnowledge,
  };
  const assessor = state.assessor_output;

  if (ctx === 'confirmation_invite') return runConfirmInvite(assessor, unit, mctx, prompts, api);
  if (ctx === 'post_confirmation_help') return runPostConfirm(assessor, unit, mctx, prompts, api);
  if (ctx === 'session_closing') return runClosing(assessor, unit, mctx, prompts, api);

  // on_track_continue — 여기로 오는 것은 5단계(terminal)뿐이다.
  // 1~4단계는 판정을 함께 내야 해서 processTurn 이 runMediation 을 직접 부른다.
  return runProvision(assessor, unit, mctx, prompts, api);
}

// ─── 턴 처리 ──────────────────────────────────────────────────────────────────

export type TurnResult = {
  utterance: string;          // 현재 탭에 표시할 발화
  next_opening?: string;      // 다음 탭이 열렸을 때 그 탭에 표시할 첫 발화
  updated_state: DASessionState;
  classification: 'on_track' | 'confusion' | 'off_topic' | 'confirmation' | 'closing';
  tab_unlocked: boolean;
  session_complete: boolean;
  /** 이 턴에 일어난 모든 것. 호출 측(server action)이 da_turn_logs 에 그대로 넣는다. */
  log: Omit<TurnLog, 'student_id' | 'phase' | 'turn_index'>;
};

/** 턴 로그 누산기 — processTurn 이 진행하면서 채운다. */
type LogDraft = {
  startedAt: number;
  llmCalls: number;
  classification: Classification | null;
  turn_pi: TurnLog['turn_pi'];
  turn_psv: TurnLog['turn_psv'];
  analysis_rationale: string | null;
  used_target: TurnLog['used_target'];
  used_step: number | null;
  reconcile_mismatch: string | null;
  confirm_decision: string | null;
  confirm_rationale: string | null;
};

function newDraft(): LogDraft {
  return {
    startedAt: Date.now(), llmCalls: 0,
    classification: null, turn_pi: null, turn_psv: null, analysis_rationale: null,
    used_target: null, used_step: null, reconcile_mismatch: null,
    confirm_decision: null, confirm_rationale: null,
  };
}

/** 턴이 끝날 때 로그 한 행을 만든다. */
function buildLog(
  before: DASessionState,
  after: DASessionState,
  d: LogDraft,
  args: {
    learnerMessage: string;
    previousTutorUtterance: string;
    node: TurnNode;
    utterance: string;
    unitClosed: boolean;
    nextItem: string | null;
    sessionComplete?: boolean;
  },
): TurnResult['log'] {
  const b = before.active_unit;
  const a = after.active_unit;
  return {
    tab: b.tab,
    item: b.item,
    item_idx: before.current_item_idx,
    learner_message: args.learnerMessage,
    previous_tutor_utterance: args.previousTutorUtterance,
    classification: d.classification,
    turn_pi: d.turn_pi,
    turn_psv: d.turn_psv,
    analysis_rationale: d.analysis_rationale,
    target_before: b.current_target,
    step_before: b.current_step,
    pi_before: b.cumulative_pi,
    psv_before: b.cumulative_psv,
    target_after: a.current_target,
    step_after: a.current_step,
    pi_after: a.cumulative_pi,
    psv_after: a.cumulative_psv,
    off_track_streak: a.consecutive_off_track ?? 0,
    node: args.node,
    utterance: args.utterance,
    used_target: d.used_target,
    used_step: d.used_step,
    reconcile_mismatch: d.reconcile_mismatch,
    confirm_decision: d.confirm_decision,
    confirm_rationale: d.confirm_rationale,
    unit_closed: args.unitClosed,
    next_item: args.nextItem,
    session_complete: args.sessionComplete ?? after.closing_phase,
    llm_calls: d.llmCalls,
    latency_ms: Date.now() - d.startedAt,
  };
}

/**
 * 유닛을 닫고 다음 행선지로 이동시킨 뒤 그곳의 첫 발화를 만든다.
 * 다음 탭으로 넘어간 경우에만 발화를 nextOpening 으로 분리한다 —
 * 보조 유닛과 종료 안내는 같은 탭에 이어서 표시되기 때문이다.
 */
async function closeAndAdvance(
  state: DASessionState,
  outcome: UnitOutcome,
  principle: string,
  turnCtx: TurnContext,
  prompts: Record<string, string>,
  api: APISettings,
  d: LogDraft,
): Promise<{ state: DASessionState; sameTabText: string; nextOpening?: string; tabUnlocked: boolean }> {
  const closed = state.active_unit;
  let next = closeUnit(state, outcome, principle);
  const dest = nextDestination(next);
  next = advanceTo(next, dest);

  if (dest.kind === 'closing') {
    d.llmCalls++;
    const utterance = await mediate(next, 'session_closing', [], undefined, turnCtx, prompts, api);
    return { state: next, sameTabText: utterance, tabUnlocked: false };
  }
  d.llmCalls++;
  const utterance = await mediate(next, 'opening', [], undefined, turnCtx, prompts, api);
  if (dest.kind === 'next_tab') {
    return { state: next, sameTabText: '', nextOpening: utterance, tabUnlocked: true };
  }
  // 보조 유닛 — 같은 탭에서 이어진다.
  return { state: next, sameTabText: utterance, tabUnlocked: false };
}

/** closeAndAdvance 결과를 TurnResult 로 합친다. */
function toResult(
  adv: { state: DASessionState; sameTabText: string; nextOpening?: string; tabUnlocked: boolean },
  leadingText: string,
  classification: TurnResult['classification'],
  before: DASessionState,
  // 유닛이 닫히기 직전의 상태. '전이 후' 열은 다음 유닛이 아니라
  // **방금 닫힌 유닛의 최종 상태**를 기록해야 연구 데이터로 읽힌다.
  atClose: DASessionState,
  d: LogDraft,
  logArgs: {
    learnerMessage: string;
    previousTutorUtterance: string;
    node: TurnNode;
  },
): TurnResult {
  const parts = [leadingText, adv.sameTabText].filter(Boolean);
  const utterance = parts.join('\n\n');
  const nextItem = adv.state.active_unit.item;
  return {
    utterance,
    next_opening: adv.nextOpening,
    updated_state: adv.state,
    classification,
    tab_unlocked: adv.tabUnlocked,
    session_complete: adv.state.closing_phase,
    log: buildLog(before, atClose, d, {
      ...logArgs,
      // 발화 전문은 다음 탭 오프닝까지 포함해 남긴다 (학생이 이 턴에 본 전부).
      utterance: [utterance, adv.nextOpening].filter(Boolean).join('\n\n'),
      unitClosed: true,
      nextItem: nextItem && nextItem !== before.active_unit.item ? nextItem : null,
      sessionComplete: adv.state.closing_phase,
    }),
  };
}

export async function processTurn(
  state: DASessionState,
  learnerMessage: string,
  latestTutorUtterance: string,
  history: UnitTurn[],
  turnCtx: TurnContext,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<TurnResult> {
  let s: DASessionState = { ...state };
  const d = newDraft();
  const logBase = { learnerMessage, previousTutorUtterance: latestTutorUtterance };
  const log = (node: TurnNode, utterance: string, after: DASessionState = s) =>
    buildLog(state, after, d, { ...logBase, node, utterance, unitClosed: false, nextItem: null });

  // ── 종료 단계: 세션은 이미 끝났다. LLM 을 부르지 않는다.
  //    (UI 도 해결된 탭에서는 입력창을 숨기므로 보통 여기까지 오지 않는다.) ──
  if (s.closing_phase) {
    const utterance = '이번 세션은 여기서 마무리되었어요. 수고 많으셨습니다.';
    return {
      utterance,
      updated_state: s,
      classification: 'closing',
      tab_unlocked: false,
      session_complete: true,
      log: log('session_closed_notice', utterance),
    };
  }

  // ── 전환 확인 대기 중: Analysis 가 아니라 Confirmation 으로 보낸다 ──
  if (s.awaiting_confirmation) {
    d.llmCalls++;
    const confirm = await runConfirmation(
      s.assessor_output, s.active_unit, latestTutorUtterance, learnerMessage, prompts, api,
    );
    const decision = confirm.decision;
    d.confirm_decision = decision ?? null;
    d.confirm_rationale = confirm.rationale ?? null;

    if (decision === 'unclear') {
      // 프롬프트가 "애매하면 추측하지 말라"고 하므로, 코드가 결정적으로 되묻고 대기를 유지한다.
      const utterance = '지금 내용으로 넘어가도 괜찮을까요, 아니면 이 부분을 조금 더 살펴볼까요?';
      return {
        utterance,
        updated_state: s,
        classification: 'confirmation',
        tab_unlocked: false,
        session_complete: false,
        log: log('confirmation_reask', utterance),
      };
    }

    if (decision === 'continue_help') {
      // 직접 설명 1회 → 그 뒤 유닛을 닫고 통상 라우팅. Confirmation 을 반복하지 않는다.
      d.llmCalls++;
      const help = await mediate(s, 'post_confirmation_help', history, learnerMessage, turnCtx, prompts, api);
      const adv = await closeAndAdvance(s, 'completed_by_learner', help, turnCtx, prompts, api, d);
      return toResult(adv, help, 'confirmation', state, s, d, { ...logBase, node: 'post_confirm' });
    }

    // move_on
    const adv = await closeAndAdvance(s, 'completed_by_learner', '', turnCtx, prompts, api, d);
    return toResult(adv, '', 'confirmation', state, s, d, { ...logBase, node: 'unit_closed' });
  }

  // ── 통상 턴 ──
  //   ③ Analysis 가 분류와 목표 판정을 함께 낸다.
  //   코드가 목표·단계를 확정한 뒤, ⑤ Mediation 이 그 자리에서 발화만 만든다.
  d.llmCalls++;
  const analysis = await runAnalysis(
    s.assessor_output, s.active_unit, latestTutorUtterance, learnerMessage, history,
    {
      sourceText: turnCtx.sourceText,
      studentSummary: turnCtx.studentSummary,
      cycleKnowledge: turnCtx.cycleKnowledge,
    },
    prompts, api,
  );
  d.classification = analysis.classification;
  d.turn_pi = analysis.verdict.turn_pi ?? null;
  d.turn_psv = analysis.verdict.turn_psv ?? null;
  d.analysis_rationale = analysis.rationale ?? null;

  const { unit, context } = applyClassification(s.active_unit, analysis.classification);
  s = { ...s, active_unit: unit };

  // 복구 발화 (confusion / off_topic) — 판정 없이 되돌리기만 한다.
  if (context !== 'on_track_continue') {
    d.llmCalls++;
    const utterance = await mediate(
      s, context, history, learnerMessage, turnCtx, prompts, api, latestTutorUtterance,
    );
    return {
      utterance,
      updated_state: s,
      classification: analysis.classification,
      tab_unlocked: false,
      session_complete: false,
      log: log(
        context === 'confusion_rephrase' ? 'recovery_confusion' : 'recovery_off_topic',
        utterance,
      ),
    };
  }

  // 판정을 상태에 반영한다. 이탈 탈출 턴은 판정이 없어 목표·단계가 유지된다.
  const applied = applyGoalVerdict(s.active_unit, analysis.verdict);
  s = { ...s, active_unit: applied.unit };

  if (applied.bothSufficient) {
    // 양쪽 충족 → 유닛을 마무리하며 전환 질문을 던지고, 다음 응답을 Confirmation 이 판정한다.
    d.llmCalls++;
    const utterance = await mediate(s, 'confirmation_invite', history, learnerMessage, turnCtx, prompts, api);
    const after = { ...s, awaiting_confirmation: true };
    return {
      utterance,
      updated_state: after,
      classification: analysis.classification,
      tab_unlocked: false,
      session_complete: false,
      log: log('confirm_invite', utterance, after),
    };
  }

  // 5단계는 terminal — 답을 직접 제공한 뒤 유닛을 닫는다.
  if (isTerminalStep(s.active_unit)) {
    d.llmCalls++;
    const utterance = await mediate(
      s, 'on_track_continue', history, learnerMessage, turnCtx, prompts, api,
    );
    const adv = await closeAndAdvance(s, 'completed_with_explicit_step5', utterance, turnCtx, prompts, api, d);
    return toResult(adv, utterance, analysis.classification, state, s, d, { ...logBase, node: 'provision' });
  }

  // ⑤ 확정된 목표·단계에서 발화를 만든다.
  d.llmCalls++;
  const mediation = await runMediation(
    s.assessor_output, s.active_unit,
    {
      latestLearnerResponse: learnerMessage,
      history,
      completedUnits: s.completed_units,
      totalTabs: s.priority_queue.length,
      sourceText: turnCtx.sourceText,
      studentSummary: turnCtx.studentSummary,
      cycleKnowledge: turnCtx.cycleKnowledge,
    },
    { ...analysis.verdict, rationale: analysis.rationale },
    prompts, api,
  );

  // 발화가 실제로 쓴 목표·단계에 기록을 맞춘다 (학생이 본 것이 사실이다).
  const reconciled = reconcileWithUtterance(s.active_unit, mediation.used);
  if (reconciled.mismatch) {
    console.warn(`[DA] 탭 ${s.active_unit.tab} ${s.active_unit.item}: ${reconciled.mismatch}`);
  }
  s = { ...s, active_unit: reconciled.unit };
  d.used_target = mediation.used?.target ?? null;
  d.used_step = mediation.used?.step ?? null;
  d.reconcile_mismatch = reconciled.mismatch ?? null;

  const utterance = mediation.utterance ?? '';
  return {
    utterance,
    updated_state: s,
    classification: analysis.classification,
    tab_unlocked: false,
    session_complete: false,
    log: log('mediation', utterance),
  };
}

export { unitOf } from './da-state';
