# 과제 평가 (Assessor) — LLM 턴별 인풋/아웃풋

> `node scripts/dump-prompt-examples.mjs` 로 재생성. `[]` = 프롬프트 자산.
> **표시:** ✅ 설치됨 · ⚠ 없음 · `{{ }}` = 실행 시 채워짐.

요약문 제출 후 배경에서 실행 (챗봇팀만). **진단·선택(턴 1) → 심각도·순서(턴 2)** 2턴.
예시 지문: `cycle1` — "Why do we lie?" (4,299자).

코드: `runAssessor()` 가 `prompt_assessor_select` 유무로 2턴/단일을 자동 선택 (2턴 프롬프트 있으면 2턴).

## 턴 1 — 진단 + 다룰 항목 선택

`runAssessorSelect()` · 심각도·순서 없음.

**system**
1. **과제 개요** `prompt_system` ✅ 740자
2. `---`
3. **Assessor · Select** `prompt_assessor_select` ✅ 20,092자

**user**
- `[SOURCE TEXT]` : 지문 본문 (4,299자)
- `[CYCLE KNOWLEDGE RESOURCE]` : knowledge_cycle1 — 모범 요약문·IU 설명 (현재 비어 생략)
- `[IU TABLE]` : passages.idea_units (비면 생략)
- `[STUDENT SUMMARY]` : 학생 요약문

**출력**
- `items` : 항목별 검출 결과 — `detected_descriptors`(key, evidence) · `diagnostic_rationale` · `feedback_focus` (심각도 없음)
- `selected_items` : 다룰 항목 최대 3개 — `item` · `primary_descriptor` · `evidence_ref` · `feedback_focus`

## 턴 2 — 심각도 + 제시 순서 + 목표

`runAssessorOrder()` · 턴 1 출력을 입력으로 받음.

**system**
1. **과제 개요** `prompt_system` ✅ 740자
2. `---`
3. **Assessor · Order** `prompt_assessor_order` ✅ 17,508자

**user**
- `[SOURCE TEXT]` : 지문 · `[STUDENT SUMMARY]` : 요약문
- `[TURN 1 — DIAGNOSIS]` : 턴 1 출력 (items + selected_items)

**출력**
- `severity` : 항목별 descriptor 등급 (high · medium · low)
- `mediation_targets` : 다룰 항목 (tab 순)
  - `tab` · `item` · `priority_rationale`
  - `primary_mediation_unit` : `descriptor_key` · `feedback_focus` · `mediation_goal`(problem_identification, problem_solution_verbalization)
  - `secondary_mediation_unit` : 보조 목표 or null

> 코드가 `severity` 를 턴 1 `items` 에 병합 → 최종 `AssessorOutput { items, mediation_targets }`.

## 턴 사이 — 코드 (LLM 없음)
- `tabsFromPlan()` : `tab` 순서대로 탭 확정 ✅
- `designateSecondaryTab()` : 보조 유닛 지정 (탭 3개면 없음) ✅

## 자산 상태
| 프롬프트 | 상태 |
|----------|------|
| **과제 개요** `prompt_system` | ✅ 740자 |
| **Assessor·Select** `prompt_assessor_select` | ✅ 20,092자 |
| **Assessor·Order** `prompt_assessor_order` | ✅ 17,508자 |
| **Assessor(구 단일·폴백용)** `prompt_assessor` | ✅ 51,604자 |
| 컬럼 `passages.idea_units` | ✅ |
