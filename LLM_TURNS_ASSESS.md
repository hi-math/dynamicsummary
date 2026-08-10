# LLM 턴 — 과제 평가 (Assessor)

> 요약문 제출 후 배경에서 실행. 챗봇팀만. `[]` = 프롬프트 자산.
> **단일 호출** — 진단·선택·순위·목표를 한 번에 낸다. (구 2턴 select/order 구조는 폐기)

## 입력

- `[prompt_system]` — 과제 개요. 시스템 프롬프트 맨 앞에 주입
- `[prompt_assessor]` — 진단·선정 지시 (본체)
- `[knowledge_<cycle>]` — 현재 과제의 지식자료(모범 요약문·IU 표·중요도·연구자 노트).
  `knowledge_active` 로 해석되어 `[CYCLE KNOWLEDGE RESOURCE]` 블록으로 user 입력에 포함
- `[prompt_analysis]` — 참조용. PI/PSV 를 나중에 어떤 기준으로 판정하는지 보여 주어,
  같은 잣대로 목표를 세우게 한다 (Assessor 가 실행할 지시가 아님)
- 지문 본문 (`[SOURCE TEXT]`)
- 학생 요약문 (`[STUDENT SUMMARY]`)

## 출력 — `selected_items[]` (최대 3항목, 곧 탭 3개)

| 필드 | 내용 |
|------|------|
| `item` | 선정된 평가 항목 |
| `problem_priority` | 항목 간 상대적 중재 필요성 순위 (1 = 가장 큼) |
| `problem_description` | 학생 글에서 확인된 구체적 문제 |
| `student_text_evidence` | 문제를 보여 주는 학생 요약문의 인용 구절 1~2개 (배열) |
| `selection_rationale` | 문제의 근거 + 중재 대상 선정 이유 |
| `mediation_focus` | 실제 중재에서 다룰 구체적 초점 |
| `PI_goal` | 학생이 자기 문제를 인식하기 위해 이해해야 할 내용 |
| `PSV_goal` | 학생이 개선 방법을 자기 말로 설명할 수 있어야 할 내용 |

**탭 순서는 LLM 이 정하지 않는다.** Assessor 는 `item`(무엇을) 과 `problem_priority`
(얼마나 심각한가) 만 내고, 실제 배열은 `sortAssessment()` 가 강제한다:

1. 교수적 위계 — HOC(`main_idea_coverage` · `condensation` · `content_accuracy`)
   → Mid(`organization` · `paraphrasing`) → LOC(`language_use`). `ITEM_LEVEL` 이 원천.
2. 같은 위계 안에서는 `problem_priority` 오름차순.
3. 정렬 후 앞 3개(`MAX_TABS`)를 남기고 `presentation_order` 를 1..N 으로 매긴다.

`ITEM_LEVEL` 에 없는 항목 키(관리자가 descriptors 자산에 새로 추가한 경우)는 맨 뒤로 간다.

> 2026-08-10 이전 기록은 `presentation_order` 가 LLM 값이다. 당시 8건 중 6건이
> `problem_priority` 를 그대로 복사해 위계가 뒤집힌 사례가 있었고, 그래서 순서 결정을
> 코드로 옮겼다. 지난 기록은 학생이 실제로 본 순서를 보존해야 하므로 재정렬하지 않는다.

**출력 스키마의 원천은 `prompt_assessor` 본문이다.** 코드는 계약을 덧붙이지 않고
파싱만 관대하게 한다: 루트 키는 `selected_items` → `assessment` → `items` 순으로 찾고,
`student_text_evidence` 는 문자열 하나로 와도 배열로 받으며, 결측 순위·중복 항목·
정의되지 않은 item key 는 `normalizeAssessment()` 가 정리한다.
`prompt_assessor` 가 비어 있을 때만 코드 내 폴백 프롬프트(`ASSESSOR_FALLBACK`)를 쓴다.

## 턴 사이 — 코드 (LLM 없음)

- `sortAssessment()` : 위계 → `problem_priority` 순 배열 + 3개로 절단 + 번호 부여 ✅
  (Assessor 응답 직후 한 번. 저장되는 `assessor_output` 은 이미 탭 순서다)
- `orderedAssessment()` : 저장된 순서를 그대로 읽는다 (재계산하지 않는다) ✅
- `tabsFromPlan()` : 그 순서대로 탭 확정 ✅
- `designateSecondaryTab()` : 새 스키마에 보조 단위가 없으므로 항상 `null` ✅
  (상태 기계의 보조 유닛 경로는 남아 있으나 발동하지 않는다)

## 하위 호환

이미 저장된 구 스키마(`items` + `mediation_targets`) 기록은 `legacyToAssessment()` 가
읽는 시점에 새 형태로 변환한다. 신규 세션에서는 생성되지 않는다.

→ 이후 첫 발화는 **채팅 턴 0** 참고.
