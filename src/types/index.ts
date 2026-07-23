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

export type Prompts = {
  id: number;
  system_prompt: string;
  da_prompt: string;
};

// 원문의 아이디어 단위(idea unit). Assessor가 무엇이 핵심인지 판단할 때 참조한다.
export type IdeaUnit = {
  id: string;
  text: string;
  importance: 'core' | 'supporting' | 'peripheral';
};

export type Passage = {
  cycle_key: string;
  title: string;
  content: string;
  // Assessor 참조자료 (진단 전용). 학생에게는 노출하지 않는다.
  // 모범 요약문은 여기가 아니라 knowledge_<cycle> 프롬프트 자산 안에 들어간다.
  idea_units?: IdeaUnit[];
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

// ─── Assessor 4단계 산출물 ────────────────────────────────────────────────────
// 1단계 진단(items) → 2단계 항목 3개 선택 → 3단계 제시 순서 → 4단계 탭별 목표.
// 2~4단계는 코드의 점수 계산이 아니라 Assessor의 질적 판단 결과다.

// PI = Problem Identification (무엇이 문제인지 알아차리기)
// PSV = Problem-Solution Verbalization (왜 문제이고 어떻게 고치는지 자기 말로 설명하기)
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

export type AssessorOutput = {
  items: Record<string, ItemDiagnosis>;      // 6항목 전체 진단
  mediation_targets?: MediationTarget[];     // Step 1·2 결과: tab 순 최대 3개
};

// ─── DA 상호작용 상태 (0719 설계) ─────────────────────────────────────────────
// PI/PSV 는 불리언이 아니라 3값이며, 코드가 유닛 단위로 단조(monotonic) 갱신한다.
export type GoalStatus = 'absent' | 'partial' | 'sufficient';
export type UnitRole = 'primary' | 'secondary';
export type GoalTarget = 'problem_identification' | 'problem_solution_verbalization';

// Mediator 호출 맥락. Reexplainer/Deflector 는 별도 노드가 아니라 여기 흡수됐다.
export type ResponseContext =
  | 'opening'
  | 'on_track_continue'
  | 'confusion_rephrase'
  | 'off_topic_redirect'
  | 'post_confirmation_help'
  | 'session_closing_invite'
  | 'final_question_answer';

export type UnitOutcome = 'completed_by_learner' | 'completed_with_explicit_step5';

// 완료된 유닛의 압축 요약. Mediator 에는 원문 대화가 아니라 이것만 넘긴다.
export type CompletedUnitSummary = {
  tab: number;
  item: string;
  unit_role: UnitRole;
  descriptor_key: string;
  pi_status: GoalStatus;
  psv_status: GoalStatus;
  principle_discussed: string;
  strategy_or_tool_used: string[];
  learner_question_note: string | null;
};

// 현재 활성 유닛의 상태. Tab 이 아니라 유닛(주/보조)에 귀속된다.
export type ActiveUnit = {
  tab: number;              // 1-based
  item: string;
  unit_role: UnitRole;
  cumulative_pi: GoalStatus;
  cumulative_psv: GoalStatus;
  current_target: GoalTarget;
  current_step: 1 | 2 | 3 | 4 | 5;
};

export type DASessionState = {
  // Assessor 가 정한 탭 순서 (item key 배열). UI 탭과 1:1.
  priority_queue: string[];
  current_item_idx: number;          // 0-based, priority_queue 인덱스

  // 현재 활성 유닛
  active_unit: ActiveUnit;

  // 세션 수준
  // 보조 유닛은 세션당 최대 1개. 탭이 3개면 아예 지정하지 않는다 (총 3탭 규칙).
  secondary_designated_tab: number | null;   // 지정된 보조 유닛의 tab (1-based). 없으면 null
  secondary_used: boolean;
  closing_checkpoint_reached: boolean;       // 25분 no-new-unit 체크포인트
  session_started_at: string | null;         // ISO. 체크포인트 계산 기준
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
