// prompt_opening 설치 — 탭 첫 발화 전용 프롬프트.
//
//   node scripts/install-prompt-opening.mjs           # 미리보기
//   node scripts/install-prompt-opening.mjs --apply   # DB 반영
//
// 본문은 prompt_mediator_common 에서 오프닝에 해당하는 두 절을 그대로 옮긴 것이다:
//   - "## General utterance style"  (말투 규칙, 전문)
//   - "### `opening`"               (오프닝 규칙 + 항목별 예시, 전문)
// 새로 쓴 부분은 맨 앞 역할 문단과 맨 뒤 출력 형식뿐이며, [AUTHORED] 로 표시한다.
//
// 출력 형식만 원본과 다르다: mediator_common 은 {"utterance": "..."} JSON 을 요구하지만
// 코드는 응답 문자열을 그대로 발화로 쓰므로, 여기서는 평문 한 문장을 요구한다.

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
const opening = slice('### `opening`', '### `confusion_rephrase`');

const CONTENT = `# Prompt: Opening

You are the Mediator in a Dynamic Assessment interaction for EFL summary writing.
Produce the FIRST tutor utterance of a task tab, before interactive mediation begins.

You are given only the current item key. You are not given the diagnosis, the learner's
summary, the source text, or any reference material — do not ask for them, and do not
invent or imply any specific problem in the learner's writing.

${style}

${opening.replace(/^### \`opening\`/, '## Opening rules')}

## Output format

Return the tutor utterance itself as plain text — one short Korean utterance.

Do not return JSON, Markdown, code fences, quotation marks around the whole utterance,
labels, or any commentary.
`;

console.log(`prompt_opening: ${CONTENT.length}자 (말투 ${style.length}자 + 오프닝 ${opening.length}자 + 신규 서술)`);
console.log(map['prompt_opening'] !== undefined ? `⚠ 기존 값 ${map['prompt_opening'].length}자 → 덮어씁니다.` : '신규 키입니다.');

const dir = path.join(ROOT, 'backup-prompts-0725');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'prompt_opening.txt'), CONTENT);
if (map['prompt_opening']) fs.writeFileSync(path.join(dir, 'prompt_opening.PREV.txt'), map['prompt_opening']);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.\n');
  console.log('===== 설치될 내용 =====\n' + CONTENT);
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ key: 'prompt_opening', content: CONTENT, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`DB 반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
