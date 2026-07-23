// DA 파이프라인 — Assessor(진단) + 턴 엔진.
//
// 역할 분담:
//   da-state.ts  상태 전이·라우팅 (LLM 없음, 순수 함수)
//   da-nodes.ts  LLM 노드 3개 (Analysis / Mediator / Confirmation)
//   이 파일       둘을 엮는 오케스트레이션 + Assessor
//
// 프롬프트(prompt_mediator_common / prompt_analysis)가 "코드가 결정한다"고 명시한
// 항목은 모두 코드에 있고, Mediator 는 발화 생성만 한다.

import { callLLMNode } from './ai';
import type {
  APISettings,
  AssessorOutput,
  DASessionState,
  ResponseContext,
  UnitOutcome,
} from '@/types';
import descriptorsData from '@/data/descriptors.json';
import {
  advanceTo, applyAnalysis, checkpointReached, closeUnit, designateSecondaryTab,
  isTerminalStep, newUnit, nextDestination, unitOf,
} from './da-state';
import { runAnalysis, runConfirmation, runMediator, type UnitTurn } from './da-nodes';

// ─── Assessor ─────────────────────────────────────────────────────────────────

function buildDescriptorBlock(): string {
  return descriptorsData.items
    .map((item) => {
      const dList = item.descriptors
        .map((d) => `  - ${d.key}: ${d.definition} | 탐지신호: ${d.signal}`)
        .join('\n');
      return `[${item.key}] ${item.label}\n${dList}`;
    })
    .join('\n\n');
}

function prependSystem(prompts: Record<string, string>, sysPrompt: string): string {
  const overview = prompts['prompt_system']?.trim();
  return overview ? `${overview}\n\n---\n\n${sysPrompt}` : sysPrompt;
}

// 계획이 없을 때만 쓰는 순서 폴백 (higher-order concerns first).
const HOC_ORDER = [
  'main_idea_coverage', 'content_accuracy', 'organization',
  'condensation', 'paraphrasing', 'language_use',
];

export function tabsFromPlan(assessorOutput: AssessorOutput): string[] {
  const targets = assessorOutput?.mediation_targets;
  if (targets?.length) {
    // Assessor 가 Step 2 에서 정한 순서를 그대로 쓴다. 재계산하지 않는다.
    return [...targets].sort((a, b) => a.tab - b.tab).map((t) => t.item).slice(0, 3);
  }
  if (!assessorOutput?.items) return [];
  return HOC_ORDER
    .filter((k) => (assessorOutput.items[k]?.detected_descriptors?.length ?? 0) > 0)
    .slice(0, 3);
}

export type AssessorRefs = {
  ideaUnits?: { id: string; text: string; importance: string }[];
};

function assessorSourceBlock(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  refs: AssessorRefs,
): string {
  const knowledge = prompts['knowledge_active']?.trim();
  const knowledgeBlock = knowledge ? `\n\n[CYCLE KNOWLEDGE RESOURCE]\n${knowledge}` : '';
  const iuBlock = refs.ideaUnits?.length
    ? '\n\n[IU TABLE]\n' + refs.ideaUnits.map((u) => `- (${u.importance}) ${u.text}`).join('\n')
    : '';
  return `[SOURCE TEXT]\n${passageContent}${knowledgeBlock}${iuBlock}\n\n[STUDENT SUMMARY]\n${summary}`;
}

function parseJson(raw: string, label: string): Record<string, unknown> {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`${label} returned non-JSON output: ${raw.slice(0, 200)}`);
  return JSON.parse(json);
}

// 턴 2 의 severity 맵을 턴 1 의 items 진단에 병합한다 (downstream 이 detected_descriptors[].severity 를 읽음).
function mergeSeverity(
  items: AssessorOutput['items'],
  severity: Record<string, Record<string, string>> | undefined,
): AssessorOutput['items'] {
  if (!severity) return items;
  for (const [item, diag] of Object.entries(items ?? {})) {
    for (const d of diag.detected_descriptors ?? []) {
      const s = severity[item]?.[d.key];
      if (s === 'high' || s === 'medium' || s === 'low') d.severity = s;
    }
  }
  return items;
}

// 턴 1 — 진단 + 다룰 항목 선택 (심각도·순서 없음).
async function runAssessorSelect(
  summary: string, passageContent: string,
  prompts: Record<string, string>, api: APISettings, refs: AssessorRefs,
): Promise<{ items: AssessorOutput['items']; selected_items: unknown[] }> {
  const sysPrompt = prompts['prompt_assessor_select']?.trim() ||
    `Diagnose the summary against the 6 items / 16 descriptors below and select up to 3 items
to mediate (with evidence). Do NOT assign severity or order. Respond ONLY with JSON:
{ "items": {...}, "selected_items": [...] }

## Descriptor Reference
${buildDescriptorBlock()}`;
  const userInput = assessorSourceBlock(summary, passageContent, prompts, refs);
  const parsed = parseJson(await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api), 'Assessor(select)');
  return {
    items: (parsed.items ?? {}) as AssessorOutput['items'],
    selected_items: (parsed.selected_items ?? []) as unknown[],
  };
}

