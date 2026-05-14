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
