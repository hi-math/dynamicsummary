# Writing Research Platform — 프로젝트 하네스

## 프로젝트 개요

학생의 글쓰기 능력 향상을 연구하기 위한 웹 플랫폼. 학생이 지문 요약 과제를 수행하고, AI 챗봇 또는 멘토로부터 동적 평가(Dynamic Assessment)를 받는다. 두 집단(챗봇팀 vs 휴먼팀)의 결과를 비교하는 연구 설계다.

---

## 페르소나 (3종)

| 페르소나 | 역할 |
|----------|------|
| `admin` | 계정 관리, API 설정, 프롬프트 작성, 지문 등록, 데이터 열람 |
| `mentor` | 휴먼팀 학생과 채팅으로 동적 평가 제공 |
| `student` | 지문 읽기 → 요약 작성 → 피드백 수신 → 수정 반복 |

로그인은 **아이디만 입력** (비밀번호 없음). 아이디로 페르소나를 구분한다.

---

## 연구 흐름 (Phase)

```
프리테스트 → 사이클1(드래프트 → 동적평가 → 리비전) → 사이클2 → 사이클3 → 포스트테스트
```

| Phase 키 | 화면 |
|----------|------|
| `pretest` | 공백 페이지 (추후 구현) |
| `cycle1_draft` | 드래프트 작성 화면 |
| `cycle1_da` | 동적평가 세션 (메인 레이아웃) |
| `cycle1_revision` | 공백 페이지 (추후 구현) |
| `cycle2_draft` | 드래프트 작성 화면 |
| `cycle2_da` | 동적평가 세션 |
| `cycle2_revision` | 공백 페이지 |
| `cycle3_draft` | 드래프트 작성 화면 |
| `cycle3_da` | 동적평가 세션 |
| `cycle3_revision` | 공백 페이지 |
| `posttest` | 공백 페이지 (추후 구현) |

> **현재 범위:** `pretest`, `posttest`, `*_revision` 은 공백 페이지로 구현한다.
> 드래프트 및 DA 세션은 완전히 구현한다.

---

## 기술 스택

- **프레임워크:** next.js
- **스타일:** Tailwind CSS
- **상태/DB:** Supabase
- **라우팅:** React Router v6
- **AI API:** OpenAI / Anthropic / Google Gemini (관리자가 선택)
- **언어:** TypeScript

> Anthropic API는 브라우저 CORS 제한이 있으므로 주석으로 명시한다.

---

## 디렉터리 구조

```
src/
├── main.tsx
├── App.tsx                      # 라우터 설정
├── store/
│   ├── useAppStore.ts           # Zustand 전역 상태 (currentUser)
│   ├── useDBStore.ts            # localStorage CRUD 헬퍼
│   └── types.ts                 # 공통 타입 정의
├── lib/
│   ├── phases.ts                # PHASES 배열, PHASE_LABEL, 헬퍼 함수
│   ├── ai.ts                    # callAI / callOpenAI / callAnthropic / callGemini
│   └── chat.ts                  # 휴먼팀 채팅 localStorage 채널 헬퍼
├── pages/
│   ├── LoginPage.tsx
│   ├── admin/
│   │   ├── AdminLayout.tsx      # 사이드바 + 콘텐츠 레이아웃
│   │   ├── UsersTab.tsx         # 계정 CRUD + 단계 설정
│   │   ├── APITab.tsx           # 제공사/키/모델 선택
│   │   ├── PromptsTab.tsx       # 시스템·DA 프롬프트 편집
│   │   ├── PassagesTab.tsx      # 사이클별 지문 등록
│   │   └── DataTab.tsx          # 학생 데이터 열람 + JSON 내보내기
│   ├── student/
│   │   ├── StudentRouter.tsx    # phase → 컴포넌트 라우팅
│   │   ├── BlankPhase.tsx       # pretest / revision / posttest
│   │   ├── DraftPhase.tsx       # 드래프트 작성 (지문 + 요약 텍스트 에어리어)
│   │   └── DASession.tsx        # 동적평가 세션 (메인 3+2 레이아웃)
│   └── mentor/
│       ├── MentorLayout.tsx     # 학생 목록 사이드바 + 채팅 영역
│       └── MentorChat.tsx       # 실시간(폴링) 채팅 컴포넌트
└── components/
    ├── Navbar.tsx
    ├── PhaseBar.tsx             # 진행 단계 시각화
    ├── panels/
    │   ├── ReadingPassagePanel.tsx
    │   ├── SummaryPanel.tsx
    │   ├── ChatPanel.tsx        # AI 채팅 + Sidebar 탭
    │   ├── ReferenceToolsPanel.tsx
    │   └── NotesPanel.tsx
    └── ui/
        ├── Badge.tsx
        ├── Modal.tsx
        └── Notification.tsx
```

