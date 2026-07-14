# 프롬프트 인벤토리 리포트 (기능별 정리)

> 이 프로젝트가 LLM에 전달하는 모든 프롬프트를 **기능별**로 정리하고, 각 프롬프트의
> **전달 위치 / 현재 내용 / 폴백 위치 / 폴백 내용**을 함께 표기합니다. 마지막에 **미사용 프롬프트**를 별도 분류합니다.
>
> 조사 파일: `src/lib/ai.ts`, `src/lib/da-pipeline.ts`, `src/data/descriptors.json`,
> `src/actions/student.ts`, `src/actions/admin.ts`, `src/app/admin/tabs/PromptsTab.tsx`, `schema.sql`

---

## 한눈에 보기

| 기능 분류 | 실제 상태 | 프롬프트 저장/전달 |
|-----------|-----------|--------------------|
| **1. 시스템 프롬프트** (레거시 챗봇 페르소나) | ⚠️ **미사용** | DB `prompts.system_prompt` → `callAI` |
| **2. 챗봇용 프롬프트** (레거시 DA 지시 첫 메시지) | ⚠️ **미사용** | DB `prompts.da_prompt` → `callAI` |
| **3. 동적평가용 프롬프트** (DA 파이프라인) | ✅ **실사용** (챗봇팀 실제 경험) | DB `prompt_assets` + 코드 폴백 → `callLLMNode` |

> **핵심:** 실제 챗봇팀 학생이 겪는 대화는 **전부 3번(DA 파이프라인)** 입니다.
> 1·2번(레거시 `callAI` 경로)은 `submitToAI`/`sendAIMessage` 함수로만 존재하며 **어떤 화면에서도 호출되지 않는 죽은 코드**입니다.
> 또한 3번의 `prompt_assets` 20슬롯은 시드값이 **모두 빈 문자열**이라, admin이 입력하기 전에는 **코드 폴백**이 실제로 전달됩니다.

---

# 1. 시스템 프롬프트 — ⚠️ 미사용

레거시 챗봇의 기본 시스템 페르소나. admin ▸ 프롬프트 ▸ "기본 설정" 탭에서 편집.

| 항목 | 내용 |
|------|------|
| **전달 위치** | `src/lib/ai.ts` `buildSystemPrompt()` (5–14행) → `callAI()`의 provider `system` 필드 |
| **호출 경로** | `student.ts` `submitToAI`(412행)·`sendAIMessage`(451행) → **어디서도 호출 안 됨 (죽은 코드)** |
| **현재 내용** | 아래 시드값 (`schema.sql:166`) |
| **폴백** | 없음 (DB 값 그대로 사용; 값이 없으면 빈 문자열) |

**현재 내용 (`system_prompt`):**
```
당신은 학생의 영어 글쓰기 능력 향상을 돕는 교육 보조 AI입니다. 동적 평가(Dynamic Assessment) 방식으로 학생의 요약 능력을 평가하고 개선을 돕습니다. 학생이 제출한 요약문과 원문 지문을 비교하여 구체적이고 건설적인 피드백을 제공하세요.
```

**전달 시 래핑 템플릿** (`ai.ts buildSystemPrompt`, 고정):
```
${system_prompt}

---
[현재 지문]
${passageContent}

[학생의 요약문]
${summary}
```

---

# 2. 챗봇용 프롬프트 — ⚠️ 미사용

레거시 챗봇에서 Submit 시 첫 user 메시지로 전송되던 DA 지시. admin ▸ 프롬프트 ▸ "기본 설정" 탭.

| 항목 | 내용 |
|------|------|
| **전달 위치** | `student.ts` `submitToAI` 409·415행 (`role:'user'` 첫 메시지) |
| **호출 경로** | 위와 동일 — **죽은 코드** |
| **현재 내용** | 아래 시드값 (`schema.sql:167`) |
| **폴백** | 없음 |

**현재 내용 (`da_prompt`):**
```
학생이 지문을 요약한 내용을 검토해주세요. 요약의 주요 포인트, 누락된 내용, 개선이 필요한 부분을 구체적으로 평가해주세요. 학생의 수준에 맞는 힌트와 질문을 통해 스스로 개선할 수 있도록 안내해주세요.
```

---

# 3. 동적평가용 프롬프트 (DA 파이프라인) — ✅ 실사용

실제 챗봇팀 대화를 구동하는 파이프라인. 각 노드는 `prompt_assets`(admin 편집)를 읽고,
비어 있으면 `src/lib/da-pipeline.ts`의 **코드 폴백**을 사용합니다. 전달은 모두 `callLLMNode(systemPrompt, userInput, api)`의 `system` 필드.

