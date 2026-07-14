# 프롬프트 재구성 제안

> 목표: admin 프롬프트 페이지를 아래 **3개 계층**으로 재편하고, 하드코딩 프롬프트를 모두 admin으로 끌어올린다.
>
> 1. **시스템 프롬프트** — 과제 전체에 대한 설명 (전역 공통)
> 2. **과제 평가 프롬프트** — 학생 산출물·응답을 진단/판정 (내부용, 학생 비노출)
> 3. **채팅 프롬프트** — 학생에게 보이는 발화 생성 및 대화 흐름 제어

**전체 설계 원칙**
- 1번(시스템 프롬프트)은 2·3번 **모든 노드의 system 프롬프트 맨 앞에 자동 주입**되는 공통 배경이다. → 노드마다 과제 설명을 반복하지 않는다.
- admin 값이 비어 있으면 코드 폴백을 쓰되, **폴백 원문을 admin 기본 시드값으로 넣어** 처음부터 admin에서 보이고 수정되게 한다.
- 현재 무효/죽은 프롬프트는 4번에서 제거한다.

---

## 1. 시스템 프롬프트 — 과제 전체 설명

> **성격:** 전역 공통 배경. Assessor·Analysis·Mediator 등 **모든 DA 노드**의 시스템 프롬프트 앞에 붙는다.
> **현재:** 이런 "전역 공통" 슬롯은 없다. (레거시 `system_prompt`가 비슷하지만 챗봇 전용이고 호출부가 없어 미사용)
> **제안:** 신규 키 **`prompt_system`** 신설 → admin "시스템 프롬프트" 탭 최상단에 배치.

### 1.1 과제 개요 (`prompt_system`, 신규)
- **기능:** 이 연구/과제가 무엇인지, 6개 평가 항목이 무엇인지, DA의 목표(학생이 스스로 문제를 인식·언어화하도록 비계 제공)를 전역으로 정의.
- **주입 방식:** `da-pipeline.ts`의 각 `sysPrompt` 조립 시 맨 앞에 `prompt_system + "\n\n---\n\n"` 프리픽스.
- **제안 기본 내용(초안):**
  ```
  이 시스템은 EFL(영어 학습자)의 영어 지문 요약 능력을 향상시키기 위한 동적 평가(Dynamic Assessment) 튜터입니다.
  학생은 지문을 읽고 요약문을 작성하며, [드래프트 → 동적평가 → 리비전] 사이클을 반복합니다.
  요약을 평가하는 6개 항목은 다음과 같습니다:
  1) 핵심 내용 선별  2) 정보 압축  3) 원문 충실성  4) 원문 재진술  5) paragraph 구조  6) 언어 형식
  모든 상호작용의 목표는 학생이 스스로 자신의 글쓰기 문제를 인식(identification)하고,
  그것을 어떻게 고칠지 자기 말로 설명(verbalization)하도록 단계적 비계(scaffolding)를 제공하는 것입니다.
  튜터는 일관된 하나의 인격을 유지하고, 내부 판정 과정을 학생에게 드러내지 않습니다.
  ```

---

## 2. 과제 평가 프롬프트

> **성격:** 학생의 요약문/응답을 **진단·판정**하는 내부 프롬프트. 결과는 JSON이며 학생에게 직접 보이지 않는다.

### 2.1 요약 진단 — Assessor (`prompt_assessor`)
- **기능:** 학생 요약문을 6항목·19 descriptor 기준으로 채점하고 근거를 JSON으로 산출. 우선순위 큐의 근거가 됨.
- **현재 위치:** 🟢 admin(시스템 탭) 슬롯 존재 + 🔴 코드 폴백. (시드가 비어 폴백 사용 중)
- **조치:** 폴백 원문을 admin 기본 시드값으로 이관.

### 2.2 진단 검증 — Assessor Verifier (`prompt_assessor_verifier`)
- **기능:** Assessor 진단의 근거 타당성·항목 선택·심각도를 재검증(LLM-as-judge). 실패 시 재진단 트리거.
- **현재 위치:** 🟢 admin 슬롯 + 🔴 폴백.
- **조치:** 폴백을 기본 시드값으로 이관.

### 2.3 응답 분석 — Analysis (`prompt_analysis`, **신규 슬롯**)
- **기능:** 학생 채팅 응답을 on_track / confusion / off_topic으로 분류하고, identification·verbalization 성취 여부를 판정.
- **현재 위치:** 🔴 **하드코딩만 존재(admin 칸 없음).** 코드는 `prompt_analysis` 키를 읽지만 그 키가 admin·시드에 없어 항상 폴백.
- **조치:** `prompt_analysis` 슬롯 신설 + 폴백을 기본 시드값으로.
- **부수 정리:** 기존 admin의 `prompt_classifier`·`prompt_evaluator`는 이 노드로 병합되어 무효 → **제거**(4번 참조).

### 2.4 진단 기준표 — Descriptors (선택)
- **기능:** Assessor 프롬프트에 주입되는 6항목·19 descriptor 정의표(정의 + 탐지신호).
- **현재 위치:** ⚪ `src/data/descriptors.json` (리포지토리 파일, admin 아님).
- **조치(선택):** 연구자가 채점 기준을 직접 조정하려면 admin 이관 검토. 아니면 현행 유지.

