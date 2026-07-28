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
| `presentation_order` | 피드백 세션 제시 순서 (1 = 가장 먼저) |
| `problem_description` | 학생 글에서 확인된 구체적 문제 |
| `student_text_evidence` | 문제를 보여 주는 학생 요약문의 인용 구절 1~2개 (배열) |
| `selection_rationale` | 문제의 근거 + 중재 대상 선정 이유 |
| `mediation_focus` | 실제 중재에서 다룰 구체적 초점 |
| `PI_goal` | 학생이 자기 문제를 인식하기 위해 이해해야 할 내용 |
| `PSV_goal` | 학생이 개선 방법을 자기 말로 설명할 수 있어야 할 내용 |

`problem_priority`(중재 필요성)와 `presentation_order`(제시 순서)는 별개다.
현행 프롬프트는 제시 순서를 HOC → Mid → LOC 로 정하므로 같은 층위의 항목끼리는
값이 겹칠 수 있다 — 정렬이 안정 정렬이라 그 경우 배열 순서가 유지된다.

**출력 스키마의 원천은 `prompt_assessor` 본문이다.** 코드는 계약을 덧붙이지 않고
파싱만 관대하게 한다: 루트 키는 `selected_items` → `assessment` → `items` 순으로 찾고,
`student_text_evidence` 는 문자열 하나로 와도 배열로 받으며, 결측 순위·중복 항목·
정의되지 않은 item key 는 `normalizeAssessment()` 가 정리한다.
`prompt_assessor` 가 비어 있을 때만 코드 내 폴백 프롬프트(`ASSESSOR_FALLBACK`)를 쓴다.

## 턴 사이 — 코드 (LLM 없음)

- `orderedAssessment()` : `presentation_order` 순 정렬 + 3개로 절단 ✅
- `tabsFromPlan()` : 그 순서대로 탭 확정 ✅
- `designateSecondaryTab()` : 새 스키마에 보조 단위가 없으므로 항상 `null` ✅
  (상태 기계의 보조 유닛 경로는 남아 있으나 발동하지 않는다)

## 하위 호환

이미 저장된 구 스키마(`items` + `mediation_targets`) 기록은 `legacyToAssessment()` 가
읽는 시점에 새 형태로 변환한다. 신규 세션에서는 생성되지 않는다.

→ 이후 첫 발화는 **채팅 턴 0** 참고.