// 턴 2 — 심각도 산출 + 제시 순서 + 목표. 턴 1 출력을 입력으로 받는다.
async function runAssessorOrder(
  turn1: { items: AssessorOutput['items']; selected_items: unknown[] },
  summary: string, passageContent: string,
  prompts: Record<string, string>, api: APISettings, refs: AssessorRefs,
): Promise<{ severity?: Record<string, Record<string, string>>; mediation_targets: AssessorOutput['mediation_targets'] }> {
  const sysPrompt = prompts['prompt_assessor_order']?.trim() ||
    `Given the Turn-1 diagnosis, assign severity to each detected descriptor, order the selected
items (higher-order concerns first), and define PI/PSV goals (+ optional secondary). Respond ONLY
with JSON: { "severity": {...}, "mediation_targets": [...] }`;
  const userInput = `${assessorSourceBlock(summary, passageContent, prompts, refs)}

[TURN 1 — DIAGNOSIS]
${JSON.stringify({ items: turn1.items, selected_items: turn1.selected_items }, null, 2)}`;
  const parsed = parseJson(await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api), 'Assessor(order)');
  return {
    severity: parsed.severity as Record<string, Record<string, string>> | undefined,
    mediation_targets: (parsed.mediation_targets ?? []) as AssessorOutput['mediation_targets'],
  };
}

/**
 * Assessor — 2턴 파이프라인.
 *   턴 1(select): 진단 + 항목 선택 + 근거   →  턴 2(order): 심각도 + 순서 + 목표.
 * prompt_assessor_select 가 없으면 구 단일 프롬프트(prompt_assessor)로 폴백한다.
 */
export async function runAssessor(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
  refs: AssessorRefs = {},
): Promise<AssessorOutput> {
  // ── 폴백: 2턴 프롬프트가 없으면 단일 호출 ──
  if (!prompts['prompt_assessor_select']?.trim() && prompts['prompt_assessor']?.trim()) {
    const userInput = assessorSourceBlock(summary, passageContent, prompts, refs);
    const parsed = parseJson(
      await callLLMNode(prependSystem(prompts, prompts['prompt_assessor']), userInput, api),
      'Assessor',
    );
    if (!parsed.items) {
      const ITEM_KEYS = new Set(descriptorsData.items.map((i) => i.key));
      if (Object.keys(parsed).some((k) => ITEM_KEYS.has(k))) return { items: parsed } as AssessorOutput;
      throw new Error('Assessor output missing "items".');
    }
    return parsed as unknown as AssessorOutput;
  }

  // ── 2턴 ──
  const turn1 = await runAssessorSelect(summary, passageContent, prompts, api, refs);
  const turn2 = await runAssessorOrder(turn1, summary, passageContent, prompts, api, refs);
  return {
    items: mergeSeverity(turn1.items, turn2.severity),
    mediation_targets: turn2.mediation_targets,
  };
}

// ─── 세션 상태 ────────────────────────────────────────────────────────────────

export function createInitialState(): DASessionState {
  return {
    priority_queue: [],
    current_item_idx: 0,
    active_unit: newUnit(1, '', 'primary'),
    secondary_designated_tab: null,
    secondary_used: false,
    closing_checkpoint_reached: false,
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
    active_unit: newUnit(1, queue[0] ?? '', 'primary'),
    // 보조 유닛은 Assessor 출력이 확정된 지금 한 번만 지정한다 (탭 3개면 없음).
    secondary_designated_tab: designateSecondaryTab(assessor),
    session_started_at: new Date().toISOString(),
    assessor_output: assessor,
  };
}

export type TurnContext = {
  sourceText: string;
  cycleKnowledge: string;
};

export async function initDASession(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
  refs: AssessorRefs = {},
): Promise<{ state: DASessionState; openingUtterance: string }> {
  const assessor = await runAssessor(summary, passageContent, prompts, api, refs);
  const state = buildInitState(assessor);
  const openingUtterance = await mediate(state, 'opening', [], undefined, {
    sourceText: passageContent,
    cycleKnowledge: prompts['knowledge_active'] ?? '',
  }, prompts, api);
  return { state, openingUtterance };
}

// Mediator 호출 래퍼 — 세션 수준 정보를 함께 넘긴다.
async function mediate(
  state: DASessionState,
  ctx: ResponseContext,
  history: UnitTurn[],
  latestLearnerResponse: string | undefined,
  turnCtx: TurnContext,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  return runMediator(
    state.assessor_output,
    state.active_unit,
    ctx,
    {
      latestLearnerResponse,
      history,
      completedUnits: state.completed_units,
      totalTabs: state.priority_queue.length,
      secondaryDesignated: state.secondary_designated_tab != null,
      secondaryUsed: state.secondary_used,
      checkpointReached: state.closing_checkpoint_reached,
      sourceText: turnCtx.sourceText,
      cycleKnowledge: turnCtx.cycleKnowledge,
    },
    prompts,
    api,
  );
}

