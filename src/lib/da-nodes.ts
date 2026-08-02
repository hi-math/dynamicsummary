// DA LLM 노드 — 턴마다 프롬프트 자산이 하나씩 대응한다.
//
//   판정 : runAnalysis(prompt_analysis) · runConfirmation(prompt_confirmation)
//   발화 : runOpening(prompt_opening) · runRecovery(prompt_recovery)
//          runMediation(prompt_mediation) · runProvision(prompt_provision)
//          runConfirmInvite(prompt_confirm_invite) · runPostConfirm(prompt_post_confirm)
//          runClosing(prompt_closing)
//   발화 턴에는 공통 말투(prompt_style)를 코드가 앞에 붙인다.
//
// 상태 전이·라우팅은 여기가 아니라 da-state.ts 가 담당한다.

import { callLLMNode } from './ai';
import type {
  APISettings,
  ActiveUnit,
  AssessorOutput,
  Classification,
  CompletedUnitSummary,
  GoalStatus,
} from '@/types';
import type { GoalVerdict, UsedPosition } from './da-state';
import { unitOf } from './da-state';
import {
  OUTPUT_ANALYSIS, OUTPUT_CONFIRMATION, OUTPUT_MEDIATION, OUTPUT_UTTERANCE, withOutputContract,
} from './da-output';
import { descriptorBlockFor, itemsFrom } from './descriptors';

/**
 * 현재 항목의 평가 기준(descriptor) 블록. 관리 화면의 '평가 기준' 탭이 원천이며,
 * 다른 항목의 기준을 끌어오지 않도록 활성 항목 하나만 붙인다.
 */
function itemCriteria(prompts: Record<string, string>, item: string): string {
  return descriptorBlockFor(itemsFrom(prompts), item);
}

// 현재 유닛의 대화. 발화·판정 프롬프트의 History input contract 형식.
export type UnitTurn = {
  speaker: 'mediator' | 'learner';
  step?: number;
  target?: string;
  text: string;
};

// 최근 12개까지만 보낸다 — 발화 프롬프트와 prompt_analysis 가 모두
// (`recent_tab_history`: up to 12 recent messages) 이 상한을 규정한다.
export const UNIT_HISTORY_LIMIT = 12;
export const trimHistory = (h: UnitTurn[]) => h.slice(-UNIT_HISTORY_LIMIT);

// Analysis 에 넘기는 중재 단계의 상한. 5단계는 terminal 이라 응답을 기다리지 않으므로
// 판정 입력으로 나타나지 않는다 (프롬프트도 `current_step`을 1~4 로 규정).
const MAX_ANALYSIS_STEP = 4;

/** 시스템 프롬프트 안에서 절을 나누는 구분자. */
const SECTION_SEP = '\n\n---\n\n';

/** 절들을 구분자로 이어 붙인다 (빈 절은 건너뛴다). */
function joinSections(...parts: (string | undefined | null)[]): string {
  return parts.filter((p): p is string => !!p?.trim()).join(SECTION_SEP);
}

function prependSystem(prompts: Record<string, string>, sysPrompt: string): string {
  const overview = prompts['prompt_system']?.trim();
  return overview ? `${overview}\n\n---\n\n${sysPrompt}` : sysPrompt;
}

/**
 * 발화 턴 전용 조립: 과제 개요 + 공통 말투 + 턴 프롬프트 + 출력 계약(평문).
 * 말투는 자산 하나(prompt_style)로 두고 코드가 붙인다 — 턴별로 복사하면 갈리기 때문이다.
 * 출력 계약도 코드 소유다 (da-output.ts). 판정 노드는 각자의 JSON 계약을 쓴다.
 */
function utterancePrompt(prompts: Record<string, string>, sysPrompt: string): string {
  const style = prompts['prompt_style']?.trim();
  const body = style ? `${style}\n\n---\n\n${sysPrompt}` : sysPrompt;
  return prependSystem(prompts, withOutputContract(body, OUTPUT_UTTERANCE));
}

/** 활성 유닛의 진단 정보 묶음 — 중재 발화 턴들이 공통으로 받는 부분. */
function unitContext(assessor: AssessorOutput | null, u: ActiveUnit) {
  const t = unitOf(assessor, u.item);
  return {
    current_tab: u.tab,
    current_item: u.item,
    problem_description: t?.problem_description ?? null,
    student_text_evidence: t?.student_text_evidence ?? null,
    selection_rationale: t?.selection_rationale ?? null,
    mediation_focus: t?.mediation_focus ?? null,
    mediation_goal: t
      ? { problem_identification: t.PI_goal, problem_solution_verbalization: t.PSV_goal }
      : null,
    // 발화 모드: 이번 턴에 다룰 목표. 프롬프트가 PI / PSV 로 분기하므로 그 리터럴로 보낸다.
    current_target: u.current_target === 'problem_identification' ? 'PI' : 'PSV',
    current_step: u.current_step,
    cumulative_pi: u.cumulative_pi,
    cumulative_psv: u.cumulative_psv,
  };
}

