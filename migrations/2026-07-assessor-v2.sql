-- Assessor 4단계 설계 적용에 필요한 스키마 변경
-- Supabase SQL 편집기에서 실행하세요. 모두 멱등(IF NOT EXISTS / IF EXISTS)입니다.

-- ── 1. Assessor 참조자료 (진단 전용, 학생 비노출) ──────────────────────────────
-- idea_units: 원문의 아이디어 단위와 중요도. Assessor가 "무엇이 핵심인지" 판단할 때 참조.
--   형식: [{ "id": "iu1", "text": "...", "importance": "core|supporting|peripheral" }]
-- 모범 요약문은 컬럼이 아니라 knowledge_<cycle> 프롬프트 자산에 넣는다
-- (Assessor 프롬프트가 cycle 지식자료 안에 있다고 전제하므로).
ALTER TABLE passages
  ADD COLUMN IF NOT EXISTS idea_units JSONB NOT NULL DEFAULT '[]';

-- ── 2. DA 상호작용 상태 (0719 설계) ───────────────────────────────────────────
-- 유닛(주/보조) 단위 상태, 3값 PI/PSV, 5단계, 보조 지정, 체크포인트, 종료 단계 등
-- 구조가 커져서 개별 컬럼 대신 상태 전체를 JSONB 한 칸에 저장한다.
ALTER TABLE da_session_state
  ADD COLUMN IF NOT EXISTS state JSONB;

-- 구 개별 컬럼들은 더 이상 코드가 읽지 않는다 (남겨두어도 동작에 지장 없음).
--   current_step, item_identification_cumulative, item_verbalization_cumulative,
--   item_resolution_pending, priority_queue, current_item_idx, resolutions,
--   session_complete, assessor_output
-- 전면 정리하려면 아래 주석을 해제한다.
-- ALTER TABLE da_session_state
--   DROP COLUMN IF EXISTS current_step,
--   DROP COLUMN IF EXISTS item_identification_cumulative,
--   DROP COLUMN IF EXISTS item_verbalization_cumulative,
--   DROP COLUMN IF EXISTS item_resolution_pending;

-- ── 3. Assessor Verifier 제거에 따른 잔여 컬럼 정리 (선택) ────────────────────
-- 코드가 더 이상 쓰지 않습니다. 남겨두어도 동작에는 문제가 없습니다.
ALTER TABLE da_session_state
  DROP COLUMN IF EXISTS diagnosis_confidence,
  DROP COLUMN IF EXISTS assessor_outputs_all,
  DROP COLUMN IF EXISTS verifier_notes_all;
