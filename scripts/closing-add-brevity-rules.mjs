// prompt_closing 에 "중복 금지 + 탭당 1문장" 규칙을 추가한다.
//
// 마지막 탭에서 ⑥ Provision 이 문제와 원리를 이미 길게 설명했는데, ⑩ Closing 이 그것을
// 다시 문단 단위로 요약해 발화가 두 배로 길어지는 문제를 막는다.
//
// 미리보기: node scripts/closing-add-brevity-rules.mjs
// 실제 적용: node scripts/closing-add-brevity-rules.mjs --apply

import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const KEY_NAME = 'prompt_closing';
const APPLY = process.argv.includes('--apply');

const SECTION = `
## Length limit

- Write at most one sentence per completed unit, plus one short opening line and one short
  closing line. Never more than five sentences in total.
- Do not use paragraph breaks for each unit — keep the recap in one short paragraph.

## Do not repeat the previous utterance

The tutor utterance immediately before this one may already have explained the problem and the
solution principle of the last unit in full (terminal Step 5 provision, or a post-confirmation
explanation). Both utterances are shown to the learner one after the other.

- Do not restate, rephrase, or re-explain anything that utterance already said.
- For that unit, name the topic at the level of the item only — one short clause is enough.
- Do not quote the learner's summary or the source text again in this utterance.
- Do not add new explanation, examples, or advice about how to revise.

Each completed unit provides \`principle_discussed\` as a single sentence. Refer to it briefly;
do not expand it into an explanation.`;

const raw = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.${KEY_NAME}&select=key,content`, { headers: H });
const [row] = await raw.json();
if (!row) { console.error(`${KEY_NAME} 자산이 없습니다.`); process.exit(1); }

const current = row.content ?? '';
if (current.includes('## Do not repeat the previous utterance')) {
  console.log('이미 적용되어 있습니다. 변경 없음.');
  process.exit(0);
}
const next = `${current.trimEnd()}\n${SECTION}\n`;

console.log(`${KEY_NAME}: ${current.length}자 → ${next.length}자 (+${next.length - current.length})`);
console.log('--- 추가되는 내용 ---');
console.log(SECTION.trim());

if (!APPLY) { console.log('\n미리보기입니다. 적용하려면 --apply 를 붙이세요.'); process.exit(0); }

fs.mkdirSync('scripts/backup', { recursive: true });
const backup = `scripts/backup/${KEY_NAME}.before-brevity.txt`;
fs.writeFileSync(backup, current, 'utf8');
console.log(`백업: ${backup}`);

const res = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.${KEY_NAME}`, {
  method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify({ content: next }),
});
if (!res.ok) { console.error('실패:', res.status, await res.text()); process.exit(1); }
console.log('적용 완료.');