// ─── Analysis (턴 A — 판정) ──────────────────────────────────────────────────
//
// 입력 필드명·값은 prompt_analysis 의 `## Inputs` 절 규격을 그대로 따른다.
// 출력 일관성 규칙이 `current_target = PI` 같은 리터럴로 분기하므로,
// 코드 내부 표현(problem_identification 등)을 그대로 보내면 안 된다.

export type AnalysisContext = {
  sourceText: string;
  studentSummary: string;
  cycleKnowledge: string;
};

const ANALYSIS_FALLBACK = `You are the Analysis component in a Dynamic Assessment interaction.
Classify the learner's latest response (on_track / confusion / off_topic), then judge ONLY
the target named by current_target against its goal. Do not write a tutor utterance.`;

export async function runAnalysis(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  previousTutorUtterance: string,
  latestLearnerResponse: string,
  history: UnitTurn[],
  ctx: AnalysisContext,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<{ classification: Classification; verdict: GoalVerdict; rationale: string }> {
  const sysPrompt = prompts['prompt_analysis']?.trim() || ANALYSIS_FALLBACK;
  const t = unitOf(assessor, unit.item);
  const userInput = JSON.stringify({
    // 현재 selected item — selection_rationale 은 보내지 않는다
    // (프롬프트가 "있다고 가정하지 말라"고 명시).
    item: unit.item,
    problem_description: t?.problem_description ?? null,
    student_text_evidence: t?.student_text_evidence ?? null,
    mediation_focus: t?.mediation_focus ?? null,
    PI_goal: t?.PI_goal ?? null,
    PSV_goal: t?.PSV_goal ?? null,

    // 현재 상태. 단계는 1~4 로 보낸다 (5 는 terminal 이라 판정 대상이 되지 않는다).
    current_step: Math.min(unit.current_step, MAX_ANALYSIS_STEP),
    current_target: unit.current_target === 'problem_identification' ? 'PI' : 'PSV',
    PI_cum: unit.cumulative_pi,
    PSV_cum: unit.cumulative_psv,

    // 상호작용 맥락. 대화 기록은 이 탭의 최근 12개까지 (프롬프트 규정 상한).
    previous_tutor_utterance: previousTutorUtterance,
    latest_learner_response: latestLearnerResponse,
    recent_tab_history: trimHistory(history),

    // 참고자료 — 학습자가 표현한 이해의 정확성을 확인하는 용도.
    SOURCE_TEXT: ctx.sourceText,
    STUDENT_SUMMARY: ctx.studentSummary,
    knowledge_cycle: ctx.cycleKnowledge || null,
  });

  // 현재 항목의 평가 기준을 함께 붙인다 (관리 화면 '평가 기준' 탭이 원천).
  const body = joinSections(sysPrompt, itemCriteria(prompts, unit.item));
  const raw = await callLLMNode(
    prependSystem(prompts, withOutputContract(body, OUTPUT_ANALYSIS)), userInput, api,
  );
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return { classification: 'on_track', verdict: { turn_pi: null, turn_psv: null }, rationale: 'parse error' };
  }
  const p = JSON.parse(json);
  const classification: Classification =
    p.classification === 'confusion' || p.classification === 'off_topic' ? p.classification : 'on_track';
  // 계약을 코드가 다시 강제한다: 판정은 한 턴에 하나뿐이며,
  // 비활성 목표와 비-on_track 은 언제나 null 이다.
  const onTrack = classification === 'on_track';
  const targetIsPI = unit.current_target === 'problem_identification';
  const norm = (v: unknown): GoalStatus | null =>
    v === 'absent' || v === 'partial' || v === 'sufficient' ? v : null;
  return {
    classification,
    verdict: {
      turn_pi: onTrack && targetIsPI ? norm(p.turn_pi) : null,
      turn_psv: onTrack && !targetIsPI ? norm(p.turn_psv) : null,
    },
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
  };
}

// ─── Opening ─────────────────────────────────────────────────────────────────
// 탭의 첫 발화. 진단·요약문·지문·지식자료를 주지 않는다 —
// 오프닝 규칙 자체가 "문제를 드러내지 말 것 / 근거를 인용하지 말 것"이므로
// 줄 이유가 없고, 주지 않으면 새어 나갈 것도 없다.

