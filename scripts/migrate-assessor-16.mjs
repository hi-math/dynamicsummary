// prompt_assessor 의 descriptor 목록을 16개 체계로 맞춘다 (기계적 이동/삭제만).
//   node scripts/migrate-assessor-16.mjs [--apply]
//
// 구조: "- <key>" / "  정의: ..." / "  탐지 신호: ..." 3줄 + 빈 줄 = 한 블록.
// Organization 5→3 재편은 새 정의를 써야 하므로 여기서 다루지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');

// "- <key>" 부터 다음 빈 줄까지를 한 블록으로 잘라낸다.
function cutBlock(lines, dkey) {
  const start = lines.findIndex((l) => l.trim() === `- ${dkey}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== '') end++;
  const block = lines.slice(start, end);           // 빈 줄은 제외하고 잘라냄
  const rest = [...lines.slice(0, start), ...lines.slice(end + 1)]; // 뒤따르는 빈 줄까지 제거
  return { block, rest };
}

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const original = rows.find((r) => r.key === 'prompt_assessor').content;
let lines = original.split('\n');

// 1) superordination_failure 블록 추출 (항목1 main_idea_coverage 아래에 있음)
const sup = cutBlock(lines, 'superordination_failure');
if (!sup) { console.error('superordination_failure 블록을 찾지 못했습니다.'); process.exit(1); }
lines = sup.rest;

// 2) source_length_proximity 블록 삭제
const slp = cutBlock(lines, 'source_length_proximity');
if (!slp) { console.error('source_length_proximity 블록을 찾지 못했습니다.'); process.exit(1); }
lines = slp.rest;

// 3) superordination_failure 를 condensation 의 non_essential_inclusion 뒤에 삽입
//    (19→16 표의 순서: non_essential_inclusion → superordination_failure → redundant_inclusion)
const anchorIdx = lines.findIndex((l) => l.trim() === '- non_essential_inclusion');
if (anchorIdx < 0) { console.error('non_essential_inclusion 블록을 찾지 못했습니다.'); process.exit(1); }
let insertAt = anchorIdx + 1;
while (insertAt < lines.length && lines[insertAt].trim() !== '') insertAt++;
lines.splice(insertAt + 1, 0, ...sup.block, '');

const updated = lines.join('\n');

console.log('삭제한 블록: source_length_proximity');
console.log('이동한 블록: superordination_failure  (항목1 main_idea_coverage → 항목2 condensation)');
console.log(`길이: ${original.length} → ${updated.length}`);
console.log();
console.log('=== 변경 후 항목1·2 descriptor 순서 ===');
updated.split('\n').forEach((l) => {
  if (/^항목 \d\./.test(l) || /^- [a-z_]+$/.test(l.trim())) console.log('  ' + l.trim().slice(0, 70));
});

if (!APPLY) { console.log('\n(미리보기입니다. 저장하려면 --apply)'); process.exit(0); }

await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_assessor`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ content: updated }),
});
console.log('\n저장 완료.');
