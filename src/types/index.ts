export type { Phase } from '@/lib/phases';
export type Role = 'admin' | 'mentor' | 'student';
export type Team = 'chatbot' | 'human';
export type Provider = 'openai' | 'anthropic' | 'gemini';

export type User = {
  id: string;
  name: string;
  role: Role;
  team: Team | null;
  mentor_id: string | null;
  current_phase: string;
  sort_order?: number | null;   // manual display order in the admin account list
  data_trashed?: boolean;       // soft-delete flag for the admin data view (true = in trash)
  created_at?: string;
};

export type APISettings = {
  id: number;
  provider: Provider;
  openai_key: string;
  openai_model: string;
  anthropic_key: string;
  anthropic_model: string;
  gemini_key: string;
  gemini_model: string;
};

// 레거시 `prompts` 테이블. 현재 파이프라인은 prompt_assets 만 쓴다 (관리 화면에서도 제거됨).
export type Prompts = {
  id: number;
  system_prompt: string;
  da_prompt: string;
};

// Assessor 참조자료(모범 요약문·IU 표·중요도·연구자 노트)는 지문 컬럼이 아니라
// knowledge_<cycle> 프롬프트 자산 안에 있다 — 지문 관리 탭에서 편집한다.
export type Passage = {
  cycle_key: string;
  title: string;
  content: string;
};

export type SessionData = {
  student_id: string;
  phase: string;
  summary: string | null;
  notes: string | null;
  submitted_at: string | null;
  learning_completed?: boolean;
  updated_at?: string;
};

export type AIMessage = {
  id: string;
  student_id: string;
  phase: string;
  role: 'user' | 'assistant';
  content: string;
  item_idx: number;   // which DA task (priority_queue index) this message belongs to
  created_at: string;
};