const OPENING_FALLBACK = `You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
Produce the FIRST tutor utterance of a task tab, before interactive mediation begins.
You are given only the current item key — do not reveal or imply any specific problem
in the learner's writing, and do not begin step-by-step questioning.
Briefly introduce what will be reviewed and end with one short question inviting the
learner to look at that aspect together.`;

// 과업이 요구하는 분량. 140 이상 200 미만이 기준 범위다.
export const SUMMARY_WORD_MIN = 140;
export const SUMMARY_WORD_MAX = 200;

export function countSummaryWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export type WordCountStatus = 'in_range' | 'too_short' | 'too_long';

export function wordCountStatus(wc: number): WordCountStatus {
  if (wc < SUMMARY_WORD_MIN) return 'too_short';
  if (wc >= SUMMARY_WORD_MAX) return 'too_long';
  return 'in_range';
}

// 첫 탭 오프닝에만 붙는 분량 안내. 기준 범위를 벗어났을 때만 사용한다.
const WORD_COUNT_FALLBACK = `[분량 안내 — 이 지시는 첫 탭 오프닝에만 적용된다]
기준 word count 는 140 이상 200 미만이고, 학생은 {word_count}단어로 작성하였다.
오프닝 발화의 마지막에 아래 문장을 그대로 한 문장 덧붙인다. 다른 분량 언급은 하지 않는다.

1. 기준보다 짧은 경우({status} == too_short):
현재 요약문은 {word_count}단어로, 과업 기준인 140–200단어보다 짧아요. 오늘 확인할 내용을 반영해 수정할 때 분량 기준도 함께 맞춰 주세요.

2. 기준보다 긴 경우({status} == too_long):
현재 요약문은 {word_count}단어로, 과업 기준인 140–200단어보다 길어요. 수정할 때 핵심 의미를 유지하면서 분량 기준도 함께 맞춰 주세요.`;

/**
 * 분량 안내 절. 기준 범위 안이거나 요약문이 비어 있으면 null —
 * 이 경우 오프닝 프롬프트에 분량 이야기가 아예 들어가지 않는다.
 */
function wordCountSection(prompts: Record<string, string>, wc: number): string | null {
  const status = wordCountStatus(wc);
  if (wc === 0 || status === 'in_range') return null;
  const asset = prompts['prompt_word_count']?.trim() || WORD_COUNT_FALLBACK;
  return asset
    .replace(/\{word_count\}/g, String(wc))
    .replace(/\{status\}/g, status);
}

export async function runOpening(
  unit: ActiveUnit,
  totalTabs: number,
  prompts: Record<string, string>,
  api: APISettings,
  // 첫 탭에서만 넘어온다. 넘어온 경우에만 분량 안내를 붙인다.
  studentSummary?: string,
): Promise<string> {
  const sysPrompt = prompts['prompt_opening']?.trim() || OPENING_FALLBACK;
  const wc = studentSummary === undefined ? null : countSummaryWords(studentSummary);
  const wcSection = wc === null ? null : wordCountSection(prompts, wc);
  const userInput = JSON.stringify({
    current_item: unit.item,
    current_tab: unit.tab,
    total_tabs: totalTabs,
    ...(wcSection
      ? { word_count: wc, word_count_status: wordCountStatus(wc as number) }
      : {}),
  });
  const body = joinSections(sysPrompt, wcSection);
  return await callLLMNode(utterancePrompt(prompts, body), userInput, api);
}

// ─── Recovery (confusion / off_topic) ────────────────────────────────────────
// 두 모드를 한 노드에서 처리하고, prompt_recovery 안에서 `mode` 로 지시문을 가른다.
// 진단·요약문·지문·가이던스는 주지 않는다 — 프롬프트가 "새 힌트를 추가하지 말 것,
// 직전 발화보다 더 많은 근거를 드러내지 말 것"을 요구하므로 줄 이유가 없다.

export type RecoveryMode = 'confusion' | 'off_topic';

const RECOVERY_FALLBACK = `You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
The learner's latest response did not advance the mediation. Produce ONE tutor utterance.

- mode "confusion": rephrase the preceding tutor utterance in easier, shorter Korean and
  end with the same question. Do not add a new hint and do not answer it for the learner.
- mode "off_topic": answer briefly if trivial (or defer it), then return to the preceding
  mediation question without restarting it. Do not criticize the learner.

Keep the same active target and the same explicitness level. Do not repeat a rephrasing
you already used in this tab.`;

