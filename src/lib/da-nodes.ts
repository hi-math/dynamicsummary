// DA LLM 노드 — 0719 프롬프트의 입출력 계약을 그대로 따른다.
//
// 노드는 3개뿐이다: Analysis / Mediator / Confirmation.
// (구 Reexplainer·Deflector 는 Mediator 의 response_context 로 흡수됐다.)
// 상태 전이·라우팅은 여기가 아니라 da-state.ts 가 담당한다.

import { callLLMNode } from './ai';
import type {
  APISettings,
  ActiveUnit,
  AssessorOutput,
  CompletedUnitSummary,
  DescriptorEvidence,
  GoalStatus,
  MediationUnit,
  ResponseContext,
} from '@/types';
import type { AnalysisVerdict } from './da-state';
import { unitOf } from './da-state';

// 현재 유닛의 대화. prompt_mediator_common 의 History input contract 형식.
export type UnitTurn = {
  speaker: 'mediator' | 'learner';
  step?: number;
  target?: string;
  text: string;
};

// 최근 12개까지만 보낸다 (프롬프트 권장 상한).
export const UNIT_HISTORY_LIMIT = 12;
export const trimHistory = (h: UnitTurn[]) => h.slice(-UNIT_HISTORY_LIMIT);

function prependSystem(prompts: Record<string, string>, sysPrompt: string): string {
  const overview = prompts['prompt_system']?.trim();
  return overview ? `${overview}\n\n---\n\n${sysPrompt}` : sysPrompt;
}

/**
 * 카테고리 가이던스에서 현재 item 블록만 잘라낸다.
 * prompt_category_guidance 는 [CATEGORY:key] ... [/CATEGORY] 로 구획되어 있고,
 * 프롬프트 자신이 "extract and provide only the block whose key matches
 * primary_category" 라고 지시한다.
 */
export function extractCategoryBlock(guidance: string, item: string): string {
  if (!guidance) return '';
  const usage = guidance.match(/\[GUIDANCE_USAGE\][\s\S]*?\[\/GUIDANCE_USAGE\]/)?.[0] ?? '';
  const re = new RegExp(`\\[CATEGORY:${item}\\]([\\s\\S]*?)\\[\\/CATEGORY\\]`);
  const block = guidance.match(re)?.[1]?.trim();
  if (!block) return '';
  return usage ? `${usage}\n\n${block}` : block;
}

function evidenceOf(
  assessor: AssessorOutput | null,
  item: string,
  descriptorKey: string,
): DescriptorEvidence | null {
  return assessor?.items?.[item]?.detected_descriptors
    ?.find((d) => d.key === descriptorKey)?.evidence ?? null;
}

/** 활성 유닛의 진단 정보 묶음 — Analysis/Mediator 가 공통으로 받는 부분. */
function unitContext(assessor: AssessorOutput | null, u: ActiveUnit) {
  const unit: MediationUnit | null = unitOf(assessor, u.item, u.unit_role);
  return {
    current_tab: u.tab,
    current_item: u.item,
    current_unit_role: u.unit_role,
    current_descriptor: unit?.descriptor_key ?? null,
    feedback_focus: unit?.feedback_focus ?? null,
    current_evidence: unit ? evidenceOf(assessor, u.item, unit.descriptor_key) : null,
    mediation_goal: unit?.mediation_goal ?? null,
    current_target: u.current_target,
    current_step: u.current_step,
    cumulative_pi: u.cumulative_pi,
    cumulative_psv: u.cumulative_psv,
  };
}

// ─── Analysis ────────────────────────────────────────────────────────────────

const ANALYSIS_FALLBACK = `You are the Analysis component in a Dynamic Assessment interaction.
Judge the learner's latest response against the active unit's PI and PSV goals.
Return ONLY: { "classification": "on_track"|"confusion"|"off_topic",
"turn_pi": "absent"|"partial"|"sufficient"|null, "turn_psv": same, "rationale": "..." }
Set turn_pi/turn_psv to null when classification is confusion or off_topic.`;

