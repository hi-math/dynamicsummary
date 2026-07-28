// DA 상호작용 상태 전이 — 0719 설계의 "Shared code-state contract" 구현.
//
// 이 파일에는 LLM 호출이 없다. Analysis/Confirmation 의 판정 결과를 받아
// 다음 상태와 다음에 부를 Mediator 컨텍스트를 계산하는 순수 로직만 둔다.
// 프롬프트(prompt_analysis / prompt_mediator_common)가 "코드가 해야 한다"고
// 명시한 항목이 여기 모여 있다.

import type {
  ActiveUnit,
  AssessmentItem,
  AssessorOutput,
  Classification,
  CompletedUnitSummary,
  DASessionState,
  GoalStatus,
  GoalTarget,
  ResponseContext,
  UnitOutcome,
} from '@/types';

export const MAX_STEP = 5;
// confusion/off_topic 이 연속 이만큼 나오면 재설명을 반복하지 않고 단계를 +1 해서 탈출한다.
export const OFF_TRACK_ESCALATE_AT = 2;
export const MAX_TABS = 3;              // 학생 화면의 탭 상한

const RANK: Record<GoalStatus, number> = { absent: 0, partial: 1, sufficient: 2 };

/** 단조 갱신: 이미 도달한 최고 상태를 낮추지 않는다. */
export function raise(current: GoalStatus, incoming: GoalStatus | null): GoalStatus {
  if (!incoming) return current;
  return RANK[incoming] > RANK[current] ? incoming : current;
}

/** PI 가 충분해지기 전에는 PI 를, 그 뒤에는 PSV 를 목표로 삼는다. */
export function targetFor(pi: GoalStatus, psv: GoalStatus): GoalTarget {
  return pi !== 'sufficient' ? 'problem_identification' : 'problem_solution_verbalization';
}

export function bothSufficient(u: ActiveUnit): boolean {
  return u.cumulative_pi === 'sufficient' && u.cumulative_psv === 'sufficient';
}

export function newUnit(tab: number, item: string): ActiveUnit {
  return {
    tab,
    item,
    cumulative_pi: 'absent',
    cumulative_psv: 'absent',
    current_target: 'problem_identification',
    current_step: 1,
    consecutive_off_track: 0,
  };
}

/**
 * 제시 순서(presentation_order)대로 정렬된 중재 항목.
 * Assessor 가 정한 순서를 코드가 재계산하지 않는다.
 * 이미 저장된 구 스키마(mediation_targets)는 여기서 새 형태로 변환해 읽는다.
 */
export function orderedAssessment(assessor: AssessorOutput | null): AssessmentItem[] {
  if (!assessor) return [];
  const list = assessor.assessment?.length ? assessor.assessment : legacyToAssessment(assessor);
  return [...list]
    .sort((a, b) => a.presentation_order - b.presentation_order)
    .slice(0, MAX_TABS);
}

/** 구 mediation_targets 기록 → 새 AssessmentItem 형태 (읽기 전용 호환). */
function legacyToAssessment(a: AssessorOutput): AssessmentItem[] {
  return (a.mediation_targets ?? []).map((t) => {
    const u = t.primary_mediation_unit;
    const ev = a.items?.[t.item]?.detected_descriptors
      ?.find((d) => d.key === u?.descriptor_key)?.evidence;
    return {
      item: t.item,
      problem_priority: t.tab,
      presentation_order: t.tab,
      problem_description: ev?.explanation ?? '',
      student_text_evidence: ev?.student_text ? [ev.student_text] : [],
      selection_rationale: t.priority_rationale ?? '',
      mediation_focus: u?.feedback_focus ?? '',
      PI_goal: u?.mediation_goal?.problem_identification ?? '',
      PSV_goal: u?.mediation_goal?.problem_solution_verbalization ?? '',
    };
  });
}

/** 활성 유닛에 대응하는 Assessor 항목. */
export function unitOf(assessor: AssessorOutput | null, item: string): AssessmentItem | null {
  return orderedAssessment(assessor).find((x) => x.item === item) ?? null;
}

// ─── Analysis 결과 적용 ───────────────────────────────────────────────────────

/** Mediation(⑤) 이 발화와 함께 내는 목표 판정. 한 턴에 하나만 채워진다. */
export type GoalVerdict = {
  turn_pi: GoalStatus | null;
  turn_psv: GoalStatus | null;
};

/** Mediation 이 "내 발화는 이 목표·이 단계로 썼다"고 신고한 값. */
export type UsedPosition = {
  target: GoalTarget;
  step: 1 | 2 | 3 | 4;
};

/**
 * 1단계 — 분류에 따른 라우팅. (Analysis 결과만으로 결정한다)
 *
 * confusion / off_topic: 누적 상태·목표·단계를 유지하고 rephrase/redirect 로 보낸다.
 *           단, 연속 OFF_TRACK_ESCALATE_AT 회에 도달하면 단계를 +1 하고 통상 중재로
 *           돌려보낸다 (같은 단계에서 재설명만 반복하는 루프를 막는다).
 * on_track: 그대로 중재 턴으로 보낸다. 목표 판정 반영은 applyGoalVerdict 가 한다.
 */
