-- 2026-07-26 정리 — Supabase SQL 편집기에서 위에서 아래로 실행하세요.
--
-- 이 파일은 되돌릴 수 없는 삭제를 포함합니다. 실행 전 확인 사항:
--   · 삭제되는 프롬프트 6종의 전문은 backup-prompts-0725/deleted/ 에 백업돼 있습니다.
--   · idea_units 는 4개 사이클 모두 빈 배열([])이며, IU 정보는 knowledge_cycle# 프롬프트
--     자산 안에 들어 있습니다. 컬럼을 지워도 잃는 데이터가 없습니다.
--
-- 이번에 **건드리지 않는** 것 (의도적으로 남겨 둠):
--   · prompts 테이블 (system_prompt / da_prompt) — 코드가 읽지 않으나 보존
--   · da_session_state 의 구 개별 컬럼 (current_step, item_* 등) — 보존
--     → 2026-07-assessor-v2.sql 의 주석 처리된 DROP 구문도 그대로 둡니다.

-- ─── 1. 코드가 읽지 않는 프롬프트 자산 삭제 ──────────────────────────────────
--
--   prompt_assessor_select / _order : 폐기된 Assessor 2턴 구조
--   prompt_evaluator / prompt_classifier : Analysis 노드로 병합
--   prompt_deflector / prompt_reexplainer : Mediator 의 response_context 로 흡수
--
-- 삭제 전 확인용 (선택):
--   SELECT key, length(content) FROM prompt_assets
--    WHERE key IN ('prompt_assessor_select','prompt_assessor_order','prompt_evaluator',
--                  'prompt_classifier','prompt_deflector','prompt_reexplainer');

DELETE FROM prompt_assets
 WHERE key IN (
   'prompt_assessor_select',
   'prompt_assessor_order',
   'prompt_evaluator',
   'prompt_classifier',
   'prompt_deflector',
   'prompt_reexplainer'
 );

-- 남아야 하는 키 (11개): prompt_system, prompt_assessor, prompt_analysis,
--   prompt_opening, prompt_mediator_common, prompt_category_guidance,
--   prompt_confirmation, knowledge_cycle1~4
-- 검증:
--   SELECT key FROM prompt_assets ORDER BY key;

-- ─── 2. passages.idea_units 제거 ─────────────────────────────────────────────
--
-- IU 표와 중요도는 knowledge_cycle# 프롬프트 자산 안에서 Assessor 에게 전달되므로
-- 별도 컬럼이 필요하지 않습니다. 코드 쪽 참조(AssessorRefs·loadAssessorRefs·IdeaUnit)도
-- 같은 커밋에서 제거했습니다.
--
-- 삭제 전 확인용 (선택) — 모든 행이 [] 여야 합니다:
--   SELECT cycle_key, jsonb_array_length(idea_units) FROM passages;

ALTER TABLE passages
  DROP COLUMN IF EXISTS idea_units;
