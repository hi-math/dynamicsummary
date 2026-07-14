# 프롬프트 감사 리포트 — admin 이관 관점

> 목표: **가급적 admin 프롬프트 페이지의 값을 사용**하고, **하드코딩된 프롬프트도 모두 admin 페이지에서 수정 가능**하게 만든다.
> 이를 위해 프롬프트별로 **이름 / 기능 / 위치(admin 페이지 vs 하드코딩)** 를 정리하고, **불필요해 보이는 프롬프트**를 별도 표기한다.

**위치 표기 범례**
- 🟢 **admin** : admin 프롬프트/지문 페이지에서 편집 가능 + 코드가 실제로 읽음
- 🟡 **admin(무효)** : admin 페이지에 칸은 있으나 코드가 읽지 않음 → 편집해도 반영 안 됨
- 🔴 **하드코딩** : 코드에만 존재, admin 페이지에 없음 → **이관 대상**
- ⚪ **데이터파일** : 리포지토리 파일(admin 아님)

---

## A. DA 파이프라인 프롬프트 (실사용)

| # | 이름(키) | 기능 | 위치 | 이관/조치 |
|---|----------|------|------|-----------|
| 1 | `prompt_assessor` | 학생 요약 진단(6항목·19 descriptor 채점, JSON) | 🟢 admin (시스템 탭) + 🔴 폴백 | 폴백 기본문을 admin 기본값으로 시드 |
| 2 | `prompt_assessor_verifier` | 진단 결과 검증(LLM-as-judge) | 🟢 admin (시스템 탭) + 🔴 폴백 | 동일 |
| 3 | **`prompt_analysis`** | 학생 응답 분류(on_track/confusion/off_topic) + identification·verbalization 판정 | 🔴 **하드코딩 (admin 칸 없음)** | **admin 슬롯 신설 필요** |
| 4 | `prompt_reexplainer` | confusion 대응 재설명 가이드 생성 | 🟢 admin (시스템 탭) + 🔴 폴백 | 폴백을 admin 기본값으로 시드 |
| 5 | `prompt_deflector` | off_topic 대응 발화 생성 | 🟢 admin (시스템 탭) + 🔴 폴백 | 동일 |
| 6 | `prompt_mediator_common` | 튜터 발화(모든 모드) 공통 규칙 | 🟢 admin (시스템 탭) + 🔴 폴백 | 동일 |
| 7 | **Confirmation Classifier** | "다음 과제로 넘어갈까요?"에 대한 학생 답 예/아니오 판정 | 🔴 **완전 하드코딩 (admin 칸 없음)** | **admin 슬롯 신설 필요** |
| 8 | `prompt_main_idea_coverage` | Mediator — 핵심 내용 선별 항목 지도 | 🟢 admin (항목별 탭) | — |
| 9 | `prompt_condensation` | Mediator — 정보 압축 항목 지도 | 🟢 admin (항목별 탭) | — |
| 10 | `prompt_content_accuracy` | Mediator — 원문 충실성 항목 지도 | 🟢 admin (항목별 탭) | — |
| 11 | `prompt_paraphrasing` | Mediator — 원문 재진술 항목 지도 | 🟢 admin (항목별 탭) | — |
| 12 | `prompt_organization` | Mediator — paragraph 구조 항목 지도 | 🟢 admin (항목별 탭) | — |
| 13 | `prompt_language_use` | Mediator — 언어 형식 항목 지도 | 🟢 admin (항목별 탭) | — |
| 14 | `knowledge_common` | Mediator — 공통 개념 지식자료 | 🟢 admin (지문 관리 탭) | — |
| 15–20 | `knowledge_{항목}` (6종) | Mediator — 항목별 개념 지식자료 | 🟢 admin (지문 관리 탭) | — |
| — | Descriptor 진단표(6항목·19 descriptor) | Assessor 프롬프트에 주입되는 채점 기준 | ⚪ `src/data/descriptors.json` | (선택) admin 이관 검토 |

> 참고: 1·2·4·5·6·8~20은 시드가 **빈 문자열**이라 지금은 폴백/빈값으로 동작. 운영 전 admin 입력 필요.

---

## B. 레거시 챗봇 프롬프트 (미사용)

