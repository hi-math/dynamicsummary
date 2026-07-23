# LLM 턴 — 과제 평가 (Assessor)

> 요약문 제출 후 배경에서 실행. 챗봇팀만. `[]` = 프롬프트 자산.
> 진단·선택(1턴)과 심각도·순서(2턴)를 분리.
>
> **표시 규칙:** ✅ 있음 · ⚠ 아직 없음(미구현/미연결)
>
> ⚠ **코드는 아직 1턴 구조입니다.** `runAssessor()` 가 `prompt_assessor`(단일, 51K자)를
> 한 번만 호출합니다. 아래 2턴 프롬프트는 설치됐지만 코드가 읽지 않습니다.

## 턴 1 — 진단 + 다룰 항목 선택

**입력**
- 지문
- 학생 요약문
- 지식자료(모범 요약문·IU 설명) — 있으면
- IU 표 (`passages.idea_units`) ✅
- `[prompt_assessor_select]` ✅ 설치됨 (20K자) · ⚠ 코드 미연결

**출력**
- `items` : 6항목 × 16 descriptor 중 검출된 것만 + 근거 문장
- `selected_items` : 다룰 항목 최대 3개
  - `item` · `primary_descriptor` · `evidence`(근거 문장) · `feedback_focus`
  - (심각도·순서 없음 — 2턴에서)

## 턴 2 — 심각도 산출 + 제시 순서 결정

**입력**
- 턴 1 출력 (`selected_items` + 근거) · ⚠ 1→2 연결 코드 미구현
- 지문 · 학생 요약문
- `[prompt_assessor_order]` ✅ 설치됨 (17.5K자) · ⚠ 코드 미연결

**출력**
- `severity` : 항목별 descriptor 심각도 high | medium | low
- `mediation_targets` : 심각도로 판단해 순서 확정 (내용·구조 먼저, 언어 나중)
  - `tab` : 제시 순서
  - `priority_rationale`
  - `primary_mediation_unit` : 주 목표 — descriptor, feedback_focus, PI/PSV
  - `secondary_mediation_unit` : 보조 목표 or `null`

## 턴 사이 — 코드 (LLM 없음)
- `tabsFromPlan()` : tab 순서대로 탭 확정 ✅
- `designateSecondaryTab()` : 보조 유닛 지정 (탭 3개면 없음) ✅

## ⚠ 이 2턴 구조를 실제로 돌리려면
- `runAssessor()` 를 2회 호출로 변경 (select → order), 1턴 출력을 2턴 입력으로 연결
- 코드가 `prompt_assessor` 대신 `prompt_assessor_select` / `prompt_assessor_order` 를 읽도록
- 단일 `prompt_assessor`(51K) 는 이관 완료 후 폐기

→ 이후 첫 발화는 **채팅 턴 0** 참고.
