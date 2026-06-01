# 구현 지시문 — DA 튜터 챗봇 (Claude Code용)

**문서 유형:** Claude Code 구현 지시문 (implementation brief)
**작성일:** 2026-06-01
**대상:** 본 저장소(`dynamicsummary`)에서 작업하는 코드 에이전트
**근거 자료:**
- `resource/DA_meeting_notes_0518.md` — 회차 구조 및 v1.5 → v1.6 변경 결정
- `resource/code_llm_collaboration_one_turn/dev_update_post_v1_7_v2.md` — v1.7 이후 LLM 자산/로직
- `resource/code_llm_collaboration_one_turn/descriptors_v2.0.md` — 6개 항목 × 19개 descriptor 정의
- `resource/code_llm_collaboration_one_turn/code_llm_collaboration_one_turn.svg` — one-turn 코드↔LLM 협업 흐름도
- 프로젝트 하네스 `CLAUDE.md`

> **이 지시문의 위상:** `CLAUDE.md`(프로젝트 하네스)를 보완·갱신한다. 충돌 시 본 문서가 우선한다(본 문서가 더 최신 회의 결정을 반영). 구현 완료 후 `CLAUDE.md`도 본 문서에 맞춰 갱신할 것.

---

## 0. 작업 전 필수 확인

1. 본 문서와 위 근거 자료 4종을 모두 읽는다.
2. 기존 `src/` 구조(`CLAUDE.md` 디렉터리 구조 절)와의 차이를 파악한다.
3. 변경의 두 축을 구분한다:
   - **축 A — 학습자 경험(프론트/세션 흐름):** 회차 구조가 5회 → **4 cycle**, cycle마다 **4개 스테이지** 반복.
   - **축 B — LLM 오케스트레이션(백엔드):** 코드(LangGraph류)가 흐름·state를 관장하고, LLM 노드(7종)는 각자 specialist 역할만 수행하는 단일 턴(one-turn) 파이프라인.

---

## PART A. 세션 흐름 — 4 cycle × 4 스테이지

### A-1. 회차 구조 변경 (회의록 A-1)

| 항목 | 기존(CLAUDE.md/v1.5) | 변경 후(구현 대상) |
|------|----------------------|--------------------|
| 회차 구성 | pretest → cycle1 → cycle2 → cycle3 → posttest (5회) | **cycle 1 → cycle 2 → cycle 3 → cycle 4 (4회)** |
| 회차당 시간 | 40분 | **30분** |
| pretest / posttest | 별도 단계 | **폐지** (4 cycle로 통합) |

`lib/phases.ts`의 `PHASES`, `PHASE_LABEL`, `PHASE_GROUPS`를 4 cycle 기준으로 재정의한다. `pretest`/`posttest`/`*_revision`의 공백 페이지 처리 헬퍼(`isBlankPhase`)도 새 구조에 맞게 수정한다.

### A-2. cycle마다 반복되는 4개 스테이지 (핵심)

각 cycle은 아래 4개 스테이지를 **순서대로** 거치며, cycle 간에는 컨텍스트를 단절한다(회의록 A-2: 이전 cycle의 DA 대화/발달 정보를 다음 cycle로 가져오지 않음).

```
[cycle N]
  1. draft        초고(요약문) 작성        — 학생 단독
  2. comprehension 지문 이해도 검사          — 학생 단독 (신규)
  3. da           DA 세션(동적평가)         — 튜터(챗봇/사람) 상호작용
  4. revision     재제출(초고 revise)       — 학생 단독, 피드백 없음(연구 자료)
```

#### 스테이지 1 — `draft` (초고 작성)
- 학생이 지문을 읽고 요약문을 작성·제출. `sessions[sid].data[phase].summary`에 저장.
- 기존 `DraftPhase.tsx` 레이아웃(2컬럼 메인 + 2컬럼 하단, 단어 수 카운트, 노트 자동 저장) 유지.

