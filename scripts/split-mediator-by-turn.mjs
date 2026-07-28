// prompt_mediator_common 을 턴별 자산으로 분해한다.
//
//   node scripts/split-mediator-by-turn.mjs           # 미리보기
//   node scripts/split-mediator-by-turn.mjs --apply   # DB 반영
//
// 만드는 것:
//   prompt_style          공통 말투 규칙 — 코드가 모든 발화 턴 앞에 붙인다 (중복 제거용)
//   prompt_mediation      on_track step 1~4
//   prompt_provision      on_track step 5 (explicit provision, terminal)
//   prompt_confirm_invite 전환 확인 질문
//   prompt_post_confirm   continue_help 뒤 직접 설명 1회
//   prompt_closing        세션 종료 안내 (마지막 탭 확인 완료 시)
//
// 고치는 것:
//   prompt_opening / prompt_recovery 에서 말투 규칙 제거 (prompt_style 로 이관)
//
// 지우는 것:
//   prompt_mediator_common  (분해 완료 후)
//     - `### final_question_answer` 는 이관하지 않는다 (종료 질의응답 폐지)
//     - `### opening` / `### confusion_rephrase` / `### off_topic_redirect` 는 이미 분리됨
//
// 원문 절은 그대로 옮긴다. 새로 쓰거나 고친 부분은 [AUTHORED] 로 표시했다.

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

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const map = Object.fromEntries(rows.map((r) => [r.key, r.content ?? '']));
const med = map['prompt_mediator_common'] ?? '';
if (!med) throw new Error('prompt_mediator_common 이 없습니다. 이미 분해했다면 다시 실행하지 마세요.');

