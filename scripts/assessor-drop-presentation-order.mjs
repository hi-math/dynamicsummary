// prompt_assessor 에서 제시 순서 결정을 걷어낸다.
//
//   node scripts/assessor-drop-presentation-order.mjs           # 미리보기
//   node scripts/assessor-drop-presentation-order.mjs --apply   # DB 반영
//
// 배경: Step 5 는 HOC → Mid → LOC 로 배열하라고 지시했지만, 저장된 assessor_output
// 8건 중 6건이 presentation_order 를 problem_priority 와 똑같이 냈다(= Step 5 미실행).
// 그래서 순서 결정을 코드로 옮겼다 — src/lib/da-state.ts 의 ITEM_LEVEL + sortAssessment().
// 프롬프트는 이제 '무엇을 고르고 얼마나 심각한가'(item + problem_priority)만 판단한다.
//
// 바뀌는 곳: Step 4 의 마지막 문단, Step 5 전체, Step 6 의 필드 목록.
// 진단 절차(Step 1~3)의 판단 기준은 손대지 않는다.
// 이전 본문은 backup-prompts-0810/prompt_assessor.<timestamp>.txt 로 백업한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

// ── 1. Step 5 를 통째로 들어낸다 (Step 6 제목 직전까지) ──
const STEP5_FROM = `### Step 5. Determine \`presentation_order\`

Use the following instructional sequence:

- **Higher-order Concerns**
  - \`main_idea_coverage\`
  - \`condensation\`
  - \`content_accuracy\`
- **Mid-Level**
  - \`organization\`
  - \`paraphrasing\`
- **Lower-order Concerns**
  - \`language_use\`

Arrange selected items in the order: HOC → Mid-Level → LOC.

Within the same instructional level, follow \`problem_priority\`.

Assign unique consecutive \`presentation_order\` values from 1 to N and return \`selected_items\` in ascending \`presentation_order\`.

### Step 6. Generate the Output`;

const STEP5_TO = `### Step 5. Generate the Output`;

// ── 2. Step 4 끝에 "순서는 네 일이 아니다" 를 명시한다 ──
const PRIORITY_FROM = `Assign unique consecutive integers from 1 to N:
- 1 = highest relative mediation need
- 2 = next
- 3 = next

Do not assign ties.`;

const PRIORITY_TO = `Assign unique consecutive integers from 1 to N:
- 1 = highest relative mediation need
- 2 = next
- 3 = next

Do not assign ties.

\`problem_priority\` is a severity judgment only. It is not the order in which the
items will be presented to the student. The system arranges the selected items into
the feedback sequence by instructional level (higher-order concerns first) and uses
\`problem_priority\` only to break ties within the same level. Do not attempt to
sequence the session yourself, and do not return an ordering field.`;

// ── 3. Step 6(→5) 의 필드 목록에서 presentation_order 를 뺀다 ──
const FIELDS_FROM = `1. **item** — One of: \`main_idea_coverage\`, \`condensation\`, \`content_accuracy\`, \`paraphrasing\`, \`organization\`, \`language_use\`
2. **problem_priority** — Relative mediation priority among the selected items.
3. **presentation_order** — Actual order in which the item should be presented.
4. **problem_description**`;

const FIELDS_TO = `1. **item** — One of: \`main_idea_coverage\`, \`condensation\`, \`content_accuracy\`, \`paraphrasing\`, \`organization\`, \`language_use\`
2. **problem_priority** — Relative mediation priority among the selected items.
3. **problem_description**`;

// 필드 번호 4~9 → 3~8 로 당긴다.
const RENUMBER = [
  ['5. **student_text_evidence**', '4. **student_text_evidence**'],
  ['6. **selection_rationale**', '5. **selection_rationale**'],
  ['7. **mediation_focus**', '6. **mediation_focus**'],
  ['8. **PI_goal**', '7. **PI_goal**'],
  ['9. **PSV_goal**', '8. **PSV_goal**'],
];

const rows = await (await fetch(
  `${URL_}/rest/v1/prompt_assets?select=key,content,updated_at&key=eq.prompt_assessor`,
  { headers: H },
)).json();
const cur = rows[0]?.content ?? '';
if (!cur) throw new Error('prompt_assessor 를 찾지 못했습니다.');
console.log(`현재 본문: ${cur.length}자 (updated_at ${rows[0].updated_at})`);

/** 정확히 한 번 나오는 문자열만 치환한다. 어긋나면 멈춘다 — 프롬프트는 손으로도 고쳐지므로. */
function replaceOnce(text, from, to, label) {
  const parts = text.split(from);
  if (parts.length === 1) throw new Error(`[${label}] 대상 문자열을 찾지 못했습니다. 프롬프트가 이미 수정된 것은 아닌지 확인하세요.`);
  if (parts.length > 2) throw new Error(`[${label}] 대상 문자열이 ${parts.length - 1}번 나옵니다. 수동 확인이 필요합니다.`);
  return parts.join(to);
}

let next = cur;
next = replaceOnce(next, PRIORITY_FROM, PRIORITY_TO, 'Step 4 꼬리');
next = replaceOnce(next, STEP5_FROM, STEP5_TO, 'Step 5 제거');
next = replaceOnce(next, FIELDS_FROM, FIELDS_TO, '필드 목록');
for (const [from, to] of RENUMBER) next = replaceOnce(next, from, to, `번호 ${from}`);

if (next.includes('presentation_order')) {
  throw new Error(`아직 presentation_order 가 ${next.split('presentation_order').length - 1}곳 남아 있습니다. 수동 확인이 필요합니다.`);
}

const dir = path.join(ROOT, 'backup-prompts-0810');
fs.mkdirSync(dir, { recursive: true });
const stamp = String(rows[0].updated_at).replace(/[:.]/g, '-');
fs.writeFileSync(path.join(dir, `prompt_assessor.${stamp}.txt`), cur);
console.log(`백업: backup-prompts-0810/prompt_assessor.${stamp}.txt`);
console.log(`신규 본문: ${next.length}자 (${next.length - cur.length})`);

if (!APPLY) {
  fs.writeFileSync(path.join(dir, 'prompt_assessor.preview.txt'), next);
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.');
  console.log('미리보기: backup-prompts-0810/prompt_assessor.preview.txt');
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_assessor`, {
  method: 'PATCH',
  headers: { ...H, Prefer: 'return=minimal' },
  body: JSON.stringify({ content: next, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`DB 반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
