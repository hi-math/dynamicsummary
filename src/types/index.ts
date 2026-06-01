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
  updated_at?: string;
};

export type AIMessage = {
  id: string;
  student_id: string;
  phase: string;
  role: 'user' | 'assistant';
  content: string;
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
export type DiagnosisConfidence = 'high' | 'medium' | 'low';
export type Classification = 'on_track' | 'confusion' | 'off_topic';

export type DescriptorDiagnosis = {
  key: string;
  severity: Severity;
  evidence: {
    problem_location: string;
    evidence_text: string;
    missing_content?: string;
  };
};

export type ItemDiagnosis = {
  detected_descriptors: DescriptorDiagnosis[];
  affects_meaning?: boolean;  // language_use only
};

export type AssessorOutput = {
  items: Record<string, ItemDiagnosis>;
};

export type DASessionState = {
  priority_queue: string[];
  current_item_idx: number;
  current_step: number;
  item_identification_cumulative: boolean;
  item_verbalization_cumulative: boolean;
  resolutions: Record<string, boolean>;
  session_complete: boolean;
  diagnosis_confidence: DiagnosisConfidence | null;
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