export async function runRecovery(
  unit: ActiveUnit,
  mode: RecoveryMode,
  previousTutorUtterance: string,
  latestLearnerResponse: string,
  history: UnitTurn[],
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  const sysPrompt = prompts['prompt_recovery']?.trim() || RECOVERY_FALLBACK;
  const userInput = JSON.stringify({
    mode,
    item: unit.item,
    current_step: Math.min(unit.current_step, MAX_ANALYSIS_STEP),
    current_target: unit.current_target === 'problem_identification' ? 'PI' : 'PSV',
    previous_tutor_utterance: previousTutorUtterance,
    latest_learner_response: latestLearnerResponse,
    recent_tab_history: trimHistory(history),
  });
  return await callLLMNode(utterancePrompt(prompts, sysPrompt), userInput, api);
}

// ─── 중재 발화 4종 ───────────────────────────────────────────────────────────
// 턴마다 프롬프트가 다르다. 입력 payload 는 아직 공통(unitContext + 맥락)이며,
// 턴별 입력 정리는 각 턴을 정의하면서 순차로 진행한다.

export type MediationContext = {
  latestLearnerResponse?: string;
  history: UnitTurn[];
  completedUnits: CompletedUnitSummary[];
  totalTabs: number;
  sourceText: string;
  studentSummary: string;
  cycleKnowledge: string;
};

const MEDIATION_FALLBACK = `You are a Dynamic Assessment tutor for EFL summary writing.
Produce ONE learner-facing tutor utterance in polite, natural Korean.
Follow the supplied current_step and current_target exactly.`;

/**
 * 발화 노드 공통 조립 — 턴 프롬프트 + 현재 항목의 평가 기준.
 * 항목별 교수 자료는 각 턴 프롬프트 본문으로 옮기는 중이라 코드가 따로 붙이지 않는다.
 */
async function runUtterance(
  assetKey: string,
  fallback: string,
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  ctx: MediationContext,
  extra: Record<string, unknown>,
  prompts: Record<string, string>,
  api: APISettings,
  withItemCriteria = true,
): Promise<string> {
  const base = prompts[assetKey]?.trim() || fallback;
  // 항목에 매인 턴에는 현재 항목의 평가 기준을 붙인다.
  const sysPrompt = withItemCriteria
    ? joinSections(base, itemCriteria(prompts, unit.item))
    : base;

  return await callLLMNode(
    utterancePrompt(prompts, sysPrompt),
    mediationInput(assessor, unit, ctx, extra),
    api,
  );
}

/** 중재 계열 턴이 공유하는 user 입력. */
function mediationInput(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  ctx: MediationContext,
  extra: Record<string, unknown>,
): string {
  return JSON.stringify({
    ...unitContext(assessor, unit),
    total_tabs: ctx.totalTabs,
    latest_learner_response: ctx.latestLearnerResponse ?? null,
    current_unit_history: trimHistory(ctx.history),
    completed_unit_summaries: ctx.completedUnits,
    source_text: ctx.sourceText,
    student_summary: ctx.studentSummary,
    cycle_knowledge: ctx.cycleKnowledge || null,
    ...extra,
  });
}

/**
 * 턴 5 — 통상 중재 step 1~4.
 * 판정은 Analysis 가 이미 끝냈고 코드가 목표·단계를 확정한 뒤 부른다.
 * 이 턴은 확정된 자리에서 발화만 만들고, 자기가 쓴 목표·단계를 함께 신고한다.
 */
export async function runMediation(
  assessor: AssessorOutput | null,
  unit: ActiveUnit,
  ctx: MediationContext,
  latestVerdict: { turn_pi: GoalStatus | null; turn_psv: GoalStatus | null; rationale: string },
  prompts: Record<string, string>,
  api: APISettings,
): Promise<{
  utterance: string | null;
  /** 모델이 실제로 쓴 목표·단계. 코드 계산과 어긋나면 이쪽을 정본으로 삼는다. */
  used: UsedPosition | null;
}> {
  const base = prompts['prompt_mediation']?.trim() || MEDIATION_FALLBACK;
  const sysPrompt = joinSections(base, itemCriteria(prompts, unit.item));
  const userInput = mediationInput(assessor, unit, ctx, {
    latest_verdict: {
      turn_pi: latestVerdict.turn_pi,
      turn_psv: latestVerdict.turn_psv,
      rationale: latestVerdict.rationale || null,
    },
  });

  const raw = await callLLMNode(
    // 평문 계약이 아니라 '발화 + 쓴 자리 신고' 계약을 쓴다.
    prependSystem(
      prompts,
      withOutputContract(
        joinSections(prompts['prompt_style']?.trim(), sysPrompt),
        OUTPUT_MEDIATION,
      ),
    ),
    userInput, api,
  );

  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  // JSON 이 아니면 응답 전체를 발화로 쓴다 (학생에게 빈 화면을 주지 않는다).
  if (!json) return { utterance: raw.trim() || null, used: null };
  const p = JSON.parse(json);
  return {
    utterance: typeof p.utterance === 'string' && p.utterance.trim() ? p.utterance.trim() : null,
    used: readUsedPosition(p),
  };
}