> **모든 노드의 "현재 내용"은 동일:** `prompt_assets` 시드가 전부 빈 문자열('')이므로,
> admin이 입력하기 전까지 **폴백 내용이 그대로 전달**되고 있습니다.

파이프라인 흐름:
```
[세션 시작] Assessor → Assessor Verifier(최대 2회) → 우선순위 큐 → Mediator(opening)
[학생 턴]  Analysis(분류+판정) → on_track→Mediator / confusion→Reexplainer→Mediator / off_topic→Deflector
[해결 대기] Confirmation Classifier → Mediator(closing 또는 normal)
```

---

## 3-1. Assessor (진단)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runAssessor` (127행, system) — `initDASession`에서 호출(208·230행) |
| **User 입력** | `[PASSAGE]\n${passageContent}\n\n[STUDENT SUMMARY]\n${summary}` |
| **admin 키 / 현재 내용** | `prompt_assessor` — **빈 값 (미입력)** → 폴백 사용 중 |
| **폴백 위치** | `da-pipeline.ts` 94–123행 (+ 끝에 `descriptors.json` 블록 주입, 3-8 참조) |

**폴백 내용:**
```
You are an Assessor in a Dynamic Assessment tutoring system for EFL summary writing.
Diagnose the student's summary against the 6 evaluation areas and 19 descriptors listed below.

CRITICAL: Your entire response must be a single JSON object whose FIRST and ONLY top-level key is "items".
Do NOT place item keys at the top level. Always wrap them inside "items".

For each item, include:
- score: integer 1-5 (1=very poor, 5=excellent)
- detected_descriptors: array of descriptors that apply (empty array [] if none)
- score_rationale: 1-2 sentence explanation of why this score was given
- feedback_focus: the exact sentence or phrase in the student text that is most problematic
- judgment_evidence: specific evidence from the passage showing what the student missed or got wrong
- affects_meaning: true/false (language_use item only)

Respond ONLY with valid JSON:
{
  "items": {
    "<item_key>": {
      "score": 3,
      "detected_descriptors": [{ "key": "...", "severity": "high|medium|low", "evidence": { "problem_location": "...", "evidence_text": "...", "missing_content": "..." } }],
      "score_rationale": "...",
      "feedback_focus": "...",
      "judgment_evidence": "...",
      "affects_meaning": true
    }
  }
}

## Descriptor Reference
${descriptorBlock}
```
> 참고: Verifier 실패 시 2차 Assessor는 summary 뒤에 `\n\n[Verifier notes: ${...}]`를 덧붙임(230행).

---

## 3-2. Assessor Verifier (진단 검증 · LLM-as-a-judge)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runAssessorVerifier` (169행, system) — 219·234행 호출 |
| **User 입력** | `[PASSAGE]…[STUDENT SUMMARY]…[ASSESSOR OUTPUT]${JSON}` (+ 있으면 `[PREVIOUS VERIFICATION NOTES]`) |
| **admin 키 / 현재 내용** | `prompt_assessor_verifier` — **빈 값** → 폴백 사용 중 |
| **폴백 위치** | `da-pipeline.ts` 158–165행 |

**폴백 내용:**
```
You are an Assessor Verifier (LLM-as-a-judge) in a DA tutoring system.
Review the Assessor's diagnosis for:
1. Evidence validity — does each detected descriptor have clear, specific textual evidence?
2. Item selection appropriateness — are the selected items truly present in the student's text?
3. Priority justification — are high-severity ratings warranted?

Respond ONLY with valid JSON:
{ "pass": true|false, "notes": "brief explanation of issues (if fail) or confirmation (if pass)" }
```

---

## 3-3. Analysis (학생 응답 분류 + 판정 · Classifier+Evaluator 병합)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runAnalysis` (305행, system) — 매 학생 턴 호출(475행) |
| **User 입력** | JSON `{current_item, current_step, student_message, identification_already_true, verbalization_already_true, assessor_evidence}` |
| **admin 키 / 현재 내용** | 코드가 읽는 키 = `prompt_analysis` → **admin UI·시드에 존재하지 않음** → **항상 폴백** |
| **폴백 위치** | `da-pipeline.ts` 277–294행 |

