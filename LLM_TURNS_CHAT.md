# LLM 턴 — 채팅 (DA 상호작용)

> 노드 3개: Analysis / Mediator / Confirmation. 상태 전이·라우팅은 코드가 결정.
> `[]` = 프롬프트 자산. 공통 입력(현재 유닛 정보)은 아래 약어로 표기.
>
> **유닛정보** = current_item, descriptor, feedback_focus, 근거 문장, PI/PSV 목표, current_target(PI|PSV), current_step(1~5), cumulative_pi, cumulative_psv
>
> **표시 규칙:** ✅ 있음 · ⚠ 아직 없음. 채팅 파이프라인은 코드·프롬프트 모두 구현됨.
> 프롬프트 4종(`prompt_analysis` · `prompt_mediator_common` · `prompt_category_guidance` ·
> `prompt_confirmation`) ✅ 설치됨. 아래는 개별 표기 생략.
>
> ⚠ **실제 LLM으로 아직 미검증** — 계약(입출력 형식)은 맞췄지만 실모델 세션은 안 돌려봄.

---

## 턴 0 — Mediator · 오프닝

**입력**
- 유닛정보 (1위 탭, step 1)
- response_context = `opening`
- 지문 · 지식자료
- `[prompt_mediator_common + 해당 항목 category 블록]`

**출력**
- `utterance` : 첫 안내 발화 (한국어)

---

## 매 학생 메시지 → Analysis 먼저

## 턴 A — Analysis · 판정

**입력**
- 유닛정보
- latest_tutor_utterance (직전 튜터 발화)
- latest_learner_response (학생 응답)
- current_unit_history (이 탭 대화, 최근 12개)
- `[prompt_analysis]`

**출력**
- `classification` : on_track | confusion | off_topic
- `turn_pi` : absent | partial | sufficient | null
- `turn_psv` : 〃
- `rationale`

### → 코드가 누적 갱신 후 분기 (LLM 없음)
- confusion → **턴 1-1**
- off_topic → **턴 1-2**
- on_track, 미충족 → **턴 1-3**
- on_track, PI·PSV 둘 다 충족 → **턴 1-4**
- on_track, 미충족 + step이 5 → **턴 1-5**

---

## 턴 1-1 — Mediator · confusion

**입력**
- 유닛정보 (단계·목표 그대로 유지)
- response_context = `confusion_rephrase`
- latest_learner_response, history
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 같은 질문을 더 쉬운 말로

## 턴 1-2 — Mediator · off_topic

**입력**
- 유닛정보 (그대로 유지)
- response_context = `off_topic_redirect`
- latest_learner_response, history
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 가볍게 받고 원래 문제로 되돌림

## 턴 1-3 — Mediator · 계속

**입력**
- 유닛정보 (step +1, 목표는 PI→PSV 자동 전환)
- response_context = `on_track_continue`
- latest_learner_response, history
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 맞은 부분 짚고 다음 단계 힌트

## 턴 1-4 — Mediator · 전환 질문

> 둘 다 충족 → 마무리하며 "넘어갈까요?" 질문. 다음 학생 응답은 **턴 C(Confirmation)** 로.

**입력**
- 유닛정보
- response_context = `on_track_continue`
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 정리 + 전환 확인 질문

## 턴 1-5 — Mediator · step 5 (종료형)

> 질문 없이 답 제공. 응답 안 기다리고 유닛 자동 종료. 보조 유닛 안 엶.

**입력**
- 유닛정보 (step 5)
- response_context = `on_track_continue`
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 문제 + 해결 원리 직접 설명
- → 코드: 유닛 종료 → **다음 유닛 오프닝(턴 0)** 또는 **턴 D**

---

## 턴 C — Confirmation · 전환 확인 판정

> 확인 대기 중일 때만. 대화 기록·요약·원문 안 넣음.

**입력**
- confirmation_question
- latest_learner_response
- current_item, feedback_focus, 근거 문장
- `[prompt_confirmation]`

**출력**
- `decision` : move_on | continue_help | unclear
- `rationale`

### → 코드 분기
- move_on → 유닛 종료 → **다음 유닛 오프닝(턴 0)** 또는 **턴 D**
- continue_help → **턴 C-1**
- unclear → 코드가 되묻고 대기 유지 (LLM 없음)

## 턴 C-1 — Mediator · 추가 설명 1회

> 설명 후 유닛 종료. Confirmation 반복 안 함.

**입력**
- 유닛정보 (PI·PSV 충족 유지)
- response_context = `post_confirmation_help`
- latest_learner_response
- `[prompt_mediator_common + category]`

**출력**
- `utterance` : 직접 답변 → 유닛 종료

---

## 턴 D — Mediator · 세션 마무리

> 모든 유닛 종료 후. 25분 경과 시 진행 유닛만 끝내고 진입.

**입력**
- completed_unit_summaries (다룬 원칙 요약)
- response_context = `session_closing_invite`
- `[prompt_mediator_common]`

**출력**
- `utterance` : 다룬 내용 정리 + 질문 있는지

## 턴 D-1 — Mediator · 마지막 질문 답변

> 종료 국면의 학생 질문. Analysis 안 거침.

**입력**
- latest_learner_response, completed_unit_summaries
- response_context = `final_question_answer`
- `[prompt_mediator_common]`

**출력**
- `utterance` : 5단계 없이 바로 직접 답변