#### 스테이지 2 — `comprehension` (지문 이해도 검사) — **신규 기능 (회의록 D)**
- **출제 시점:** 학생이 초고를 제출한 직후.
- **문항 수:** cycle별 3–4개(관리자가 사전 입력). **제한 시간:** 최대 3분.
- **조기 종료:** 모든 문항 완료 시 "제출하고 넘어가기" 버튼.
- **그룹별 동작 분기 (반드시 구현):**
  - **챗봇 그룹:** 문항 풀이와 Assessor/Verifier(약 10–30초) 실행을 **병렬** 진행. 문항 완료 또는 시간 초과 시 DA 세션 시작.
  - **사람 튜터 그룹:** 이 검사로 학생 단독 세션을 마무리. 튜터의 글 검토 시간을 확보하고, 튜터/관리자가 준비 완료 후 DA 세션을 **별도로** 시작.
- **관리자 UI:** 각 cycle 지문 등록 슬롯 옆에 해당 cycle용 이해도 문항 입력 슬롯 추가(`PassagesTab` 확장).
  - 문항 형식(객관식/주관식) 세부는 후속 협의 — 우선 **객관식+주관식 모두 입력 가능한 범용 스키마**로 설계하고 형식 필드를 둘 것.

#### 스테이지 3 — `da` (DA 세션 / 동적평가)
- 튜터와의 상호작용. 세션 중 글 수정은 발생하지 않으며(회의록 A-3), 초기 평가·DA 모두 **최초 제출한 글**을 대상으로 한다.
- 챗봇 그룹은 PART B의 LLM 파이프라인으로 구동. 사람 튜터 그룹은 채팅(`wrp_chats`) 기반.
- 레이아웃·탭 규칙은 A-3, A-4 참조.

#### 스테이지 4 — `revision` (재제출)
- DA 세션 종료 후 학생이 초고를 revise하여 제출하는 단계를 "재제출"로 정의.
- **추가 DA·피드백 없음.** 재제출 글은 연구 분석 자료로만 저장. (현재 공백 페이지였던 `*_revision`을 재제출 입력 화면으로 구현)

> **State 영향:** cycle 간 단절(A-2)을 위해, Assessor 입력에서 `이전 회차 mediation_log (optional)` 필드를 제거한다. 각 cycle의 Assessor는 해당 cycle 글만 진단한다.

### A-3. DA 세션 UI (회의록 B)

```
┌──────────────┬──────────────┬──────────┐
│ Reading      │ Summary      │ Chat     │  ← 메인 3컬럼
│ Passage      │ <textarea>   │ Panel    │
├──────────────┴──────────────┴──────────┤
│ Reference Tools (좌우 배치)  │ Notes    │  ← 하단 2컬럼
└──────────────────────────────┴─────────┘
```

- **B-1 상단 단계 표시:** 좌측 상단 *Dynamic Summary* 로고 옆에 전체 cycle 위치(cycle 1/2/3/4) 표시.
- **B-2 참고도구 좌우 배치:** Naver Dictionary와 SKELL을 상하 → **좌우** 배치(SKELL 가림 현상 수정), 너비 조정.

### A-4. 항목별 탭 — **챗봇 그룹 한정** (회의록 B-3)

- 챗봇 그룹에 한해 Chat 패널 상단에 항목별 탭 `#1 / #2 / #3` 추가. **사람 튜터 그룹은 탭 없음**(자연스러운 채팅 흐름 유지).
- 탭 배치: Assessor + Verifier가 최종 결정한 priority_queue 순서(PART B-3).
- 탭 레이블은 **순번만** 표시(항목명·mediation 단계 비노출).
- **Sequential progression 잠금:** 현재 항목의 Resolution 판정 전까지 다음 탭은 `disabled`. Resolution 충족 순간 Mediator의 closing comment + 다음 탭 안내 발화가 트리거되고 다음 탭이 `enabled`로 전환. 마지막 탭 Resolution 시 세션 종료 안내.
- **항목 종료 시 Mediator 발화 흐름:** ① Resolution 확인 후 추가 질문 의사 확인 → ② 질문 있으면 응대 후 재확인 → ③ 없으면 closing comment + 다음 탭 안내.

