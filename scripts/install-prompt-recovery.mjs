// prompt_recovery 설치 — confusion / off_topic 복구 발화 전용 프롬프트.
//
//   node scripts/install-prompt-recovery.mjs           # 미리보기
//   node scripts/install-prompt-recovery.mjs --apply   # DB 반영
//
// 한 노드가 두 모드를 처리한다. `mode` 입력이 confusion 이면 앞 절, off_topic 이면 뒤 절만 따른다.
// 본문은 prompt_mediator_common 에서 세 절을 그대로 옮긴 것이다:
//   - "## General utterance style"      (말투 규칙, 전문)
//   - "### `confusion_rephrase`"        (전문)
//   - "### `off_topic_redirect`"        (전문)
// 새로 쓴 부분은 역할 문단·모드 선택 규칙·출력 형식뿐이다.

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
if (!med) throw new Error('prompt_mediator_common 을 찾지 못했습니다.');

function slice(from, to) {
  const i = med.indexOf(from);
  const j = med.indexOf(to, i + from.length);
  if (i === -1 || j === -1) throw new Error(`구간을 찾지 못했습니다: ${from}`);
  return med.slice(i, j).replace(/\s*---\s*$/, '').trimEnd();
}

const style = slice('## General utterance style', '\n## ');
const confusion = slice('### `confusion_rephrase`', '### `off_topic_redirect`');
const offTopic = slice('### `off_topic_redirect`', '### `on_track_continue`');

const CONTENT = `# Prompt: Recovery (confusion / off_topic)

You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
The learner's latest response did not advance the mediation, and the code has routed
this turn to you for recovery. Produce ONE tutor utterance that gets the interaction
back on track.

## Mode selection

The input field \`mode\` tells you which of the two sections below to follow.

- \`mode = "confusion"\` → follow **Confusion: rephrase** only.
- \`mode = "off_topic"\` → follow **Off-topic: redirect** only.

Follow exactly one section. Do not blend the two, and do not mention the mode.

## What you are NOT given

You are given the preceding tutor utterance, the learner's latest response, the current
item, the active target, the current explicitness level, and recent tab history.

You are NOT given the diagnosis, the learner's summary, the source text, the category
guidance, or any reference material. This is deliberate: recovery must not introduce a
new hint or reveal more than the preceding utterance already did. Do not ask for these,
and do not invent evidence, quotations, or problems that are not in the preceding utterance.

${style}

${confusion.replace(/^### \`confusion_rephrase\`/, '## Confusion: rephrase')}

${offTopic.replace(/^### \`off_topic_redirect\`/, '## Off-topic: redirect')}

## Preserving the mediation state

\`current_step\` is the explicitness level of the preceding utterance, decided by the code.
Stay at that level. Do not raise it, and do not lower it.

\`current_target\` (\`PI\` or \`PSV\`) is the active goal. Keep it. Do not switch targets and
do not begin the other target.

Use \`recent_tab_history\` to avoid repeating a rephrasing or redirection you have already
tried in this tab. Vary the wording, the reference point, or the entry point instead.

## Output format

Return the tutor utterance itself as plain text — one short Korean utterance.

Do not return JSON, Markdown, code fences, quotation marks around the whole utterance,
labels, or any commentary.
`;

console.log(`prompt_recovery: ${CONTENT.length}자`);
console.log(`  말투 ${style.length}자 + confusion ${confusion.length}자 + off_topic ${offTopic.length}자 + 신규 서술`);
console.log(map['prompt_recovery'] !== undefined ? `⚠ 기존 값 ${map['prompt_recovery'].length}자 → 덮어씁니다.` : '신규 키입니다.');

const dir = path.join(ROOT, 'backup-prompts-0725');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'prompt_recovery.txt'), CONTENT);
if (map['prompt_recovery']) fs.writeFileSync(path.join(dir, 'prompt_recovery.PREV.txt'), map['prompt_recovery']);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.\n');
  console.log('===== 설치될 내용 =====\n' + CONTENT);
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ key: 'prompt_recovery', content: CONTENT, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`DB 반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
