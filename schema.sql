-- ============================================================
-- Writing Research Platform (dynamicsummary) — Supabase Schema
-- Run this in the Supabase SQL Editor to initialize the database
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mentor', 'student')),
  team TEXT CHECK (team IN ('chatbot', 'human')),
  mentor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  current_phase TEXT NOT NULL DEFAULT 'cycle1_draft',
  sort_order INTEGER,          -- manual display order in the admin account list (drag to reorder)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration (기존 DB에 컬럼 추가 시):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- API settings (single row, id = 1)
CREATE TABLE IF NOT EXISTS api_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'openai',
  openai_key TEXT NOT NULL DEFAULT '',
  openai_model TEXT NOT NULL DEFAULT 'gpt-5.5',
  anthropic_key TEXT NOT NULL DEFAULT '',
  anthropic_model TEXT NOT NULL DEFAULT 'claude-opus-4-7',
  gemini_key TEXT NOT NULL DEFAULT '',
  gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompts (single row, id = 1)
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY DEFAULT 1,
  system_prompt TEXT NOT NULL DEFAULT '',
  da_prompt TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passages
CREATE TABLE IF NOT EXISTS passages (
  cycle_key TEXT PRIMARY KEY CHECK (cycle_key IN ('cycle1', 'cycle2', 'cycle3', 'cycle4')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comprehension questions per cycle (array stored as JSONB)
-- Each question: { id, type: 'mc'|'sa', stem, options?: string[], answer?: string }
CREATE TABLE IF NOT EXISTS comprehension_questions (
  cycle_key TEXT PRIMARY KEY REFERENCES passages(cycle_key) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comprehension answers per student per phase
CREATE TABLE IF NOT EXISTS comprehension_answers (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',  -- { question_id: answer_text }
  elapsed_seconds INTEGER,
  submitted_at TIMESTAMPTZ,
  PRIMARY KEY (student_id, phase)
);

-- DA session state per student per phase (chatbot team)
CREATE TABLE IF NOT EXISTS da_session_state (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  priority_queue JSONB NOT NULL DEFAULT '[]',          -- string[] top-3 items
  current_item_idx INTEGER NOT NULL DEFAULT 0,
  current_step INTEGER NOT NULL DEFAULT 1,
  item_identification_cumulative BOOLEAN NOT NULL DEFAULT FALSE,
  item_verbalization_cumulative BOOLEAN NOT NULL DEFAULT FALSE,
  resolutions JSONB NOT NULL DEFAULT '{}',             -- { item_key: boolean }
  session_complete BOOLEAN NOT NULL DEFAULT FALSE,
  diagnosis_confidence TEXT CHECK (diagnosis_confidence IN ('high','medium','low')),
  assessor_output JSONB,                               -- final adopted Assessor output
  assessor_outputs_all JSONB,                          -- all Assessor attempts (for low confidence)
  verifier_notes_all JSONB,                            -- all Verifier notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, phase)
);

-- Prompt assets (20 text files the admin edits)
CREATE TABLE IF NOT EXISTS prompt_assets (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session data (student's work per phase)
CREATE TABLE IF NOT EXISTS session_data (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  summary TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, phase)
);

-- AI chat messages (chatbot team)
-- item_idx: which DA task (index into da_session_state.priority_queue) this message
-- belongs to, so the per-task chat tabs can be restored correctly on reconnect.
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  item_idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for existing databases (safe to run repeatedly):
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS item_idx INTEGER NOT NULL DEFAULT 0;

-- Human chat messages (human team — mentor ↔ student)
CREATE TABLE IF NOT EXISTS human_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_messages_student_phase ON ai_messages(student_id, phase);
CREATE INDEX IF NOT EXISTS idx_human_messages_student ON human_messages(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_data_student ON session_data(student_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Disable RLS (all access goes through server-side service role key)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompts DISABLE ROW LEVEL SECURITY;
ALTER TABLE passages DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE human_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE da_session_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_assets DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Seed data
-- ============================================================

INSERT INTO users (id, name, role, team, current_phase)
VALUES ('admin', '관리자', 'admin', NULL, 'cycle1_draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_settings (id, provider, openai_key, openai_model, anthropic_key, anthropic_model, gemini_key, gemini_model)
VALUES (1, 'openai', '', 'gpt-5.5', '', 'claude-opus-4-7', '', 'gemini-2.5-flash')
ON CONFLICT (id) DO NOTHING;

INSERT INTO prompts (id, system_prompt, da_prompt)
VALUES (
  1,
  '당신은 학생의 영어 글쓰기 능력 향상을 돕는 교육 보조 AI입니다. 동적 평가(Dynamic Assessment) 방식으로 학생의 요약 능력을 평가하고 개선을 돕습니다. 학생이 제출한 요약문과 원문 지문을 비교하여 구체적이고 건설적인 피드백을 제공하세요.',
  '학생이 지문을 요약한 내용을 검토해주세요. 요약의 주요 포인트, 누락된 내용, 개선이 필요한 부분을 구체적으로 평가해주세요. 학생의 수준에 맞는 힌트와 질문을 통해 스스로 개선할 수 있도록 안내해주세요.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO passages (cycle_key, title, content)
VALUES
  ('cycle1', '', ''),
  ('cycle2', '', ''),
  ('cycle3', '', ''),
  ('cycle4', '', '')
ON CONFLICT (cycle_key) DO NOTHING;

INSERT INTO comprehension_questions (cycle_key, questions)
VALUES ('cycle1','[]'),('cycle2','[]'),('cycle3','[]'),('cycle4','[]')
ON CONFLICT (cycle_key) DO NOTHING;

-- Seed prompt asset slots
INSERT INTO prompt_assets (key, content) VALUES
  ('prompt_system', ''),
  ('prompt_assessor', ''),
  ('prompt_assessor_verifier', ''),
  ('prompt_analysis', ''),
  ('prompt_confirmation', ''),
  ('prompt_classifier', ''),
  ('prompt_evaluator', ''),
  ('prompt_reexplainer', ''),
  ('prompt_deflector', ''),
  ('prompt_mediator_common', ''),
  ('prompt_main_idea_coverage', ''),
  ('prompt_condensation', ''),
  ('prompt_content_accuracy', ''),
  ('prompt_paraphrasing', ''),
  ('prompt_organization', ''),
  ('prompt_language_use', ''),
  ('knowledge_common', ''),
  ('knowledge_main_idea_coverage', ''),
  ('knowledge_condensation', ''),
  ('knowledge_content_accuracy', ''),
  ('knowledge_paraphrasing', ''),
  ('knowledge_organization', ''),
  ('knowledge_language_use', '')
ON CONFLICT (key) DO NOTHING;