export async function runAnalysis(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  latestTutorUtterance: string,
  latestLearnerResponse: string,
  history: UnitTurn[],
  prompts: Record<string, string>,
  api: APISettings,
): Promise<AnalysisVerdict & { rationale: string }> {
  const sysPrompt = prompts['prompt_analysis']?.trim() || ANALYSIS_FALLBACK;
  const userInput = JSON.stringify({
    ...unitContext(assessor, unit),
    latest_tutor_utterance: latestTutorUtterance,
    latest_learner_response: latestLearnerResponse,
    current_unit_history: trimHistory(history),
  });

  const raw = await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return { classification: 'on_track', turn_pi: 'absent', turn_psv: 'absent', rationale: 'parse error' };
  }
  const p = JSON.parse(json);
  const norm = (v: unknown): GoalStatus | null =>
    v === 'absent' || v === 'partial' || v === 'sufficient' ? v : null;
  const classification =
    p.classification === 'confusion' || p.classification === 'off_topic' ? p.classification : 'on_track';
  return {
    classification,
    // confusion/off_topic 이면 프롬프트가 null 을 내도록 되어 있다. 방어적으로 강제한다.
    turn_pi: classification === 'on_track' ? norm(p.turn_pi) : null,
    turn_psv: classification === 'on_track' ? norm(p.turn_psv) : null,
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
  };
}

// ─── Mediator ────────────────────────────────────────────────────────────────

const MEDIATOR_FALLBACK = `You are a Dynamic Assessment tutor for EFL summary writing.
Produce ONE student-facing tutor utterance in polite, natural Korean.
Follow the supplied response_context and current_step. Do not output JSON or metadata.`;

export async function runMediator(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  ctx: ResponseContext,
  opts: {
    latestLearnerResponse?: string;
    history: UnitTurn[];
    completedUnits: CompletedUnitSummary[];
    totalTabs: number;
    secondaryDesignated: boolean;
    secondaryUsed: boolean;
    checkpointReached: boolean;
    sourceText: string;
    cycleKnowledge: string;
  },
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  const base = prompts['prompt_mediator_common']?.trim() || MEDIATOR_FALLBACK;
  // 현재 item 의 카테고리 가이던스만 붙인다.
  const category = extractCategoryBlock(prompts['prompt_category_guidance'] ?? '', unit.item);
  const sysPrompt = category ? `${base}\n\n---\n\n${category}` : base;

  const userInput = JSON.stringify({
    ...unitContext(assessor, unit),
    total_tabs: opts.totalTabs,
    secondary_designated_for_session: opts.secondaryDesignated,
    secondary_used: opts.secondaryUsed,
    closing_checkpoint_reached: opts.checkpointReached,
    response_context: ctx,
    latest_learner_response: opts.latestLearnerResponse ?? null,
    current_unit_history: trimHistory(opts.history),
    completed_unit_summaries: opts.completedUnits,
    source_text: opts.sourceText,
    cycle_knowledge: opts.cycleKnowledge || null,
  });

  return await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api);
}

// ─── Confirmation ────────────────────────────────────────────────────────────

export type ConfirmationDecision = 'move_on' | 'continue_help' | 'unclear';

const CONFIRMATION_FALLBACK = `You classify the learner's response to a transition-confirmation question.
Return ONLY: { "decision": "move_on"|"continue_help"|"unclear", "rationale": "one sentence" }`;

/**
 * 전환 확인 판정.
 * 프롬프트가 "대화 기록·완료 유닛 요약·원문 전체를 주지 말라"고 명시하므로
 * 확인 질문과 최신 응답, 그리고 최소한의 유닛 메타데이터만 보낸다.
 */
export async function runConfirmation(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  confirmationQuestion: string,
  latestLearnerResponse: string,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<{ decision: ConfirmationDecision; rationale: string }> {
  const sysPrompt = prompts['prompt_confirmation']?.trim() || CONFIRMATION_FALLBACK;
  const u = unitOf(assessor, unit.item, unit.unit_role);
  const userInput = JSON.stringify({
    confirmation_question: confirmationQuestion,
    latest_learner_response: latestLearnerResponse,
    current_item: unit.item,
    current_unit_role: unit.unit_role,
    feedback_focus: u?.feedback_focus ?? null,
    current_evidence: u ? evidenceOf(assessor, unit.item, u.descriptor_key) : null,
  });

  const raw = await callLLMNode(prependSystem(prompts, sysPrompt), userInput, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { decision: 'unclear', rationale: 'parse error' };
  const p = JSON.parse(json);
  const decision: ConfirmationDecision =
    p.decision === 'move_on' || p.decision === 'continue_help' ? p.decision : 'unclear';
  return { decision, rationale: typeof p.rationale === 'string' ? p.rationale : '' };
}
