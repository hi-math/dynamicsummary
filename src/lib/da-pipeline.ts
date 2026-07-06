import { callLLMNode } from './ai';
import { PRIORITY_CONFIG } from './priority-config';
import type {
  APISettings,
  AssessorOutput,
  DASessionState,
  TurnResult,
  Classification,
  DiagnosisConfidence,
} from '@/types';
import descriptorsData from '@/data/descriptors.json';

// ─── Descriptor prompt block ──────────────────────────────────────────────────

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

// ─── Priority queue calculation ───────────────────────────────────────────────

export function calculatePriorityQueue(assessorOutput: AssessorOutput): string[] {
  if (!assessorOutput?.items) return [];
  const cfg = PRIORITY_CONFIG;

  const scores = Object.entries(assessorOutput.items).map(([key, item]) => {
    let multiplier = cfg.groupMultipliers[key] ?? 1.0;
    if (key === 'language_use' && item.affects_meaning) multiplier = 2.0;

    const score = item.detected_descriptors.reduce(
      (sum, d) => sum + (cfg.severityWeights[d.severity] ?? 1),
      0,
    ) * multiplier;

    return { key, score };
  });

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aIdx = cfg.tieBreakOrder.indexOf(a.key);
    const bIdx = cfg.tieBreakOrder.indexOf(b.key);
    return (aIdx < 0 ? 999 : aIdx) - (bIdx < 0 ? 999 : bIdx);
  });

  return scores
    .filter((s) => s.score > 0)
    .slice(0, 3)
    .map((s) => s.key);
}

// ─── Initial state factory ────────────────────────────────────────────────────

export function createInitialState(): DASessionState {
  return {
    priority_queue: [],
    current_item_idx: 0,
    current_step: 1,
    item_identification_cumulative: false,
    item_verbalization_cumulative: false,
    item_resolution_pending: false,
    resolutions: {},
    session_complete: false,
    diagnosis_confidence: null,
    assessor_output: null,
  };
}

export function resetItemState(state: DASessionState): DASessionState {
  return {
    ...state,
    current_step: 1,
    item_identification_cumulative: false,
    item_verbalization_cumulative: false,
    item_resolution_pending: false,
  };
}

// ─── Assessor ─────────────────────────────────────────────────────────────────