// ── 원문 절 추출 ──────────────────────────────────────────────────────────────
const HEADS = [...med.matchAll(/^#{2,3} .*$/gm)].map((m) => ({ i: m.index, text: m[0] }));
function section(head) {
  const k = HEADS.findIndex((h) => h.text.startsWith(head));
  if (k === -1) throw new Error(`절을 찾지 못했습니다: ${head}`);
  const end = HEADS[k + 1]?.i ?? med.length;
  return med.slice(HEADS[k].i, end).replace(/\s*---\s*$/, '').trimEnd();
}
/** `## X` 와 그 아래 `### ...` 하위 절까지 통째로 */
function block(head, nextTopHead) {
  const a = med.indexOf(head);
  const b = med.indexOf(nextTopHead);
  if (a === -1 || b === -1) throw new Error(`블록을 찾지 못했습니다: ${head}`);
  return med.slice(a, b).replace(/\s*---\s*$/, '').trimEnd();
}

const role = section('## Role');
const categoryRel = section('## Relationship with category-specific guidance');
const piPsv = block('## PI and PSV', '## Five mediation steps');
const fiveSteps = block('## Five mediation steps', '## General utterance style');
const style = section('## General utterance style');
const sourceHandling = section('## Handling source and reference materials');
const missingInputs = section('## Missing or irrelevant inputs');

const onTrack = section('### `on_track_continue`');
const confirmInvite = section('### `confirmation_invite`');
const provision = section('### `explicit_provision`');
const postConfirm = section('### `post_confirmation_help`');
const closing = section('### `session_closing_invite`');

// ── 공통 조각 ────────────────────────────────────────────────────────────────
// [AUTHORED] 출력 형식. 원문 `## Output format` 은 {"utterance": "..."} JSON 을 요구하지만
// 코드는 응답 문자열을 그대로 발화로 쓰므로 평문으로 통일한다.
const OUTPUT = `## Output format

Return the tutor utterance itself as plain text — one Korean tutor utterance.

Do not return JSON, Markdown, code fences, quotation marks around the whole utterance,
labels, or any commentary.`;

// [AUTHORED] 말투 규칙이 별도 자산(prompt_style)으로 빠졌음을 알리는 문구.
const STYLE_NOTE = `> 말투·어조 규칙은 별도 자산 \`prompt_style\` 에 있으며, 코드가 이 프롬프트 앞에 함께 붙입니다.`;

const h = (title, purpose) => `# Prompt: ${title}\n\n${purpose}`;

// ── 새 자산 ──────────────────────────────────────────────────────────────────
const assets = {};

// [AUTHORED] 머리말만 새로 쓰고 본문은 원문 그대로.
assets['prompt_style'] = `# Prompt: Utterance Style

Shared style rules for every learner-facing tutor utterance in this DA session.
The calling code prepends this to each utterance-generating prompt.

${style}
`;

assets['prompt_mediation'] = `${h('Mediation (step 1-4)',
`You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
Generate the tutor utterance for the current mediation step (1 to 4) of the active unit.

${STYLE_NOTE}`)}

${role}

${categoryRel}

${piPsv}

${fiveSteps}

${sourceHandling}

${onTrack.replace(/^### \`on_track_continue\`/, '## Generating this turn')}

${missingInputs}

${OUTPUT}
`;

assets['prompt_provision'] = `${h('Explicit provision (step 5)',
`You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
The mediation has reached the terminal step: provide the answer directly.

This turn ENDS the unit. The learner is not expected to respond, and no further
question is asked in this unit.

${STYLE_NOTE}`)}

${role}

${categoryRel}

${piPsv}

${section('### Step 5: Explicit provision')}

${sourceHandling}

${provision.replace(/^### \`explicit_provision\`/, '## Generating this turn')}

${missingInputs}

${OUTPUT}
`;

assets['prompt_confirm_invite'] = `${h('Transition invitation',
`You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
Both PI and PSV have been judged sufficient for the active unit. Close the unit with a
short recap and ask whether the learner is ready to move on.

The learner's reply to this question is routed to a separate Confirmation component —
do not judge it yourself, and do not continue mediating in this turn.

${STYLE_NOTE}`)}

${role}

${confirmInvite.replace(/^### \`confirmation_invite\`/, '## Generating this turn')}

${OUTPUT}
`;

assets['prompt_post_confirm'] = `${h('Post-confirmation help',
`You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
At the transition point the learner asked for more help with the unit that just finished.
Answer once, then the unit ends.

${STYLE_NOTE}`)}

${role}

${sourceHandling}

${postConfirm.replace(/^### \`post_confirmation_help\`/, '## Generating this turn')}

${OUTPUT}
`;

// [AUTHORED] 종료 질의응답 폐지에 따라 두 규칙을 제거하고 종료 문구로 대체한다:
//   - "mention any stored `pending_questions` when supplied"  (pending_questions 미구현)
//   - "ask whether the learner has any final questions"        (final_question_answer 폐지)
const closingEdited = closing
  .replace(/^### \`session_closing_invite\`/, '## Generating this turn')
  .split('\n')
  .filter((l) => !/pending_questions/.test(l) && !/ask whether the learner has any final questions/.test(l))
  .join('\n');

assets['prompt_closing'] = `${h('Session closing',
`You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
Every scheduled unit has ended (or the session time limit was reached). Summarize the
session and close it.

This is the LAST utterance of the session. Do not ask a question, do not invite further
questions, and do not open a new mediation unit — the session ends here.

${STYLE_NOTE}`)}

${role}

${closingEdited}

${OUTPUT}
`;

// ── 기존 자산에서 말투 규칙 제거 ─────────────────────────────────────────────
for (const key of ['prompt_opening', 'prompt_recovery']) {
  const cur = map[key];
  if (!cur) continue;
  const i = cur.indexOf('## General utterance style');
  if (i === -1) { console.log(`  (${key}: 말투 절이 없어 건너뜁니다)`); continue; }
  const nextHead = cur.slice(i + 5).search(/^## /m);
  const j = nextHead === -1 ? cur.length : i + 5 + nextHead;
  assets[key] = (cur.slice(0, i) + STYLE_NOTE + '\n\n' + cur.slice(j)).replace(/\n{3,}/g, '\n\n');
}

// ── 백업 · 미리보기 ──────────────────────────────────────────────────────────
const dir = path.join(ROOT, 'backup-prompts-0726');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'prompt_mediator_common.RETIRED.txt'), med);
for (const [k, v] of Object.entries(assets)) fs.writeFileSync(path.join(dir, `${k}.txt`), v);

console.log(`원본 prompt_mediator_common: ${med.length}자 → 백업 후 삭제 예정\n`);
console.log('생성/수정되는 자산:');
for (const [k, v] of Object.entries(assets)) {
  const before = map[k] !== undefined ? `${map[k].length}자 → ` : '신규 ';
  console.log(`  ${k.padEnd(24)} ${before}${v.length}자`);
}
console.log(`\n백업 위치: backup-prompts-0726/`);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.');
  process.exit(0);
}

const up = await fetch(`${URL_}/rest/v1/prompt_assets`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(Object.entries(assets).map(([key, content]) => ({
    key, content, updated_at: new Date().toISOString(),
  }))),
});
if (!up.ok) throw new Error(`업서트 실패: ${up.status} ${await up.text()}`);

const del = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_mediator_common`, { method: 'DELETE', headers: H });
if (!del.ok) throw new Error(`삭제 실패: ${del.status} ${await del.text()}`);

console.log('\nDB 반영 완료 — 자산 업서트 + prompt_mediator_common 삭제.');