export type HumanMessage = {
  id: string;
  student_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type SessionCookie = {
  id: string;
  role: Role;
  team: Team | null;
  name: string;
};

// ─── Comprehension ────────────────────────────────────────────────────────────

export type QuestionType = 'mc' | 'sa';

export type ComprehensionQuestion = {
  id: string;
  type: QuestionType;
  stem: string;
  options?: string[];  // mc only
  answer?: string;     // optional model answer (not shown to student)
};

// ─── DA pipeline ─────────────────────────────────────────────────────────────

export type Severity = 'high' | 'medium' | 'low';
// Analysis(③) 의 출력. 목표 달성 판정은 Mediation(⑤) 이 따로 낸다.
export type Classification = 'on_track' | 'confusion' | 'off_topic';

// 근거 객체. 필드 구성은 admin의 Assessor 프롬프트 Output schema와 일치해야 한다.
export type DescriptorEvidence = {
  problem_location: string;
  student_text: string | null;   // 누락(omission)이면 null
  reference_type:
    | 'source_text_and_iu_table'
    | 'source_text'
    | 'source_text_wording_and_structure'
    | 'task_requirements_and_paragraph_principles'
    | 'intended_vs_actual_meaning';
  reference_content: string;
  explanation: string;
};

export type DescriptorDiagnosis = {
  key: string;
  severity: Severity;
  evidence: DescriptorEvidence;
};

export type ItemDiagnosis = {
  // 실제로 학생 글에 나타난 descriptor만. 여러 개면 **중요한 순서대로** 나열한다.
  // 첫 번째 항목이 그 item의 primary mediation unit이 된다.
  detected_descriptors: DescriptorDiagnosis[];
  diagnostic_rationale?: string;    // 항목 진단의 내부 설명 (학생 비노출)
  feedback_focus?: string;          // 첫 descriptor에 대응하는 구체적 초점
  affects_meaning?: boolean;        // language_use 에만 존재
};

// ─── Assessor 산출물 ──────────────────────────────────────────────────────────
// 한 번의 호출로 "중재할 항목" 목록을 낸다. 항목 하나 = 학생 화면의 Tab 하나.
// 입력: prompt_system · prompt_assessor · knowledge_<cycle> · prompt_analysis · 지문 · 요약문
//
// PI = Problem Identification (무엇이 문제인지 알아차리기)
// PSV = Problem-Solution Verbalization (왜 문제이고 어떻게 고치는지 자기 말로 설명하기)
export type AssessmentItem = {
  item: string;                   // 선정된 평가 항목 (descriptors.json 의 item key)
  problem_priority: number;       // 중재 필요성 순위 (1 = 가장 큼)
  presentation_order: number;     // 피드백 세션 제시 순서 (1 = 가장 먼저). Tab 번호가 된다
  problem_description: string;    // 학생 글에서 확인된 구체적 문제
  student_text_evidence: string[]; // 문제를 보여 주는 학생 요약문의 실제 인용 구절 (1~2개)
  selection_rationale: string;    // 문제의 근거 + 중재 대상으로 선정한 이유
  mediation_focus: string;        // 실제 중재에서 다룰 구체적 초점
  PI_goal: string;                // 학생이 자기 문제를 인식하기 위해 이해해야 할 내용
  PSV_goal: string;               // 학생이 개선 방법을 자기 말로 설명할 수 있어야 할 내용
};

export type AssessorOutput = {
  assessment: AssessmentItem[];              // presentation_order 순으로 정렬해 쓴다
  // ── 레거시(구 2턴 스키마). 신규 세션에서는 생성되지 않으며, 이미 저장된
  //    기록을 관리자 화면/CSV 에서 계속 열어 보기 위해서만 남긴다. ──
  items?: Record<string, ItemDiagnosis>;
  mediation_targets?: MediationTarget[];
};

// ─── 레거시 타입 (저장된 구 기록 렌더링 전용) ────────────────────────────────

export type MediationGoalPair = {
  problem_identification: string;
  problem_solution_verbalization: string;
};

// 한 탭 안에서 다룰 학습 단위. 근거는 여기 있지 않고, 같은 항목의
// detected_descriptors 에서 descriptor_key 로 찾아 쓴다.
export type MediationUnit = {
  descriptor_key: string;
  feedback_focus: string;
  mediation_goal: MediationGoalPair;
};

// 선택된 항목 하나 = 학생 화면의 Tab 하나.
export type MediationTarget = {
  tab: number;                    // 1,2,3 — Step 2 에서 정한 최종 제시 순서 (HOC first)
  item: string;
  priority_rationale: string;     // Step 1 에서 이 항목을 고른 질적 판단 근거
  // 주 단위는 필수이며 항목의 첫 descriptor에 대응. 탭 완료는 이것의 PI+PSV 충족으로 판정한다.
  primary_mediation_unit: MediationUnit;
  // 보조 단위는 조건 충족 시에만. 억지 생성 금지 — 없으면 null 이 정상이다.
  secondary_mediation_unit: MediationUnit | null;
};

// ─── DA 상호작용 상태 (0719 설계) ─────────────────────────────────────────────
// PI/PSV 는 불리언이 아니라 3값이며, 코드가 유닛 단위로 단조(monotonic) 갱신한다.
export type GoalStatus = 'absent' | 'partial' | 'sufficient';
export type GoalTarget = 'problem_identification' | 'problem_solution_verbalization';

// LLM 호출 턴 중 '발화' 턴의 종류. 각각 프롬프트 자산이 하나씩 대응한다.
export type ResponseContext =
  | 'opening'                 // prompt_opening
  | 'confusion_rephrase'      // prompt_recovery (mode=confusion)
  | 'off_topic_redirect'      // prompt_recovery (mode=off_topic)
  | 'on_track_continue'       // prompt_mediation (step 1~4) / prompt_provision (step 5)
  | 'confirmation_invite'     // prompt_confirm_invite
  | 'post_confirmation_help'  // prompt_post_confirm
  | 'session_closing';        // prompt_closing

export type UnitOutcome = 'completed_by_learner' | 'completed_with_explicit_step5';

// 완료된 유닛의 압축 요약. 중재 발화 턴에는 원문 대화가 아니라 이것만 넘긴다.
export type CompletedUnitSummary = {
  tab: number;
  item: string;
  mediation_focus: string;
  pi_status: GoalStatus;
  psv_status: GoalStatus;
  principle_discussed: string;
  strategy_or_tool_used: string[];
  learner_question_note: string | null;
};

// 현재 활성 유닛의 상태. 항목 하나 = 탭 하나 = 유닛 하나.
export type ActiveUnit = {
  tab: number;              // 1-based
  item: string;
  cumulative_pi: GoalStatus;
  cumulative_psv: GoalStatus;
  current_target: GoalTarget;
  current_step: 1 | 2 | 3 | 4 | 5;
  // confusion/off_topic 이 연속으로 몇 번 나왔는지. on_track 이 나오면 0 으로 돌아간다.
  // 상한에 도달하면 코드가 단계를 +1 해서 재설명 루프를 탈출한다.
  consecutive_off_track?: number;
};

export type DASessionState = {
  // Assessor 가 정한 탭 순서 (item key 배열). UI 탭과 1:1.
  priority_queue: string[];
  current_item_idx: number;          // 0-based, priority_queue 인덱스

  // 현재 활성 유닛
  active_unit: ActiveUnit;

  // 세션 수준
  session_started_at: string | null;         // ISO. 세션 시작 시각 (기록용)
  closing_phase: boolean;                    // 종료 단계 진입 여부

  awaiting_confirmation: boolean;            // 전환 확인 질문을 던진 상태
  completed_units: CompletedUnitSummary[];
  resolutions: Record<string, boolean>;      // item key → 탭 완료 여부 (UI 탭 해제용)
  session_complete: boolean;
  assessor_output: AssessorOutput | null;
};

export type TurnResult = {
  utterance: string;
  updated_state: DASessionState;
  resolution_achieved: boolean;
  tab_unlocked: boolean;
  session_complete: boolean;
  classification: Classification;
};