export async function runAssessor(
  summary: string,
  passageContent: string,
  systemPrompt: string,
  api: APISettings,
): Promise<AssessorOutput> {
  const descriptorBlock = buildDescriptorBlock();

  const sysPrompt = systemPrompt || `You are an Assessor in a Dynamic Assessment tutoring system for EFL summary writing.
Diagnose the student's summary against the 6 evaluation areas and 19 descriptors listed below.

CRITICAL: Your entire response must be a single JSON object whose FIRST and ONLY top-level key is "items".
Do NOT place item keys at the top level. Always wrap them inside "items".

For each item, include:
- score: integer 1-5 (1=very poor, 5=excellent)
- detected_descriptors: array of descriptors that apply (empty array [] if none)
- score_rationale: 1-2 sentence explanation of why this score was given
- feedback_focus: the exact sentence or phrase in the student text that is most problematic
- judgment_evidence: specific evidence from the passage showing what the student missed or got wrong
- affects_meaning: true/false (language_use item only)

Respond ONLY with valid JSON:
{
  "items": {
    "<item_key>": {
      "score": 3,
      "detected_descriptors": [{ "key": "...", "severity": "high|medium|low", "evidence": { "problem_location": "...", "evidence_text": "...", "missing_content": "..." } }],
      "score_rationale": "...",
      "feedback_focus": "...",
      "judgment_evidence": "...",
      "affects_meaning": true
    }
  }
}

## Descriptor Reference
${descriptorBlock}`;

  const userInput = `[PASSAGE]\n${passageContent}\n\n[STUDENT SUMMARY]\n${summary}`;

  const raw = await callLLMNode(sysPrompt, userInput, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`Assessor returned non-JSON output: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(json);
  // Normalise: some models return items at top level instead of nested under "items"
  if (!parsed?.items) {
    const ITEM_KEYS = new Set(['main_idea_coverage','condensation','content_accuracy','paraphrasing','organization','language_use']);
    const topKeys = Object.keys(parsed ?? {});
    if (topKeys.some((k) => ITEM_KEYS.has(k))) {
      return { items: parsed } as AssessorOutput;
    }
    throw new Error(`Assessor output missing "items" field. Got keys: ${topKeys.join(', ') || '(none)'}`);
  }
  return parsed as AssessorOutput;
}

// ─── Assessor Verifier ────────────────────────────────────────────────────────

type VerifierResult = {
  pass: boolean;
  notes: string;
};

export async function runAssessorVerifier(
  assessorOutput: AssessorOutput,
  summary: string,
  passageContent: string,
  systemPrompt: string,
  api: APISettings,
  previousNotes?: string,
): Promise<VerifierResult> {
  const sysPrompt = systemPrompt || `You are an Assessor Verifier (LLM-as-a-judge) in a DA tutoring system.
Review the Assessor's diagnosis for:
1. Evidence validity — does each detected descriptor have clear, specific textual evidence?
2. Item selection appropriateness — are the selected items truly present in the student's text?
3. Priority justification — are high-severity ratings warranted?

Respond ONLY with valid JSON:
{ "pass": true|false, "notes": "brief explanation of issues (if fail) or confirmation (if pass)" }`;

  const userInput = `[PASSAGE]\n${passageContent}\n\n[STUDENT SUMMARY]\n${summary}\n\n[ASSESSOR OUTPUT]\n${JSON.stringify(assessorOutput, null, 2)}${previousNotes ? `\n\n[PREVIOUS VERIFICATION NOTES]\n${previousNotes}` : ''}`;

  const raw = await callLLMNode(sysPrompt, userInput, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { pass: true, notes: 'parse error — defaulting to pass' };
  return JSON.parse(json) as VerifierResult;
}

// ─── Session initialization: Assessor → Verifier (max 2) → Priority ──────────

function buildInitState(finalOutput: AssessorOutput, confidence: DiagnosisConfidence): DASessionState {
  return {
    priority_queue: calculatePriorityQueue(finalOutput),
    current_item_idx: 0,
    current_step: 1,
    item_identification_cumulative: false,
    item_verbalization_cumulative: false,
    item_resolution_pending: false,
    resolutions: {},
    session_complete: false,
    diagnosis_confidence: confidence,
    assessor_output: finalOutput,
  };
}

export async function initDASession(
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<{
  state: DASessionState;
  assessorOutputsAll: AssessorOutput[];
  verifierNotesAll: string[];
  confidence: DiagnosisConfidence;
  openingUtterance: string;
}> {
  const assessorOutputsAll: AssessorOutput[] = [];
  const verifierNotesAll: string[] = [];

  // 1st Assessor
  const assessor1 = await runAssessor(summary, passageContent, prompts['prompt_assessor'] ?? '', api);
  assessorOutputsAll.push(assessor1);

  // Speculatively generate the opening message from assessor1 IN PARALLEL with the
  // verifier. On the common high-confidence path (verifier passes) assessor1 is the
  // final diagnosis, so the opening is already valid and its latency is fully hidden
  // behind the verifier call. Errors are swallowed → we regenerate below if needed.
  const speculativeState = buildInitState(assessor1, 'high');
  const openingPromise = generateOpeningMessage(speculativeState, prompts, api).catch(() => null);

  // 1st Verifier (runs concurrently with the speculative opening above)
  const verifier1 = await runAssessorVerifier(assessor1, summary, passageContent, prompts['prompt_assessor_verifier'] ?? '', api);
  verifierNotesAll.push(verifier1.notes);

  let finalOutput: AssessorOutput;
  let confidence: DiagnosisConfidence;

  if (verifier1.pass) {
    finalOutput = assessor1;
    confidence = 'high';
  } else {
    // 2nd Assessor (with verifier notes as extra context)
    const assessor2 = await runAssessor(summary + `\n\n[Verifier notes: ${verifier1.notes}]`, passageContent, prompts['prompt_assessor'] ?? '', api);
    assessorOutputsAll.push(assessor2);

    // 2nd Verifier
    const verifier2 = await runAssessorVerifier(assessor2, summary, passageContent, prompts['prompt_assessor_verifier'] ?? '', api, verifier1.notes);
    verifierNotesAll.push(verifier2.notes);

    if (verifier2.pass) {
      finalOutput = assessor2;
      confidence = 'medium';
    } else {
      // 2-fail fallback: adopt 1st output
      finalOutput = assessor1;
      confidence = 'low';
    }
  }

  const state = buildInitState(finalOutput, confidence);

  // Reuse the speculative opening when the final priority queue matches the one it was
  // generated from (i.e. finalOutput === assessor1); otherwise regenerate for assessor2.
  const speculativeOpening = await openingPromise;
  const openingUtterance = (finalOutput === assessor1 && speculativeOpening)
    ? speculativeOpening
    : await generateOpeningMessage(state, prompts, api);

  return { state, assessorOutputsAll, verifierNotesAll, confidence, openingUtterance };
}

// ─── One-turn pipeline ────────────────────────────────────────────────────────

// Combined Classifier + Evaluator (single LLM call).
// Merging the two judgment nodes halves the common on_track turn latency
// (previously Classifier → Evaluator → Mediator = 3 serial calls; now 2).
type AnalysisResult = {
  classification: Classification;
  identification_success: boolean;
  remedial_verbalization_success: boolean;
};

async function runAnalysis(
  studentMessage: string,
  currentItem: string,
  state: DASessionState,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<AnalysisResult> {
  const sysPrompt = prompts['prompt_analysis'] || `You are the analysis node in a DA tutoring pipeline. In ONE pass you do two jobs:

(1) CLASSIFY the student's response into exactly one of:
- "on_track": attempts to address the current writing problem (even partially)
- "confusion": explicit signal of not knowing (e.g., "I don't know", "I'm not sure what to do")
- "off_topic": unrelated to the current tutoring flow

(2) EVALUATE two boolean conditions (only meaningful when classification is "on_track"):
- identification_success: Did the student identify their own writing problem in their own words?
- remedial_verbalization_success: Did the student verbalize HOW to fix the problem in their own words?

Cumulative rules for (2):
- If identification_already_true=true, set identification_success=true unconditionally (do not re-judge).
- If verbalization_already_true=true, set remedial_verbalization_success=true unconditionally.
- Only judge conditions still false. If classification is not "on_track", keep any already-true flags but do not newly grant either condition.

Respond ONLY with valid JSON:
{ "classification": "on_track"|"confusion"|"off_topic", "identification_success": true|false, "remedial_verbalization_success": true|false }`;

  const userInput = JSON.stringify({
    current_item: currentItem,
    current_step: state.current_step,
    student_message: studentMessage,
    identification_already_true: state.item_identification_cumulative,
    verbalization_already_true: state.item_verbalization_cumulative,
    assessor_evidence: state.assessor_output?.items[currentItem] ?? null,
  });

  const raw = await callLLMNode(sysPrompt, userInput, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return { classification: 'on_track', identification_success: false, remedial_verbalization_success: false };
  }
  const parsed = JSON.parse(json);
  return {
    classification: (parsed.classification ?? 'on_track') as Classification,
    identification_success: parsed.identification_success === true,
    remedial_verbalization_success: parsed.remedial_verbalization_success === true,
  };
}

async function runReexplainer(
  studentMessage: string,
  currentItem: string,
  state: DASessionState,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  const sysPrompt = prompts['prompt_reexplainer'] || `You are a Reexplainer in a DA tutoring pipeline.
The student has shown confusion about the current writing problem.
Generate a brief re-explanation guidance (1-2 sentences) that the Mediator can use to re-explain the problem from a different angle.
Respond ONLY with a plain text explanation guidance (no JSON).`;

  const userInput = JSON.stringify({
    current_item: currentItem,
    current_step: state.current_step,
    student_message: studentMessage,
    assessor_evidence: state.assessor_output?.items[currentItem] ?? null,
  });

  return await callLLMNode(sysPrompt, userInput, api);
}

async function runDeflector(
  studentMessage: string,
  currentItem: string,
  state: DASessionState,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  const sysPrompt = prompts['prompt_deflector'] || `You are a Deflector in a DA tutoring pipeline.
The student's message is off-topic. Handle one of three cases:
1. Completely irrelevant: redirect politely back to the task.
2. Mentions another item in priority_queue: acknowledge briefly, redirect to current item.
3. Mentions out-of-scope writing issue: acknowledge, explain scope, redirect.
Generate a brief tutor response (1-2 sentences). Respond with plain text only (no JSON).`;

  const userInput = JSON.stringify({
    current_item: currentItem,
    priority_queue: state.priority_queue,
    student_message: studentMessage,
  });

  return await callLLMNode(sysPrompt, userInput, api);
}

async function runMediator(
  studentMessage: string,
  currentItem: string,
  state: DASessionState,
  prompts: Record<string, string>,
  api: APISettings,
  mode: 'normal' | 'resolution' | 'reexplain' | 'closing' | 'opening',
  evalResult?: { identification_success: boolean; remedial_verbalization_success: boolean },
  reexplainerGuidance?: string,
): Promise<string> {
  // B-5: Mediator system prompt = mediator_common + item + knowledge_common + knowledge_item
  const itemKey = currentItem;
  const systemParts = [
    prompts['prompt_mediator_common'] || '',
    prompts[`prompt_${itemKey}`] || '',
    prompts['knowledge_common'] || '',
    prompts[`knowledge_${itemKey}`] || '',
  ].filter(Boolean).join('\n\n---\n\n');

  const sysPrompt = systemParts || `You are a DA tutor. Generate a natural, encouraging tutor utterance (1-3 sentences).
- mode "opening": generate a warm, casual opening question that introduces the item topic lightly — like "이번에는 [item topic]에 대해 같이 살펴볼까요?" — do not sound clinical or evaluative.
- mode "normal": continue scaffolding the student toward identifying/verbalizing the problem.
- mode "resolution": celebrate resolution, ask if student has questions before moving on.
- mode "reexplain": re-explain the problem from a different angle using the provided guidance.
- mode "closing": deliver final closing comment and guide student to click next tab or finish.
Maintain a single, consistent tutor persona. Do NOT reveal internal node decisions.`;

  const userInput = JSON.stringify({
    current_item: itemKey,
    current_step: state.current_step,
    mode,
    student_message: studentMessage,
    assessor_evidence: state.assessor_output?.items[itemKey] ?? null,
    eval_result: evalResult ?? null,
    reexplainer_guidance: reexplainerGuidance ?? null,
    resolution_status: state.resolutions,
    tabs_remaining: state.priority_queue.length - 1 - state.current_item_idx,
  });

  return await callLLMNode(sysPrompt, userInput, api);
}

// ─── Confirmation classifier (used when item_resolution_pending = true) ──────

async function runConfirmationClassifier(
  studentMessage: string,
  api: APISettings,
): Promise<boolean> {
  const sysPrompt = `You are a classifier. The tutor just asked the student if they want to move on to the next task.
Determine if the student's response is a CONFIRMATION (positive/agreeable) or NOT.
Respond ONLY with valid JSON: { "confirming": true | false }
Confirming examples: "네", "응", "갑시다", "넘어가요", "그래요", "알겠어요", "yes", "sure", "okay", "ok", "넘어가겠습니다"
NOT confirming examples: "아니요", "잠깐만요", "궁금한 게 있어요", "no", "wait"`;

  const raw = await callLLMNode(sysPrompt, studentMessage, api);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return false;
  try { return JSON.parse(json).confirming === true; } catch { return false; }
}

// ─── Main one-turn entry point ────────────────────────────────────────────────

export async function processTurn(
  state: DASessionState,
  studentMessage: string,
  summary: string,
  passageContent: string,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<TurnResult> {
  const currentItem = state.priority_queue[state.current_item_idx];
  if (!currentItem) {
    return {
      utterance: '세션이 종료되었습니다.',
      updated_state: { ...state, session_complete: true },
      resolution_achieved: false,
      tab_unlocked: false,
      session_complete: true,
      classification: 'on_track',
    };
  }

  let updatedState = { ...state };
  let utterance: string;

  // ── Resolution pending: student is responding to "다음 탭으로 넘어가볼까요?" ──
  if (state.item_resolution_pending) {
    const confirming = await runConfirmationClassifier(studentMessage, api);
    if (confirming) {
      // Student confirmed → complete the item
      updatedState.item_resolution_pending = false;
      updatedState.resolutions = { ...updatedState.resolutions, [currentItem]: true };
      const allDone = updatedState.priority_queue.every((k) => updatedState.resolutions[k]);
      updatedState.session_complete = allDone;
      utterance = await runMediator(studentMessage, currentItem, updatedState, prompts, api, 'closing');
      return {
        utterance,
        updated_state: updatedState,
        resolution_achieved: true,
        tab_unlocked: !allDone,
        session_complete: allDone,
        classification: 'on_track',
      };
    } else {
      // Student has more to discuss → clear pending, continue normal flow
      updatedState.item_resolution_pending = false;
      utterance = await runMediator(studentMessage, currentItem, updatedState, prompts, api, 'normal');
      return { utterance, updated_state: updatedState, resolution_achieved: false, tab_unlocked: false, session_complete: false, classification: 'on_track' };
    }
  }

  // [코드] Analysis 호출 (Classifier + Evaluator 병합)
  const analysis = await runAnalysis(studentMessage, currentItem, state, prompts, api);
  const classification = analysis.classification;

  if (classification === 'on_track') {
    const evalResult = {
      identification_success: analysis.identification_success,
      remedial_verbalization_success: analysis.remedial_verbalization_success,
    };

    // [코드] 누적 필드 갱신
    if (evalResult.identification_success) updatedState.item_identification_cumulative = true;
    if (evalResult.remedial_verbalization_success) updatedState.item_verbalization_cumulative = true;

    const resolved = updatedState.item_identification_cumulative && updatedState.item_verbalization_cumulative;

    if (!resolved) updatedState.current_step += 1;

    if (resolved) {
      // Conditions met → ask student if they want to move on (do NOT complete yet)
      updatedState.item_resolution_pending = true;
      utterance = await runMediator(studentMessage, currentItem, updatedState, prompts, api, 'resolution', evalResult);
      return {
        utterance,
        updated_state: updatedState,
        resolution_achieved: false,
        tab_unlocked: false,
        session_complete: false,
        classification,
      };
    }

    // [코드] Mediator 호출 (normal)
    utterance = await runMediator(studentMessage, currentItem, updatedState, prompts, api, 'normal', evalResult);

  } else if (classification === 'confusion') {
    // [코드] Reexplainer 호출
    const guidance = await runReexplainer(studentMessage, currentItem, updatedState, prompts, api);
    updatedState.current_step += 1;
    utterance = await runMediator(studentMessage, currentItem, updatedState, prompts, api, 'reexplain', undefined, guidance);

  } else {
    // off_topic → Deflector
    utterance = await runDeflector(studentMessage, currentItem, updatedState, prompts, api);
  }

  return { utterance, updated_state: updatedState, resolution_achieved: false, tab_unlocked: false, session_complete: false, classification };
}

// ─── Opening message (called immediately after session init) ─────────────────

export async function generateOpeningMessage(
  state: DASessionState,
  prompts: Record<string, string>,
  api: APISettings,
): Promise<string> {
  const currentItem = state.priority_queue[state.current_item_idx];
  if (!currentItem) return '평가 세션을 시작합니다.';
  return runMediator('[SESSION_OPENED]', currentItem, state, prompts, api, 'opening');
}

// ─── Tab advance (called when student clicks next tab) ────────────────────────

export function advanceToNextItem(state: DASessionState): DASessionState {
  const next = state.current_item_idx + 1;
  return resetItemState({ ...state, current_item_idx: next });
}