---

## PART B. LLM 오케스트레이션 — one-turn 협업 시나리오

> **참조 흐름도:** `code_llm_collaboration_one_turn.svg`.
> **대전제(흐름도 핵심 원칙):**
> 1. **코드가 흐름과 state를 관장**하고, **LLM 노드는 자기 specialist 역할만** 수행한다.
> 2. prompt 파일은 **정적 텍스트**이며, 코드가 LLM API 호출 시 **system prompt로 주입**한다.
> 3. state 필드 중 **해당 노드에 필요한 것만** user input으로 추출해 전달한다.

### B-0. 노드 구성 (7종 LLM 노드)

| 노드 | 역할 | 호출 시점 | system prompt |
|------|------|----------|---------------|
| Assessor | 학생 글 진단 → mediation plan(항목별 descriptor severity) | 세션 시작 1회 | `prompt_assessor.txt` |
| Assessor Verifier | Assessor 출력 검증(LLM-as-a-judge) | Assessor 직후, 세션당 최대 2회 | `prompt_assessor_verifier.txt` |
| Classifier | 매 학생 응답을 **3종** 분류 | 매 학생 응답마다 | `prompt_classifier.txt` |
| Evaluator | identification/verbalization 두 boolean 판정 | `on_track` 응답마다 | `prompt_evaluator.txt` |
| Reexplainer | confusion 신호 대응 재설명 | `confusion` 응답마다 | `prompt_reexplainer.txt` |
| Deflector | off_topic/flow_break 대응 | `off_topic` 응답마다 | `prompt_deflector.txt` |
| Mediator | 학생에게 노출되는 발화 생성 | 모든 Mediator 호출마다 | `prompt_mediator_common.txt` + 항목별 + knowledge (B-5) |

> **단일 튜터 페르소나:** 학생에게는 Mediator/Deflector/Reexplainer 모두 **하나의 튜터**로 일관 노출. 내부 노드(Classifier/Evaluator 등)의 판정은 학생에게 비노출.

### B-1. one-turn 데이터 흐름 (흐름도 그대로 구현)

흐름도가 보여주는 한 턴의 정확한 처리 순서. **코드 단계**와 **LLM 호출 단계**를 명확히 분리해 구현한다.

```
[학생 응답 입력]
   └ 코드: latest_student_message를 state에 저장

[코드] Classifier 호출 준비
   └ state에서 필요 필드 추출 → user input 구성
        ↓ 호출
[LLM] Classifier
   system: prompt_classifier.txt
   출력 예: {"classification": "on_track"}
        ↓ 결과 반환
[코드] 결과 파싱 · 라우팅
   on_track   → Evaluator
   confusion  → Reexplainer
   off_topic  → Deflector
        ↓ (on_track 경로)
[코드] Evaluator 호출 준비
   anchor_descriptor, current_step 등 추출 → user input
        ↓ 호출
[LLM] Evaluator
   system: prompt_evaluator.txt
   출력: identification_success + remedial_verbalization_success 판정
        ↓ 결과 반환
[코드] state mutation
   turn_evaluation를 DB 저장
   verbalization=false → current_step +1 (예: 3 → 4)
   (누적 필드 갱신은 B-6)
        ↓
[코드] Mediator 호출 준비
   prompt 4종 결합(mediator_common + item + knowledge×2, B-5)
   필요한 state 필드를 user input으로
        ↓ 호출
[LLM] Mediator
   system: 4개 파일 결합 prompt
   user: state 필드 + 학생 응답
   출력: 발화 텍스트(자연어)
        ↓ 발화 반환
[코드] 발화 전달 · 저장
   messages 테이블 저장 · 학생 UI로 발화 전송
        ↓
interrupt(): 다음 학생 입력까지 정지
```