export function applyClassification(
  unit: ActiveUnit,
  classification: Classification,
): { unit: ActiveUnit; context: ResponseContext; escalated: boolean } {
  if (classification === 'on_track') {
    return {
      unit: { ...unit, consecutive_off_track: 0 },
      context: 'on_track_continue',
      escalated: false,
    };
  }

  const streak = (unit.consecutive_off_track ?? 0) + 1;
  if (streak >= OFF_TRACK_ESCALATE_AT) {
    // 탈출: 재설명을 반복하지 않고 한 단계 더 명시적인 중재로 돌아간다.
    const escalated: ActiveUnit = {
      ...unit,
      current_step: Math.min(unit.current_step + 1, MAX_STEP) as ActiveUnit['current_step'],
      consecutive_off_track: 0,
    };
    return { unit: escalated, context: 'on_track_continue', escalated: true };
  }
  return {
    unit: { ...unit, consecutive_off_track: streak },
    context: classification === 'confusion' ? 'confusion_rephrase' : 'off_topic_redirect',
    escalated: false,
  };
}

/**
 * 2단계 — 중재 턴이 낸 목표 판정을 상태에 반영한다.
 *
 * 누적은 단조 갱신. 둘 다 sufficient 면 전환 확인(⑦)으로 간다.
 * 그렇지 않으면 PI 를 먼저 끝내고 PSV 로 넘어가며,
 *   · PI 충족 → PSV 로 전환하는 턴은 단계를 1 로 리셋 (새 목표를 처음부터)
 *   · 활성 목표가 여전히 absent → 단계 +1 (5 에서 상한)
 * 판정이 없는 턴(이탈 직후 등)에는 단계도 목표도 건드리지 않는다.
 */
export function applyGoalVerdict(
  unit: ActiveUnit,
  v: GoalVerdict,
): { unit: ActiveUnit; bothSufficient: boolean } {
  const judged = v.turn_pi != null || v.turn_psv != null;
  const cumulative_pi = raise(unit.cumulative_pi, v.turn_pi);
  const cumulative_psv = raise(unit.cumulative_psv, v.turn_psv);
  const next: ActiveUnit = { ...unit, cumulative_pi, cumulative_psv };

  if (bothSufficient(next)) return { unit: next, bothSufficient: true };
  // 판정이 없는 턴(이탈 직후, 또는 응답 파싱 실패)에는 목표도 단계도 건드리지 않는다.
  if (!judged) return { unit: next, bothSufficient: false };

  const nextTarget = targetFor(cumulative_pi, cumulative_psv);
  const switchedToPSV =
    unit.current_target === 'problem_identification' &&
    nextTarget === 'problem_solution_verbalization';
  next.current_target = nextTarget;

  if (switchedToPSV) {
    next.current_step = 1;
  } else if (unit.current_step < MAX_STEP) {
    next.current_step = (unit.current_step + 1) as ActiveUnit['current_step'];
  }
  return { unit: next, bothSufficient: false };
}

/**
 * 발화와 기록을 일치시킨다.
 *
 * ⑤ 는 판정과 발화를 한 번에 만들므로, 코드가 계산한 다음 목표·단계와
 * 모델이 실제로 쓴 발화가 어긋날 수 있다. 학생이 본 것이 사실이므로
 * **모델이 신고한 값을 정본으로 삼고**, 어긋난 사실만 알린다.
 */
export function reconcileWithUtterance(
  unit: ActiveUnit,
  used: UsedPosition | null,
): { unit: ActiveUnit; mismatch: string | null } {
  if (!used) return { unit, mismatch: null };
  const sameTarget = used.target === unit.current_target;
  const sameStep = used.step === unit.current_step;
  if (sameTarget && sameStep) return { unit, mismatch: null };

  const label = (t: GoalTarget) => (t === 'problem_identification' ? 'PI' : 'PSV');
  return {
    unit: { ...unit, current_target: used.target, current_step: used.step },
    mismatch:
      `코드 계산 ${label(unit.current_target)}/step${unit.current_step} ≠ ` +
      `발화 ${label(used.target)}/step${used.step} — 발화 기준으로 맞춥니다.`,
  };
}

/** Step 5 는 terminal 이다 — 발화 후 응답을 기다리지 않고 유닛을 닫는다. */
export function isTerminalStep(unit: ActiveUnit): boolean {
  return unit.current_step === MAX_STEP;
}

// ─── 유닛 종료 후 다음 행선지 ────────────────────────────────────────────────

export type NextDestination =
  | { kind: 'next_tab'; index: number; item: string }
  | { kind: 'closing' };

/** 유닛이 닫힌 뒤 어디로 갈지 — 남은 탭이 있으면 다음 탭, 없으면 세션 종료. */
export function nextDestination(state: DASessionState): NextDestination {
  const nextIdx = state.current_item_idx + 1;
  if (nextIdx < state.priority_queue.length) {
    return { kind: 'next_tab', index: nextIdx, item: state.priority_queue[nextIdx] };
  }
  return { kind: 'closing' };
}

/** 유닛을 닫고 요약을 남긴다. */
export function closeUnit(
  state: DASessionState,
  outcome: UnitOutcome,
  principleDiscussed: string,
): DASessionState {
  const u = state.active_unit;
  const unit = unitOf(state.assessor_output, u.item);
  const summary: CompletedUnitSummary = {
    tab: u.tab,
    item: u.item,
    mediation_focus: unit?.mediation_focus ?? '',
    pi_status: u.cumulative_pi,
    psv_status: u.cumulative_psv,
    principle_discussed: principleDiscussed,
    strategy_or_tool_used: [],
    learner_question_note: null,
  };
  return {
    ...state,
    completed_units: [...state.completed_units, summary],
    resolutions: { ...state.resolutions, [u.item]: true },
    awaiting_confirmation: false,
  };
}

/** 다음 행선지를 상태에 반영한다. */
export function advanceTo(state: DASessionState, dest: NextDestination): DASessionState {
  if (dest.kind === 'next_tab') {
    return {
      ...state,
      current_item_idx: dest.index,
      active_unit: newUnit(dest.index + 1, dest.item),
    };
  }
  return { ...state, closing_phase: true };
}