---

## 데이터 모델 (localStorage 키 prefix: `wrp_`)

### `wrp_users` — User[]
```typescript
type User = {
  id: string;           // 로그인 아이디
  name: string;
  role: 'admin' | 'mentor' | 'student';
  team: 'chatbot' | 'human' | null;
};
```

### `wrp_api` — APISettings
```typescript
type APISettings = {
  provider: 'openai' | 'anthropic' | 'gemini';
  openaiKey: string;
  openaiModel: string;  // 'gpt-4o' | 'gpt-4o-mini' | ...
  anthropicKey: string;
  anthropicModel: string; // 'claude-opus-4-6' | ...
  geminiKey: string;
  geminiModel: string;  // 'gemini-1.5-pro' | ...
};
```

### `wrp_prompts` — Prompts
```typescript
type Prompts = {
  system: string;   // AI 시스템 프롬프트
  da: string;       // 동적평가 초기 평가 지시
};
```

### `wrp_passages` — PassageMap
```typescript
type PassageMap = {
  [key in 'pretest' | 'cycle1' | 'cycle2' | 'cycle3' | 'posttest']: {
    title: string;
    content: string;
  };
};
```

### `wrp_sessions` — SessionMap
```typescript
type PhaseData = {
  summary?: string;
  notes?: string;
  submittedAt?: string;
  messages?: ChatMessage[];   // 챗봇팀 AI 채팅 기록
};

type StudentSession = {
  phase: string;             // 현재 단계 (PHASES 중 하나)
  data: Record<string, PhaseData>;
};

type SessionMap = Record<string, StudentSession>; // key: studentId
```

### `wrp_chats` — ChatChannelMap (휴먼팀 전용)
```typescript
type ChatMessage = {
  sender: string;    // userId
  content: string;
  timestamp: number;
};

type ChatChannelMap = {
  [key: `student_${string}`]: ChatMessage[];
};
```

---

## 화면 명세

### 1. 로그인 페이지 (`/`)
- 아이디 입력 필드 하나
- Enter 또는 버튼으로 로그인
- 존재하지 않는 아이디면 에러 메시지
- 로그인 성공 시 역할에 따라 리다이렉트:
  - admin → `/admin`
  - mentor → `/mentor`
  - student → `/student`

### 2. 관리자 페이지 (`/admin`)

좌측 사이드바 + 우측 콘텐츠 레이아웃.

#### 2-1. 계정 관리 탭
- 신규 계정 추가 폼: 아이디, 이름, 역할(select), 팀(select)
- 계정 목록 테이블: 아이디, 이름, 역할 badge, 팀 badge, 현재 단계, 관리 버튼
- 관리 버튼:
  - `→ 다음 단계`: 학생의 phase를 nextPhase()로 한 단계 전진
  - `단계 설정`: select로 임의 단계 지정 (모달)
  - `✏️ 수정`: 이름/역할/팀 수정 (모달)
  - `삭제`: confirm 후 삭제 (admin 계정은 삭제 불가)

#### 2-2. API 설정 탭
- 제공사 선택 (OpenAI / Anthropic / Gemini)
- 선택된 제공사의 API Key 입력 (password 타입)
- 모델 선택 드롭다운
- Anthropic은 CORS 경고 표시
- 저장 버튼

#### 2-3. 프롬프트 탭
- 시스템 프롬프트 텍스트에어리어
- 동적평가(DA) 초기 프롬프트 텍스트에어리어
- 저장 버튼

#### 2-4. 지문 관리 탭
- pretest, cycle1, cycle2, cycle3, posttest 각각:
  - 제목 input
  - 내용 textarea (여러 줄)
  - 개별 저장 버튼

#### 2-5. 데이터 조회 탭
- 학생별 카드:
  - 이름, 아이디, 팀, 현재 단계
  - 제출된 phase 데이터 (요약문 미리보기, 채팅 수)
  - JSON 내보내기 버튼 (브라우저 다운로드)