- `confusion` 경로: Classifier → Reexplainer → (escalate) → 코드 state mutation → Mediator → interrupt.
- `off_topic` 경로: Classifier → Deflector → 발화 반환 → interrupt(Deflector 내부에서 완전무관/queue 내 항목/범위 밖 항목 3케이스 분기는 B-2 참조).
- 각 노드 호출 전후로 **"코드 준비 → LLM 호출 → 코드 파싱/mutation"** 3단 패턴을 일관 적용한다.

### B-2. Classifier 분기 — 4종 → **3종 통합** (회의록 C-1)

| 분류값 | 정의 | 라우팅 |
|--------|------|--------|
| `on_track` | 현재 항목 관련 시도 발화(문제 인지/해결 verbalize 시도 포함) | → Evaluator |
| `confusion` | "모르겠다" 류 명시적 막힘 신호 | → Reexplainer |
| `off_topic` | 현재 흐름과 무관(이전 off_topic + flow_break 통합) | → Deflector |

- 기존 `flow_break`는 `off_topic`으로 흡수. **off_topic vs flow_break 구분은 Deflector 내부에서** 처리(완전 무관 / priority_queue 내 항목 언급 / 범위 밖 항목 언급 3케이스 — v1.5 §4.4 동작 유지).
- Classifier 책임은 표면 신호 식별로 단순화한다.
- **"문제는 파악했으나 해결 방법 미발화" 케이스:** confusion이 아니라 **on_track**으로 분류하고 Evaluator가 `remedial_verbalization_success=false`로 처리(부분 fail → escalate). 명시적 "모르겠어요"만 confusion. (사후 developmental profiling 구분을 위해 라우팅·기록을 분리)

### B-3. Assessor → Priority Selection (dev_update §3)

Assessor + Verifier 완료 직후, **코드가** mediation 대상 상위 3개 항목을 선정한다.

```
Assessor 출력(6항목 × descriptor severity)
  → [코드] 항목별 priority_score 계산
  → [코드] score 내림차순 정렬
  → [코드] 상위 3개 → priority_queue
  → 탭 #1/#2/#3 순서 배정
```

**score 계산식:**
```python
priority_score(item) = sum(severity_weight[d.severity] for d in item.detected_descriptors) * group_multiplier(item)
severity_weight = {"high": 3, "medium": 2, "low": 1}
group_multiplier = {
    "main_idea_coverage": 2.0, "condensation": 2.0, "content_accuracy": 2.0,  # content macro
    "paraphrasing": 2.0,                                                       # content micro
    "organization": 1.0,                                                       # task-specific
    "language_use": 1.0,                                                       # language
}
```

- **가중치·tie-break 순서는 하드코딩 금지 → config로 분리**(추후 실험에 따라 조정).
- **tie-break 기본 순서:** content > content(task-specific) > language → content 내부 macro > micro → macro 내부 main_idea_coverage > condensation > content_accuracy.
- **language_use 예외(affects_meaning boost):** Assessor 출력 JSON에서 `language_use`에 한해 `affects_meaning` 필드를 추가. `true`이면 `group_multiplier["language_use"]=2.0`로 상승. 판정 기준: 언어 오류로 의미 오해/핵심 불명확 → true, 단순 문법 오류로 의미 지장 없음 → false. **이 기준을 Assessor prompt에 명시.**

### B-4. Assessor Verifier — 2회 fail 정책 (회의록 C-3)

```
1차 Verifier pass → 정상 진행 (신뢰도 high)
1차 fail → Assessor 재호출(verification_notes를 추가 컨텍스트로 전달)
2차 pass → 2차 Assessor 출력 채택 (신뢰도 medium)
2차 fail →
   ├ 1차 Assessor 출력 채택 (deterministic fallback)
   ├ 세션 데이터에 진단 신뢰도 "low" 기록
   ├ 1차/2차 Assessor 출력 + 두 Verifier notes 모두 DB 저장
   └ 정상 진행 (학생 경험 불변)
```
신뢰도 3단계: `high`(1차 pass) / `medium`(재시도 후 pass) / `low`(2회 fail fallback). 연구자가 `low_confidence_diagnosis` 케이스를 사후 분석할 수 있게 메타데이터 보존.

