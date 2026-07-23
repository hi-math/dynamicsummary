// DA 상호작용 상태 전이 — 0719 설계의 "Shared code-state contract" 구현.
//
// 이 파일에는 LLM 호출이 없다. Analysis/Confirmation 의 판정 결과를 받아
// 다음 상태와 다음에 부를 Mediator 컨텍스트를 계산하는 순수 로직만 둔다.
// 프롬프트(prompt_analysis / prompt_mediator_common)가 "코드가 해야 한다"고
// 명시한 항목이 여기 모여 있다.

import type {
  ActiveUnit,
  AssessorOutput,
  CompletedUnitSummary,
  DASessionState,
  GoalStatus,
  GoalTarget,
  MediationUnit,
  ResponseContext,
  UnitOutcome,
  UnitRole,
} from '@/types';

export const CHECKPOINT_MINUTES = 25;   // no-new-unit 체크포인트 (세션 목표는 30분)
export const MAX_STEP = 5;

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

export function newUnit(tab: number, item: string, role: UnitRole): ActiveUnit {
  return {
    tab,
    item,
    unit_role: role,
    cumulative_pi: 'absent',
    cumulative_psv: 'absent',
    current_target: 'problem_identification',
    current_step: 1,
  };
}

/**
 * 보조 유닛 지정 — Assessor 출력이 확정된 시점에 한 번만 계산한다.
 * 1) 탭이 3개면 보조를 아예 쓰지 않는다.
 * 2) 탭이 1~2개면 순서상 secondary_mediation_unit 이 null 이 아닌 첫 탭을 지정한다.
 * 세션당 최대 1개이며, 없으면 null.
 */
export function designateSecondaryTab(assessor: AssessorOutput | null): number | null {
  const targets = [...(assessor?.mediation_targets ?? [])].sort((a, b) => a.tab - b.tab);
  if (targets.length >= 3) return null;
  const found = targets.find((t) => t.secondary_mediation_unit != null);
  return found ? found.tab : null;
}

export function unitOf(
  assessor: AssessorOutput | null,
  item: string,
  role: UnitRole,
): MediationUnit | null {
  const t = assessor?.mediation_targets?.find((x) => x.item === item);
  if (!t) return null;
  return role === 'primary' ? t.primary_mediation_unit : t.secondary_mediation_unit;
}

export function checkpointReached(startedAt: string | null, now = Date.now()): boolean {
  if (!startedAt) return false;
  return now - new Date(startedAt).getTime() >= CHECKPOINT_MINUTES * 60_000;
}

// ─── Analysis 결과 적용 ───────────────────────────────────────────────────────

export type AnalysisVerdict = {
  classification: 'on_track' | 'confusion' | 'off_topic';
  turn_pi: GoalStatus | null;
  turn_psv: GoalStatus | null;
};

export type TurnRoute =
  | { kind: 'mediator'; context: ResponseContext }
  | { kind: 'confirmation' };

/**
 * Analysis 판정 → 다음 상태 + 라우팅.
 *
 * confusion / off_topic: 누적 상태·목표·단계를 모두 유지하고 rephrase/redirect 로 보낸다.
 * on_track: 누적을 단조 갱신 → 둘 다 sufficient 면 Confirmation,
 *           아니면 목표 재설정 후 (목표가 여전히 불충분하면) 단계 +1 (5에서 상한).
 *           PI→PSV 로 목표가 바뀌어도 단계는 초기화하지 않는다.
 */
export function applyAnalysis(
  unit: ActiveUnit,
  v: AnalysisVerdict,
): { unit: ActiveUnit; route: TurnRoute } {
  if (v.classification === 'confusion') {
    return { unit, route: { kind: 'mediator', context: 'confusion_rephrase' } };
  }
  if (v.classification === 'off_topic') {
    return { unit, route: { kind: 'mediator', context: 'off_topic_redirect' } };
  }

  const cumulative_pi = raise(unit.cumulative_pi, v.turn_pi);
  const cumulative_psv = raise(unit.cumulative_psv, v.turn_psv);
  const next: ActiveUnit = { ...unit, cumulative_pi, cumulative_psv };

  if (bothSufficient(next)) {
    return { unit: next, route: { kind: 'confirmation' } };
  }

  next.current_target = targetFor(cumulative_pi, cumulative_psv);
  // 학생이 1~4단계에 응답했고 현재 목표가 여전히 불충분하면 한 단계 올린다.
  if (unit.current_step < MAX_STEP) {
    next.current_step = (unit.current_step + 1) as ActiveUnit['current_step'];
  }
  return { unit: next, route: { kind: 'mediator', context: 'on_track_continue' } };
}

/** Step 5 는 terminal 이다 — 발화 후 응답을 기다리지 않고 유닛을 닫는다. */
export function isTerminalStep(unit: ActiveUnit): boolean {
  return unit.current_step === MAX_STEP;
}

// ─── 유닛 종료 후 다음 행선지 ────────────────────────────────────────────────

export type NextDestination =
  | { kind: 'secondary'; tab: number; item: string }
  | { kind: 'next_tab'; index: number; item: string }
  | { kind: 'closing' };

/**
 * 유닛이 닫힌 뒤 어디로 갈지.
 *
 * 보조 유닛 진입 조건: 지정된 탭이고, 아직 쓰지 않았고, 방금 닫힌 게 그 탭의 주 유닛이며,
 * 학생 응답으로 완료됐고(step5 종료가 아니고), 체크포인트 전이어야 한다.
 * 체크포인트에 도달했으면 새 유닛을 시작하지 않고 종료 단계로 간다.
 */
export function nextDestination(
  state: DASessionState,
  closedUnit: ActiveUnit,
  outcome: UnitOutcome,
): NextDestination {
  const checkpoint = state.closing_checkpoint_reached;

  const canSecondary =
    !checkpoint &&
    !state.secondary_used &&
    state.secondary_designated_tab === closedUnit.tab &&
    closedUnit.unit_role === 'primary' &&
    outcome === 'completed_by_learner' &&
    unitOf(state.assessor_output, closedUnit.item, 'secondary') != null;

  if (canSecondary) {
    return { kind: 'secondary', tab: closedUnit.tab, item: closedUnit.item };
  }

  const nextIdx = state.current_item_idx + 1;
  if (!checkpoint && nextIdx < state.priority_queue.length) {
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
  const unit = unitOf(state.assessor_output, u.item, u.unit_role);
  const summary: CompletedUnitSummary = {
    tab: u.tab,
    item: u.item,
    unit_role: u.unit_role,
    descriptor_key: unit?.descriptor_key ?? '',
    pi_status: u.cumulative_pi,
    psv_status: u.cumulative_psv,
    principle_discussed: principleDiscussed,
    strategy_or_tool_used: [],
    learner_question_note: null,
  };
  return {
    ...state,
    completed_units: [...state.completed_units, summary],
    resolutions: u.unit_role === 'primary'
      ? { ...state.resolutions, [u.item]: true }
      : state.resolutions,
    awaiting_confirmation: false,
    secondary_used: u.unit_role === 'secondary' ? true : state.secondary_used,
  };
}

/** 다음 행선지를 상태에 반영한다. */
export function advanceTo(state: DASessionState, dest: NextDestination): DASessionState {
  if (dest.kind === 'secondary') {
    return { ...state, active_unit: newUnit(dest.tab, dest.item, 'secondary') };
  }
  if (dest.kind === 'next_tab') {
    return {
      ...state,
      current_item_idx: dest.index,
      active_unit: newUnit(dest.index + 1, dest.item, 'primary'),
    };
  }
  return { ...state, closing_phase: true };
}