---

## 3. 채팅 프롬프트

> **성격:** 학생에게 **보이는 발화를 생성**하거나 **대화 흐름을 제어**하는 프롬프트.

### 3.1 튜터 발화 공통 — Mediator common (`prompt_mediator_common`)
- **기능:** 모든 튜터 발화(opening / normal / resolution / reexplain / closing)의 공통 규칙·말투·비계 원칙.
- **현재 위치:** 🟢 admin(시스템 탭) 슬롯 + 🔴 폴백. (실제 발화는 아래 3.2·3.3과 조합되어 생성)
- **조치:** 폴백을 기본 시드값으로 이관.

### 3.2 항목별 지도 프롬프트 (6종, `prompt_{항목}`)
- **기능:** 각 평가 항목별로 학생을 어떻게 단계적으로 지도할지(1~5단계 mediation) 정의. Mediator 시스템에 항목별로 합쳐짐.
- **현재 위치:** 🟢 admin(항목별 탭).
- **키:** `prompt_main_idea_coverage`, `prompt_condensation`, `prompt_content_accuracy`, `prompt_paraphrasing`, `prompt_organization`, `prompt_language_use`
- **조치:** 유지. (내용은 admin에서 작성)

### 3.3 항목별 지식자료 (7종, `knowledge_*`)
- **기능:** 발화 생성 시 참고할 개념 지식(공통 1 + 항목별 6). Mediator 시스템에 결합.
- **현재 위치:** 🟢 admin(지문 관리 탭).
- **키:** `knowledge_common`, `knowledge_main_idea_coverage` … `knowledge_language_use`
- **조치:** 유지.

### 3.4 재설명 — Reexplainer (`prompt_reexplainer`)
- **기능:** 학생이 confusion을 보일 때, Mediator가 다른 각도로 재설명하도록 가이드 문장을 생성.
- **현재 위치:** 🟢 admin(시스템 탭) 슬롯 + 🔴 폴백.
- **조치:** 폴백을 기본 시드값으로 이관.

### 3.5 화제이탈 대응 — Deflector (`prompt_deflector`)
- **기능:** 학생 응답이 off_topic일 때, 정중히 현재 과제로 되돌리는 발화를 생성.
- **현재 위치:** 🟢 admin(시스템 탭) 슬롯 + 🔴 폴백.
- **조치:** 폴백을 기본 시드값으로 이관.

### 3.6 이동 확인 — Confirmation (`prompt_confirmation`, **신규 슬롯**)
- **기능:** "다음 과제로 넘어갈까요?"에 대한 학생 답을 예/아니오로 판정해 탭 전환 여부 결정.
- **현재 위치:** 🔴 **완전 하드코딩(키 자체 없음).**
- **조치:** `prompt_confirmation` 슬롯 신설 + `runConfirmationClassifier`가 `prompts['prompt_confirmation'] || 폴백`을 읽도록 수정.

---

## 4. 제거·정리 대상 (불필요 프롬프트)

### 4.1 무효 슬롯 (admin에 있으나 코드가 안 읽음)
- **`prompt_classifier`**, **`prompt_evaluator`** — 2.3 Analysis 노드로 병합됨. admin에서 편집해도 반영 안 됨. → **슬롯 제거.**

### 4.2 죽은 레거시 챗봇 (호출부 없음)
- **`system_prompt`**, **`da_prompt`** (admin "기본 설정" 탭) — `submitToAI`/`sendAIMessage`가 어디서도 호출되지 않음.
- **`callAI` / `buildSystemPrompt`** (`src/lib/ai.ts`) 및 관련 서버액션.
- → 챗봇 재사용 계획이 없으면 **"기본 설정" 탭째로 제거.** (되살릴 거면 UI에 호출부 연결)

---

## 5. 최종 admin 페이지 구성 (제안 요약)

- **탭 ① 시스템 프롬프트**
  - `prompt_system` (과제 전체 설명, 신규)
- **탭 ② 과제 평가 프롬프트**
  - `prompt_assessor` (진단)
  - `prompt_assessor_verifier` (검증)
  - `prompt_analysis` (응답 분석, 신규)
  - (선택) Descriptors 기준표
- **탭 ③ 채팅 프롬프트**
  - `prompt_mediator_common` (발화 공통)
  - 항목별 지도 6종 `prompt_{항목}`
  - 항목별 지식자료 7종 `knowledge_*`
  - `prompt_reexplainer` (재설명)
  - `prompt_deflector` (화제이탈)
  - `prompt_confirmation` (이동 확인, 신규)
- **제거:** `prompt_classifier`, `prompt_evaluator`, 레거시 "기본 설정" 탭(`system_prompt`·`da_prompt`)

> 결과: DA가 LLM에 보내는 **모든 시스템 프롬프트가 admin에서 편집 가능**해지고,
> 하드코딩 문자열은 "값 미입력 시 폴백" 역할로만 남는다. 과제 설명은 `prompt_system` 한 곳에서 전역 관리된다.
