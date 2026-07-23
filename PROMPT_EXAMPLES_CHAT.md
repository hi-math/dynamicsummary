# 채팅 (DA 상호작용) — LLM 턴별 인풋/아웃풋

> `[]` = 프롬프트 자산. 상태 전이·라우팅은 코드가 결정. 노드 3개.
> **유닛정보** = current_item·descriptor·feedback_focus·근거·PI/PSV목표·current_target·current_step(1~5)·cumulative_pi·cumulative_psv

**프롬프트 상태**
- **Analysis** `prompt_analysis` ✅ 17,114자
- **Mediator (공통)** `prompt_mediator_common` ✅ 30,348자
- **Category 가이던스** `prompt_category_guidance` ✅ 25,258자
- **Confirmation** `prompt_confirmation` ✅ 3,507자
- DB `da_session_state.state` (세션 상태 JSONB) ✅
- ⚠ 실제 LLM 세션 미검증 (입출력 형식만 맞춤)

## 턴 0 — Mediator · 오프닝
**입력:** 유닛정보(1위 탭, step 1) · `response_context=opening` · 지문 · 지식자료 · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` (첫 안내 발화)

## 턴 A — Analysis · 판정 (매 학생 메시지마다 먼저)
**입력:** 유닛정보 · latest_tutor_utterance · latest_learner_response · current_unit_history(최근 12) · `[prompt_analysis]`
**출력:** `classification`(on_track|confusion|off_topic) · `turn_pi` · `turn_psv`(absent|partial|sufficient|null) · `rationale`

### → 코드 분기 (LLM 없음)
```text
confusion            → 턴 A-1 (confusion_rephrase)
off_topic            → 턴 A-2 (off_topic_redirect)
on_track, 미충족      → 턴 A-3 (on_track_continue, step+1)
on_track, 둘 다 충족   → 턴 A-4 (전환 질문 → 다음은 턴 C)
on_track, 미충족+step5 → 턴 A-5 (종료형, 유닛 자동 종료)
```

## 턴 A-1 — Mediator · confusion
**입력:** 유닛정보 · `response_context=confusion_rephrase` · latest_learner_response · history · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 같은 질문 더 쉬운 말로 (단계·목표 유지)

## 턴 A-2 — Mediator · off_topic
**입력:** 유닛정보 · `response_context=off_topic_redirect` · latest_learner_response · history · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 가볍게 받고 원래 문제로

## 턴 A-3 — Mediator · 계속
**입력:** 유닛정보 · `response_context=on_track_continue` · latest_learner_response · history · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 맞은 부분 짚고 다음 단계 힌트 (step+1, PI→PSV 자동 전환)

## 턴 A-4 — Mediator · 전환 질문
**입력:** 유닛정보 · `response_context=on_track_continue` · latest_learner_response · history · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 정리 + "넘어갈까요?" → 다음 학생 응답은 턴 C

## 턴 A-5 — Mediator · step 5 (종료형)
**입력:** 유닛정보(step 5) · `response_context=on_track_continue` · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 문제+해결 원리 직접 설명 → 코드: 유닛 종료 → 다음 유닛 오프닝(턴 0) 또는 턴 D

## 턴 C — Confirmation · 전환 확인 판정
> 확인 대기 중일 때만. 대화 기록·요약·원문 안 넣음.
**입력:** confirmation_question · latest_learner_response · current_item · feedback_focus · 근거 · `[prompt_confirmation]`
**출력:** `decision`(move_on|continue_help|unclear) · `rationale`

### → 코드 분기
```text
move_on       → 유닛 종료 → 다음 유닛 오프닝(턴 0) 또는 턴 D
continue_help → 턴 C-1
unclear       → 코드가 되묻고 대기 유지 (LLM 없음)
```

## 턴 C-1 — Mediator · 추가 설명 1회
**입력:** 유닛정보 · `response_context=post_confirmation_help` · latest_learner_response · history · `[prompt_mediator_common + 항목 category 블록]`
**출력:** `utterance` — 직접 답변 1회 → 유닛 종료 (Confirmation 반복 안 함)

## 턴 D — Mediator · 세션 마무리
> 모든 유닛 종료 후. 25분 경과 시 진행 유닛만 끝내고 진입.
**입력:** completed_unit_summaries · `response_context=session_closing_invite` · `[prompt_mediator_common]`
**출력:** `utterance` — 다룬 내용 정리 + 질문 있는지

## 턴 D-1 — Mediator · 마지막 질문 답변
> 종료 국면의 학생 질문. Analysis 안 거침.
**입력:** latest_learner_response · completed_unit_summaries · `response_context=final_question_answer` · `[prompt_mediator_common]`
**출력:** `utterance` — 5단계 없이 바로 직접 답변