/** 모델이 신고한 목표·단계. 값이 규격을 벗어나면 무시한다. */
function readUsedPosition(p: Record<string, unknown>): UsedPosition | null {
  const target =
    p.used_target === 'PI' ? 'problem_identification'
    : p.used_target === 'PSV' ? 'problem_solution_verbalization'
    : null;
  const step = Number(p.used_step);
  const validStep = Number.isInteger(step) && step >= 1 && step <= MAX_ANALYSIS_STEP;
  if (!target || !validStep) return null;
  return { target, step: step as UsedPosition['step'] };
}

/** 턴 6 — step 5 명시적 제공. 응답을 기다리지 않고 유닛이 닫힌다. */
export function runProvision(
  assessor: AssessorOutput | null, unit: ActiveUnit, ctx: MediationContext,
  prompts: Record<string, string>, api: APISettings,
): Promise<string> {
  return runUtterance(
    'prompt_provision',
    `${MEDIATION_FALLBACK}
This is the terminal step: provide the answer directly and do not ask a question.`,
    assessor, unit, ctx, {}, prompts, api,
  );
}

/** 턴 7 — 전환 확인 질문. PI·PSV 가 모두 충족된 뒤 유닛을 마무리하며 묻는다. */
export function runConfirmInvite(
  assessor: AssessorOutput | null, unit: ActiveUnit, ctx: MediationContext,
  prompts: Record<string, string>, api: APISettings,
): Promise<string> {
  return runUtterance(
    'prompt_confirm_invite',
    `${MEDIATION_FALLBACK}
Recap the solution principle in one sentence, then ask whether the learner is ready to move on.`,
    assessor, unit, ctx, {}, prompts, api, false,
  );
}

/** 턴 9 — 전환 시점에 학생이 더 요청했을 때의 직접 설명 1회. 이후 유닛이 닫힌다. */
export function runPostConfirm(
  assessor: AssessorOutput | null, unit: ActiveUnit, ctx: MediationContext,
  prompts: Record<string, string>, api: APISettings,
): Promise<string> {
  return runUtterance(
    'prompt_post_confirm',
    `${MEDIATION_FALLBACK}
Answer the learner's question directly, then end the unit. Do not ask another question.`,
    assessor, unit, ctx, {}, prompts, api,
  );
}

/** 턴 10 — 세션 종료 안내. 세션의 마지막 발화이며 질문으로 끝내지 않는다. */
export function runClosing(
  assessor: AssessorOutput | null, unit: ActiveUnit, ctx: MediationContext,
  prompts: Record<string, string>, api: APISettings,
): Promise<string> {
  return runUtterance(
    'prompt_closing',
    `${MEDIATION_FALLBACK}
Summarize what the session covered and close it. Do not ask a question.`,
    assessor, unit, ctx, {}, prompts, api, false,
  );
}

// ─── Confirmation ────────────────────────────────────────────────────────────

export type ConfirmationDecision = 'move_on' | 'continue_help' | 'unclear';

const CONFIRMATION_FALLBACK = `You classify the learner's response to a transition-confirmation
question. Judge transition intent only — not the learner's understanding.`;

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
  const u = unitOf(assessor, unit.item);
  const userInput = JSON.stringify({
    confirmation_question: confirmationQuestion,
    latest_learner_response: latestLearnerResponse,
    current_item: unit.item,
    mediation_focus: u?.mediation_focus ?? null,
    problem_description: u?.problem_description ?? null,
    student_text_evidence: u?.student_text_evidence ?? null,
  });

  const raw = await callLLMNode(
    prependSystem(prompts, withOutputContract(sysPrompt, OUTPUT_CONFIRMATION)), userInput, api,
  );
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { decision: 'unclear', rationale: 'parse error' };
  const p = JSON.parse(json);
  const decision: ConfirmationDecision =
    p.decision === 'move_on' || p.decision === 'continue_help' ? p.decision : 'unclear';
  return { decision, rationale: typeof p.rationale === 'string' ? p.rationale : '' };
}