**폴백 내용:**
```
You are the analysis node in a DA tutoring pipeline. In ONE pass you do two jobs:

(1) CLASSIFY the student's response into exactly one of:
- "on_track": attempts to address the current writing problem (even partially)
- "confusion": explicit signal of not knowing (e.g., "I don't know", "I'm not sure what to do")
- "off_topic": unrelated to the current tutoring flow

(2) EVALUATE two boolean conditions (only meaningful when classification is "on_track"):
- identification_success: Did the student identify their own writing problem in their own words?
- remedial_verbalization_success: Did the student verbalize HOW to fix the problem in their own words?

Cumulative rules for (2):
- If identification_already_true=true, set identification_success=true unconditionally (do not re-judge).
- If verbalization_already_true=true, set remedial_verbalization_success=true unconditionally.
- Only judge conditions still false. If classification is not "on_track", keep any already-true flags but do not newly grant either condition.

Respond ONLY with valid JSON:
{ "classification": "on_track"|"confusion"|"off_topic", "identification_success": true|false, "remedial_verbalization_success": true|false }
```
> ⚠️ admin UI의 `prompt_classifier`·`prompt_evaluator` 두 칸은 이 노드로 병합되어 **읽히지 않음** (5장 참조).

---

## 3-4. Reexplainer (confusion 대응 재설명)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runReexplainer` (337행, system) — classification=confusion 시(511행) |
| **User 입력** | JSON `{current_item, current_step, student_message, assessor_evidence}` |
| **admin 키 / 현재 내용** | `prompt_reexplainer` — **빈 값** → 폴백 사용 중 |
| **폴백 위치** | `da-pipeline.ts` 325–328행 |

**폴백 내용:**
```
You are a Reexplainer in a DA tutoring pipeline.
The student has shown confusion about the current writing problem.
Generate a brief re-explanation guidance (1-2 sentences) that the Mediator can use to re-explain the problem from a different angle.
Respond ONLY with a plain text explanation guidance (no JSON).
```

---

## 3-5. Deflector (off_topic 대응)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runDeflector` (360행, system) — classification=off_topic 시(517행) |
| **User 입력** | JSON `{current_item, priority_queue, student_message}` |
| **admin 키 / 현재 내용** | `prompt_deflector` — **빈 값** → 폴백 사용 중 |
| **폴백 위치** | `da-pipeline.ts` 347–352행 |

**폴백 내용:**
```
You are a Deflector in a DA tutoring pipeline.
The student's message is off-topic. Handle one of three cases:
1. Completely irrelevant: redirect politely back to the task.
2. Mentions another item in priority_queue: acknowledge briefly, redirect to current item.
3. Mentions out-of-scope writing issue: acknowledge, explain scope, redirect.
Generate a brief tutor response (1-2 sentences). Respond with plain text only (no JSON).
```

---

## 3-6. Mediator (학생에게 보이는 모든 튜터 발화)