### 3. 학생 페이지 (`/student`)

상단: Navbar + PhaseBar (5개 그룹: 프리테스트 / 사이클1 / 사이클2 / 사이클3 / 포스트테스트)

현재 phase에 따라 아래 화면 중 하나를 표시한다.

#### 3-1. 공백 페이지 (pretest / *_revision / posttest)
- 가운데 정렬 아이콘 + 단계명 + 안내 문구
- "이 세션은 준비 중입니다. 관리자의 안내에 따라 진행해주세요."

#### 3-2. 드래프트 화면 (cycle*_draft)
레이아웃: 2컬럼 메인 + 2컬럼 하단

```
┌──────────────────┬──────────────────┐
│  Reading Passage │  Summary (초안)  │
│  (스크롤)        │  <textarea>      │
│                  │  [단어수] [제출] │
├──────────────────┼──────────────────┤
│  Reference Tools │  Notes           │
│  Naver Dict SKELL│  <textarea>      │
└──────────────────┴──────────────────┘
```

- 제출 버튼: 요약문을 `sessions[sid].data[phase].summary`에 저장
- 단어 수 실시간 카운트
- 노트는 blur 시 자동 저장

#### 3-3. 동적평가 세션 (cycle*_da) — 메인 레이아웃

**첨부 스크린샷 레이아웃을 따른다.**

```
┌──────────────┬──────────────┬──────────┐
│ Reading      │ Summary      │ AI Chat  │  ← 메인 3컬럼 (flex-grow)
│ Passage      │ <textarea>   │ [AI Chat │
│              │ [단어수]     │  Sidebar]│
│              │ [제출]       │ <msgs>   │
│              │              │ <input>  │
├──────────────┴──────────────┴──────────┤
│ Reference Tools          │ Notes       │  ← 하단 2컬럼 (고정 높이)
│ [Naver Dictionary] [SKELL]│ <textarea> │
└──────────────────────────┴─────────────┘
```

**Chat Panel 상세:**
- 상단 탭: `AI Chat` / `Sidebar`
- 우상단: 연결 상태 표시 (AI 연결 / 멘토 연결)
- 챗봇팀: AI API 호출, 메시지 기록은 `sessions[sid].data[phase].messages`에 저장
- 휴먼팀: `wrp_chats.student_{sid}` 채널로 메시지 교환, 1.8초 폴링으로 갱신
- `Sidebar` 탭: 요약 작성 가이드 + 진행 상황 표시

**Submit 버튼 동작:**
- 챗봇팀: summary 저장 후 AI에게 DA 프롬프트 포함 첫 평가 요청
- 휴먼팀: summary 저장 (멘토가 채팅으로 별도 피드백 제공)

**Reference Tools:**
- `Naver Dictionary` → `https://dict.naver.com/` 새 탭
- `SKELL` → `https://skell.sketchengine.eu/` 새 탭

### 4. 멘토 페이지 (`/mentor`)

```
┌─────────────────┬────────────────────────────────┐
│ 담당 학생 목록  │ 채팅 영역                       │
│ (휴먼팀만)      │ [학생명 + 현재 단계]            │
│                 │                                  │
│ [학생A] C1 DA  │ <메시지 목록>                   │
│ [학생B] C2 DA  │                                  │
│                 │ [입력창] [전송]                  │
└─────────────────┴────────────────────────────────┘
```

- 학생 선택 시 `wrp_chats.student_{sid}` 채널의 메시지 표시
- 전송 시 `sender: mentorId` 로 메시지 append
- 1.8초 폴링으로 학생 메시지 실시간 수신
- 아직 선택된 학생이 없으면 안내 문구 표시

---

## AI 호출 명세

```typescript
// lib/ai.ts

async function callAI(
  messages: {role: 'user'|'assistant', content: string}[],
  passageContent: string,
  summary: string,
  prompts: Prompts,
  api: APISettings
): Promise<string>
```

**시스템 프롬프트 구성:**
```
{prompts.system}

---
[현재 지문]
{passageContent}

[학생의 요약문]
{summary}
```

**첫 번째 AI 호출 (Submit 시):**
- messages = `[{ role: 'user', content: prompts.da }]`

**이후 채팅:**
- messages = 누적된 대화 기록

**각 제공사 엔드포인트:**

| 제공사 | URL |
|--------|-----|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1/messages` ⚠️ CORS 주의 |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}` |