### B-5. Mediator system prompt 결합 구조 (dev_update §2, §5)

```
system_prompt =
    prompt_mediator_common.txt        # 공통 행동 규칙
  + prompt_{current_item}.txt         # 현재 항목 발화 패턴(6종 중 1)
  + knowledge_common.txt              # 공통 개념 자료
  + knowledge_{current_item}.txt      # 현재 항목 개념 자료(7종 중 1)
```
- **RAG(vector retrieval) 금지.** knowledge 파일은 **매 턴 전체를 system prompt에 직접 concatenate**한다. 기존 구현이 RAG면 concatenation으로 변경.
- **자산 총 20개:** system prompts 7 + 항목별 prompt 6 + knowledge 7. 관리자 UI prompt 슬롯을 이 20개 자산 구조로 확장(슬롯 설계는 개발자 재량).

### B-6. Evaluator 누적 판정 State 필드 (dev_update §4)

명세상 "한 번 true로 판정된 조건은 동일 세션 내 해제되지 않는다"를 구현하기 위한 신규 state 필드.

```python
item_identification_cumulative: bool   # 현재 항목에서 identification_success가 한 번이라도 true였는가
item_verbalization_cumulative: bool    # 현재 항목에서 remedial_verbalization_success가 한 번이라도 true였는가
```

| 시점 | 처리 |
|------|------|
| 항목 진입(Session Manager) | 두 필드 `false` 초기화 |
| Evaluator가 조건 true 판정 | Session Manager가 해당 필드 `true` set |
| 다음 항목 진입 | 두 필드 `false` 리셋 |

Evaluator 호출 시 user input에 `identification_already_true`, `verbalization_already_true`를 포함. prompt 규칙: 이미 true인 조건은 **재판정 없이 true 유지**, false인 조건만 학생 최신 응답으로 새로 판정. (없으면 step2에서 identification 달성한 학생이 step3에서 verbalization만 시도했을 때 identification이 false로 뒤집히는 버그 발생)

### B-7. Resolution 판정 (회의록 C-2)

두 조건이 **모두 true**여야 해당 항목 resolution 처리 → 다음 탭 활성화.

| 조건 | 의미 | 판정 주체 |
|------|------|----------|
| `identification_success` | 학생이 자기 글 문제를 자기 언어로 인지 | Evaluator |
| `remedial_verbalization_success` | 학생이 수정 방법을 자기 언어로 진술 | Evaluator |

- 한 번 true 판정된 조건은 동일 세션 내 해제 안 됨(B-6 누적 필드로 보장).
- DA 중 실제 글 수정은 없으므로 "문제 해결"은 글 변화가 아닌 **학생의 verbalize 능력**으로 operationalize. 실제 수정 성공은 재제출 글로 연구자가 사후 분석(챗봇 역할 범위 밖).

### B-8. Descriptor 체계 (descriptors_v2.0)

- **6항목 × 총 19 descriptor.** Assessor는 각 descriptor를 binary 판정 + severity(high/medium/low) 부여, evidence(problem_location, evidence text, missing_content) 기록.
- **Assessor prompt에 19개 descriptor 전체를 명시적으로 열거**(항목명만 주고 LLM 추론에 의존 금지).
- **권장 구현:** `descriptors.json`으로 변환, 런타임 로드 후 Assessor/Verifier prompt에 주입.
- 같은 문장이 여러 항목 descriptor에 동시 탐지될 수 있음(다각도 진단, 중복 아님). 각 descriptor는 해당 항목 Mediator prompt의 단계별 mediation 진입점.