opening / normal / resolution / reexplain / closing 5개 모드의 실제 발화를 생성.

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runMediator` (402행, system) — 457·469·495·507·513·532행 |
| **User 입력** | JSON `{current_item, current_step, mode, student_message, assessor_evidence, eval_result, reexplainer_guidance, resolution_status, tabs_remaining}` |
| **admin 키 / 현재 내용** | **4개 조합**: `prompt_mediator_common` + `prompt_{item}` + `knowledge_common` + `knowledge_{item}` (`\n\n---\n\n`로 연결). 현재 **모두 빈 값** → 폴백 사용 중 |
| **폴백 위치** | `da-pipeline.ts` 382–388행 (4개가 전부 비었을 때만) |

**관련 admin 키:**
- 공통: `prompt_mediator_common`, `knowledge_common`
- 항목별(6): `prompt_main_idea_coverage`, `prompt_condensation`, `prompt_content_accuracy`, `prompt_paraphrasing`, `prompt_organization`, `prompt_language_use`
- 지식 항목별(6): `knowledge_main_idea_coverage`, `knowledge_condensation`, `knowledge_content_accuracy`, `knowledge_paraphrasing`, `knowledge_organization`, `knowledge_language_use`
  (항목별·지식 항목별은 admin ▸ 지문 관리 탭에서 편집)

**폴백 내용:**
```
You are a DA tutor. Generate a natural, encouraging tutor utterance (1-3 sentences).
- mode "opening": generate a warm, casual opening question that introduces the item topic lightly — like "이번에는 [item topic]에 대해 같이 살펴볼까요?" — do not sound clinical or evaluative.
- mode "normal": continue scaffolding the student toward identifying/verbalizing the problem.
- mode "resolution": celebrate resolution, ask if student has questions before moving on.
- mode "reexplain": re-explain the problem from a different angle using the provided guidance.
- mode "closing": deliver final closing comment and guide student to click next tab or finish.
Maintain a single, consistent tutor persona. Do NOT reveal internal node decisions.
```

---

## 3-7. Confirmation Classifier (다음 과제 이동 확인) — 완전 하드코딩

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `runConfirmationClassifier` (417행, system) — item_resolution_pending 시(450행) |
| **User 입력** | 학생 메시지 원문 |
| **admin 키 / 현재 내용** | **없음** (admin 편집 불가) |
| **폴백 위치** | 자체가 유일한 정의 (411–415행) |

**내용:**
```
You are a classifier. The tutor just asked the student if they want to move on to the next task.
Determine if the student's response is a CONFIRMATION (positive/agreeable) or NOT.
Respond ONLY with valid JSON: { "confirming": true | false }
Confirming examples: "네", "응", "갑시다", "넘어가요", "그래요", "알겠어요", "yes", "sure", "okay", "ok", "넘어가겠습니다"
NOT confirming examples: "아니요", "잠깐만요", "궁금한 게 있어요", "no", "wait"
```

---

## 3-8. Descriptor 진단 기준 블록 (Assessor에 주입)

| 항목 | 내용 |
|------|------|
| **전달 위치** | `da-pipeline.ts` `buildDescriptorBlock` (15–24행) → 3-1 Assessor 프롬프트의 `${descriptorBlock}` |
| **출처 / 현재 내용** | `src/data/descriptors.json` (리포지토리 파일, admin 편집 불가) |
| **폴백** | 해당 없음 (항상 이 파일 사용) |

- 6개 항목 × 총 19개 descriptor. 라인 포맷: `[item_key] label` + `  - key: definition | 탐지신호: signal`

| 항목 키 | 라벨 | descriptor 수 |
|---------|------|:-:|
| `main_idea_coverage` | 핵심 내용 선별 | 3 |
| `condensation` | 정보 압축 | 3 |
| `content_accuracy` | 원문 충실성 | 2 |
| `paraphrasing` | 원문 재진술 | 3 |
| `organization` | paragraph 구조 | 5 |
| `language_use` | 언어 형식 | 3 |

---

# 4. 미사용 프롬프트 (별도 분류)

## 4-1. 레거시 챗봇 경로 전체 — 호출되지 않는 죽은 코드
`submitToAI`·`sendAIMessage`(`student.ts`)가 어떤 화면에서도 import·호출되지 않음.
따라서 이들에 딸린 아래 프롬프트/코드 전부가 **미사용**입니다.

| 대상 | 위치 | 비고 |
|------|------|------|
| `prompts.system_prompt` (1장) | DB + admin "기본 설정" 탭 | 시드값 있으나 미전달 |
| `prompts.da_prompt` (2장) | DB + admin "기본 설정" 탭 | 시드값 있으나 미전달 |
| `callAI` / `buildSystemPrompt` | `src/lib/ai.ts` | 호출부 없음 |

> admin PromptsTab도 이 섹션을 "레거시"로 표기하고 있음.

## 4-2. admin에 노출되지만 코드가 읽지 않는 슬롯
Classifier·Evaluator는 3-3 Analysis 노드로 병합되어, 코드는 `prompt_analysis` 키만 읽습니다.
아래 두 슬롯은 admin이 편집해도 **파이프라인에 반영되지 않습니다.**

| admin 키 | admin 위치 | 문제 |
|----------|-----------|------|
| `prompt_classifier` | 프롬프트 ▸ 시스템 프롬프트 탭 | 코드가 읽지 않음 |
| `prompt_evaluator` | 프롬프트 ▸ 시스템 프롬프트 탭 | 코드가 읽지 않음 |

## 4-3. (역방향 문제) 코드가 읽지만 admin에 없는 키
| 코드가 읽는 키 | 위치 | 문제 |
|----------------|------|------|
| `prompt_analysis` | `da-pipeline.ts:277` | admin UI·시드에 없음 → 편집 불가, **항상 폴백만 사용** |

---

# 5. 정리 및 제안

- **실제로 동작하는 프롬프트는 3장(DA 파이프라인)뿐이며, 현재는 전부 코드 폴백으로 구동** 중입니다(`prompt_assets` 미입력).
  운영 전 admin에서 3-1~3-6 자산을 채우지 않으면 영어 하드코딩 프롬프트가 학생에게 그대로 노출됩니다.
- **Classifier/Evaluator ↔ Analysis 키 불일치 정리 필요**: admin 키를 `prompt_analysis` 하나로 통일하거나, 두 슬롯을 `prompt_analysis`에 매핑.
- **레거시 챗봇(1·2장) 정리 검토**: 사용하지 않으면 `system_prompt`/`da_prompt`/`callAI`/`buildSystemPrompt`와 관련 admin "기본 설정" 탭을 제거하거나, 반대로 재사용할 계획이면 호출부를 연결.
- **Confirmation Classifier(3-7)** 는 admin 노출이 없으므로, 문구 조정이 필요하면 슬롯 추가 검토.
