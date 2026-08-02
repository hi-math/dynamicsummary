-- 학생 발화 한 턴 = 한 행. 세션 상태(da_session_state)는 최신 스냅샷만 남기므로
-- 판정·전이·발화의 이력은 이 테이블에만 남는다. 연구 데이터의 원장.
--
-- Supabase SQL Editor 에 그대로 붙여 넣어 실행한다.

create table if not exists public.da_turn_logs (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),

  student_id   text not null,
  phase        text not null,
  turn_index   integer not null,          -- 이 phase 안에서 몇 번째 학생 발화인지 (1부터)

  -- 어느 탭/유닛에서 일어났는가
  tab          integer not null,
  item         text not null,
  item_idx     integer not null,

  -- 입력
  learner_message           text not null,
  previous_tutor_utterance  text,

  -- ③ Analysis 판정
  classification       text,              -- on_track | confusion | off_topic
  turn_pi              text,              -- absent | sufficient | null
  turn_psv             text,
  analysis_rationale   text,

  -- 상태 전이 (턴 시작 → 턴 끝)
  target_before  text not null,
  step_before    integer not null,
  pi_before      text not null,
  psv_before     text not null,
  target_after   text not null,
  step_after     integer not null,
  pi_after       text not null,
  psv_after      text not null,
  off_track_streak integer not null default 0,

  -- 발화를 만든 노드와 결과
  node               text not null,
  utterance          text,
  used_target        text,                -- ⑤ Mediation 자기 신고
  used_step          integer,
  reconcile_mismatch text,                -- 코드 기록과 신고값이 어긋난 경우

  -- ⑧ Confirmation
  confirm_decision   text,                -- move_on | continue_help | unclear
  confirm_rationale  text,

  -- 흐름
  unit_closed      boolean not null default false,
  next_item        text,
  session_complete boolean not null default false,
  time_limit_closed boolean not null default false,   -- 27분 제한으로 다음 탭 대신 종료로 갔는가

  -- 계측
  llm_calls   integer not null default 0,
  latency_ms  integer not null default 0,

  unique (student_id, phase, turn_index)
);

create index if not exists da_turn_logs_student_phase_idx
  on public.da_turn_logs (student_id, phase, turn_index);

-- 이미 이 테이블을 만든 뒤에 추가된 열. 신규 생성이면 위 create 문에 이미 포함되어 있고,
-- 기존 테이블이면 이 문장이 채워 준다 (둘 다 안전하게 여러 번 실행 가능).
alter table public.da_turn_logs
  add column if not exists time_limit_closed boolean not null default false;