// ─── 턴 처리 ──────────────────────────────────────────────────────────────────

export type TurnResult = {
  utterance: string;          // 현재 탭에 표시할 발화
  next_opening?: string;      // 다음 탭이 열렸을 때 그 탭에 표시할 첫 발화
  updated_state: DASessionState;
  classification: 'on_track' | 'confusion' | 'off_topic' | 'confirmation' | 'closing';
  tab_unlocked: boolean;
  session_complete: boolean;
};

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
): Promise<{ state: DASessionState; sameTabText: string; nextOpening?: string; tabUnlocked: boolean }> {
  const closed = state.active_unit;
  let next = closeUnit(state, outcome, principle);
  const dest = nextDestination(next, closed, outcome);
  next = advanceTo(next, dest);

  if (dest.kind === 'closing') {
    const utterance = await mediate(next, 'session_closing_invite', [], undefined, turnCtx, prompts, api);
    return { state: next, sameTabText: utterance, tabUnlocked: false };
  }
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
): TurnResult {
  const parts = [leadingText, adv.sameTabText].filter(Boolean);
  return {
    utterance: parts.join('\n\n'),
    next_opening: adv.nextOpening,
    updated_state: adv.state,
    classification,
    tab_unlocked: adv.tabUnlocked,
    session_complete: adv.state.closing_phase,
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
  // 25분 체크포인트는 매 턴 갱신한다 (새 유닛 시작 금지용).
  let s: DASessionState = {
    ...state,
    closing_checkpoint_reached:
      state.closing_checkpoint_reached || checkpointReached(state.session_started_at),
  };

  // ── 종료 단계: 학생 질문에 직접 답한다 (DA 형식으로 만들지 않는다) ──
  if (s.closing_phase) {
    const utterance = await mediate(s, 'final_question_answer', history, learnerMessage, turnCtx, prompts, api);
    return { utterance, updated_state: s, classification: 'closing', tab_unlocked: false, session_complete: false };
  }

  // ── 전환 확인 대기 중: Analysis 가 아니라 Confirmation 으로 보낸다 ──
  if (s.awaiting_confirmation) {
    const { decision } = await runConfirmation(
      s.assessor_output, s.active_unit, latestTutorUtterance, learnerMessage, prompts, api,
    );

    if (decision === 'unclear') {
      // 프롬프트가 "애매하면 추측하지 말라"고 하므로, 코드가 결정적으로 되묻고 대기를 유지한다.
      return {
        utterance: '지금 내용으로 넘어가도 괜찮을까요, 아니면 이 부분을 조금 더 살펴볼까요?',
        updated_state: s,
        classification: 'confirmation',
        tab_unlocked: false,
        session_complete: false,
      };
    }

    if (decision === 'continue_help') {
      // 직접 설명 1회 → 그 뒤 유닛을 닫고 통상 라우팅. Confirmation 을 반복하지 않는다.
      const help = await mediate(s, 'post_confirmation_help', history, learnerMessage, turnCtx, prompts, api);
      const adv = await closeAndAdvance(s, 'completed_by_learner', help, turnCtx, prompts, api);
      return toResult(adv, help, 'confirmation');
    }

    // move_on
    const adv = await closeAndAdvance(s, 'completed_by_learner', '', turnCtx, prompts, api);
    return toResult(adv, '', 'confirmation');
  }

  // ── 통상 턴: Analysis → 상태 전이 → Mediator ──
  const verdict = await runAnalysis(
    s.assessor_output, s.active_unit, latestTutorUtterance, learnerMessage, history, prompts, api,
  );
  const { unit, route } = applyAnalysis(s.active_unit, verdict);
  s = { ...s, active_unit: unit };

  if (route.kind === 'confirmation') {
    // 양쪽 충족 → Mediator 가 마무리하며 전환 질문을 던지고, 다음 응답을 Confirmation 이 판정한다.
    const utterance = await mediate(s, 'on_track_continue', history, learnerMessage, turnCtx, prompts, api);
    return {
      utterance,
      updated_state: { ...s, awaiting_confirmation: true },
      classification: 'on_track',
      tab_unlocked: false,
      session_complete: false,
    };
  }

  const utterance = await mediate(s, route.context, history, learnerMessage, turnCtx, prompts, api);

  // Step 5 는 terminal — 응답을 기다리지 않고 유닛을 닫는다. 보조 유닛도 열지 않는다.
  if (route.context === 'on_track_continue' && isTerminalStep(s.active_unit)) {
    const adv = await closeAndAdvance(s, 'completed_with_explicit_step5', utterance, turnCtx, prompts, api);
    return toResult(adv, utterance, verdict.classification);
  }

  return {
    utterance,
    updated_state: s,
    classification: verdict.classification,
    tab_unlocked: false,
    session_complete: false,
  };
}

export { unitOf } from './da-state';