| 항목 | descriptor | 분류 |
|------|-----------|------|
| `main_idea_coverage` | key_idea_omission, idea_unit_misidentification, superordination_failure (3) | content |
| `condensation` | non_essential_inclusion, redundant_inclusion, source_length_proximity (3) | content |
| `content_accuracy` | meaning_distortion, personal_opinion_insertion (2) | content |
| `paraphrasing` | verbatim_copying, patchwriting, limited_transformation (3) | content(micro) |
| `organization` | topic_sentence_absence, topic_sentence_inadequacy, concluding_sentence_absence, supporting_structure_weakness, internal_coherence_failure (5) | task-specific |
| `language_use` | grammatical_error, lexical_error, sentence_structure_error (3) | language |

---

## PART C. 데이터 모델 변경 요약

기존 `CLAUDE.md`의 localStorage 모델(`wrp_` prefix)을 아래와 같이 확장한다.

- `wrp_passages`: cycle별 **이해도 검사 문항** 필드 추가(문항 배열 + 형식 필드).
- `wrp_sessions` / `PhaseData`: `comprehension`(이해도 검사 응답·소요시간), `revision`(재제출 글), `messages`(챗봇 DA 발화) 보존.
- 진단 신뢰도(`diagnosis_confidence: high|medium|low`) + 1차/2차 Assessor 출력 + Verifier notes 저장 필드.
- Evaluator 누적 필드(`item_identification_cumulative`, `item_verbalization_cumulative`)는 항목 진행 중 state로 관리.
- `priority_queue`(상위 3개 항목 + 탭 배정) 저장.
- Assessor 입력에서 **이전 cycle mediation_log 참조 제거**(cycle 단절).

> 백엔드를 Supabase로 옮길 경우 위 필드를 컬럼/테이블로 매핑(§8 DB 스키마 — 구체 설계는 개발자 작업).

---

## PART D. 구현 순서(권장)

1. `lib/phases.ts` — 4 cycle × {draft, comprehension, da, revision} 구조로 재정의.
2. 데이터 모델 확장(PART C) — types + 저장 헬퍼.
3. 스테이지 화면: `DraftPhase`(유지) → `ComprehensionPhase`(신규) → `DASession`(탭/레이아웃 갱신) → `RevisionPhase`(재제출).
4. 관리자: `PassagesTab`에 이해도 문항 슬롯, prompt 슬롯 20개 자산 구조 확장.
5. LLM 오케스트레이션(축 B): Assessor → Verifier(2회 정책) → Priority Selection → Classifier(3종) → Evaluator(누적 필드) → Reexplainer/Deflector → Mediator(4종 결합) → interrupt. one-turn 흐름(B-1)을 단위 함수로 분리.
6. `descriptors.json` 생성 및 prompt 주입.
7. 그룹 분기(챗봇 병렬 / 사람 튜터 별도 시작) 처리.

## PART E. 검증 체크리스트

- [ ] cycle이 4개이고 각 cycle이 draft → comprehension → da → revision 순으로 전이되는가
- [ ] cycle 간 컨텍스트가 단절되는가(이전 cycle mediation_log 미참조)
- [ ] 이해도 검사가 챗봇=병렬 / 사람튜터=별도시작으로 분기되는가
- [ ] Classifier가 3종만 출력하고 flow_break가 Deflector 내부로 이동했는가
- [ ] Priority score·tie-break·affects_meaning boost가 config화되었는가
- [ ] Verifier 2회 fail 시 1차 출력 fallback + 신뢰도 low 기록 + notes 보존이 되는가
- [ ] Mediator가 4개 파일 concatenation(RAG 아님)으로 prompt를 구성하는가
- [ ] Evaluator 누적 필드로 한 번 true인 조건이 뒤집히지 않는가
- [ ] Resolution(두 조건 모두 true) 충족 시에만 다음 탭이 enabled 되는가(챗봇 한정)
- [ ] one-turn 흐름이 "코드 준비 → LLM 호출 → 코드 파싱/mutation → interrupt" 패턴을 따르는가
- [ ] 단일 튜터 페르소나 유지 + 내부 노드 비노출이 지켜지는가

---

*문서 끝*