---

## Phase 헬퍼 (lib/phases.ts)

```typescript
export const PHASES = [
  'pretest',
  'cycle1_draft', 'cycle1_da', 'cycle1_revision',
  'cycle2_draft', 'cycle2_da', 'cycle2_revision',
  'cycle3_draft', 'cycle3_da', 'cycle3_revision',
  'posttest'
] as const;

export type Phase = typeof PHASES[number];

export const PHASE_LABEL: Record<Phase, string> = {
  pretest: '프리테스트',
  cycle1_draft: 'C1 드래프트',
  cycle1_da: 'C1 동적평가',
  cycle1_revision: 'C1 리비전',
  // ...
};

export const PHASE_GROUPS = [
  { key: 'pretest',  label: '프리테스트',  phases: ['pretest'] },
  { key: 'cycle1',   label: '사이클 1',    phases: ['cycle1_draft','cycle1_da','cycle1_revision'] },
  { key: 'cycle2',   label: '사이클 2',    phases: ['cycle2_draft','cycle2_da','cycle2_revision'] },
  { key: 'cycle3',   label: '사이클 3',    phases: ['cycle3_draft','cycle3_da','cycle3_revision'] },
  { key: 'posttest', label: '포스트테스트', phases: ['posttest'] },
];

export function nextPhase(p: Phase): Phase { ... }
export function prevPhase(p: Phase): Phase { ... }
export function isBlankPhase(p: Phase): boolean {
  return p === 'pretest' || p === 'posttest' || p.endsWith('_revision');
}
export function isDraftPhase(p: Phase): boolean { return p.endsWith('_draft'); }
export function isDAPhase(p: Phase): boolean { return p.endsWith('_da'); }
export function cycleKeyFromPhase(p: Phase): string {
  return p.replace('_draft','').replace('_da','').replace('_revision','');
}
```

---

## 초기 데이터

앱 최초 실행 시 localStorage에 아래 데이터를 seed한다 (`wrp_init` 키로 중복 방지).

```typescript
users: [{ id: 'admin', name: '관리자', role: 'admin', team: null }]

api: {
  provider: 'openai',
  openaiKey: '', openaiModel: 'gpt-4o',
  anthropicKey: '', anthropicModel: 'claude-opus-4-6',
  geminiKey: '', geminiModel: 'gemini-1.5-pro'
}

prompts: {
  system: '당신은 학생의 영어 글쓰기 능력 향상을 돕는 교육 보조 AI입니다...',
  da: '학생이 지문을 요약한 내용을 검토해주세요...'
}

passages: {
  pretest: { title: '', content: '' },
  cycle1:  { title: '', content: '' },
  cycle2:  { title: '', content: '' },
  cycle3:  { title: '', content: '' },
  posttest: { title: '', content: '' }
}
```

---

## 구현 순서 (권장)

1. `lib/phases.ts` — Phase 정의 및 헬퍼
2. `store/types.ts` + `store/useDBStore.ts` — 데이터 모델 및 localStorage 헬퍼
3. `store/useAppStore.ts` — currentUser 전역 상태
4. `lib/chat.ts` — 휴먼팀 채팅 채널 헬퍼
5. `lib/ai.ts` — AI API 호출 함수
6. `App.tsx` — 라우터 + 보호 라우트 (role guard)
7. `pages/LoginPage.tsx`
8. `components/Navbar.tsx` + `components/PhaseBar.tsx`
9. `pages/admin/*` — AdminLayout + 5개 탭
10. `components/panels/*` — 재사용 패널 컴포넌트
11. `pages/student/*` — StudentRouter + BlankPhase + DraftPhase + DASession
12. `pages/mentor/*` — MentorLayout + MentorChat

---

## 기타 요구사항

- 반응형: 960px 이하에서는 사이클 레이아웃을 단일 컬럼으로 전환
- 노트 및 요약문은 `blur` 이벤트 시 자동 저장 (별도 저장 버튼 없어도 됨)
- 관리자 계정(`id: 'admin'`)은 삭제 불가
- 알림(toast): 저장 성공/실패, 단계 이동 등 사용자 액션 후 피드백 제공
- 챗봇팀 학생의 채팅은 `DASession` 컴포넌트 언마운트 후에도 `sessions` 데이터에 보존됨
- 멘토는 자신의 팀(`team === 'human'`)에 속한 학생만 목록에 표시