| # | 이름(키) | 기능 | 위치 | 조치 |
|---|----------|------|------|------|
| 21 | `system_prompt` | 레거시 챗봇 시스템 페르소나 | 🟢 admin (기본 설정 탭) — **但 호출부 없음** | 아래 D 참조 |
| 22 | `da_prompt` | 레거시 챗봇 첫 DA 지시 메시지 | 🟢 admin (기본 설정 탭) — **但 호출부 없음** | 아래 D 참조 |
| — | `buildSystemPrompt` 래핑 템플릿 | 지문/요약 결합 구조 템플릿 | 🔴 하드코딩(`ai.ts`) | 레거시 전용 → D 참조 |

---

## C. admin 페이지 → 하드코딩 이관이 필요한 항목 (핵심 결론)

"모든 프롬프트를 admin에서 수정"하려면 아래 **2개**를 admin 슬롯으로 올려야 한다.

| 대상 | 현재 위치 | 필요한 작업 |
|------|-----------|-------------|
| **Analysis** (`prompt_analysis`) | `da-pipeline.ts:277` 하드코딩 | ① `prompt_assets`에 `prompt_analysis` 시드 추가 ② PromptsTab 시스템 탭에 슬롯 노출 ③ 폴백문을 기본값으로 |
| **Confirmation Classifier** | `da-pipeline.ts:411` 하드코딩(키 자체 없음) | ① 새 키(예: `prompt_confirmation`) 시드 추가 ② `runConfirmationClassifier`가 `prompts['prompt_confirmation'] || 폴백` 읽도록 수정 ③ 슬롯 노출 |

추가로, 이미 admin 슬롯이 있는 1·2·4·5·6 및 항목/지식 프롬프트는 **폴백 원문을 admin 기본 시드값으로 넣어두면** "가급적 admin 값 사용" 목표가 충족된다(현재는 빈 문자열이라 폴백이 대신 쓰임).

---

## D. 불필요해 보이는 프롬프트 (정리 후보)

| 대상 | 위치 | 왜 불필요한가 | 권장 |
|------|------|----------------|------|
| **`prompt_classifier`** | 🟡 admin 시스템 탭 | Analysis 노드로 병합되어 **코드가 안 읽음** | 슬롯 제거 (또는 `prompt_analysis`로 대체) |
| **`prompt_evaluator`** | 🟡 admin 시스템 탭 | 위와 동일, 미사용 | 슬롯 제거 (또는 `prompt_analysis`로 대체) |
| **`system_prompt`** | 🟢 admin 기본 설정 탭 | 레거시 챗봇 전용인데 호출부 없음(죽은 코드) | 챗봇 재사용 계획 없으면 제거 |
| **`da_prompt`** | 🟢 admin 기본 설정 탭 | 위와 동일 | 위와 동일 |
| **`callAI` / `buildSystemPrompt`** | 🔴 `src/lib/ai.ts` | `submitToAI`/`sendAIMessage`가 어디서도 호출 안 됨 | 관련 서버액션까지 함께 제거 검토 |

> 즉 admin "기본 설정(레거시)" 탭 전체(`system_prompt`+`da_prompt`)와 `prompt_classifier`/`prompt_evaluator` 슬롯이 정리 후보다.
> 반대로 챗봇을 되살릴 계획이면 `submitToAI`/`sendAIMessage`를 UI에 연결해야 한다.

---

## E. 이관 후 이상적인 admin 슬롯 구성 (제안)

**시스템 프롬프트 (7)** — 현재 7개에서 Classifier/Evaluator 제거, Analysis/Confirmation 추가:
`prompt_assessor`, `prompt_assessor_verifier`, `prompt_analysis`(신규), `prompt_reexplainer`, `prompt_deflector`, `prompt_mediator_common`, `prompt_confirmation`(신규)

**항목별 프롬프트 (6)** — 변경 없음

**지식 자료 (7)** — 변경 없음

**기본 설정(레거시) 탭** — 챗봇 폐기 시 삭제

> 이렇게 하면 DA 파이프라인이 LLM에 보내는 **모든** 시스템 프롬프트가 admin에서 편집 가능해지고, 하드코딩 문자열은 "값 미입력 시 폴백" 역할로만 남는다.
