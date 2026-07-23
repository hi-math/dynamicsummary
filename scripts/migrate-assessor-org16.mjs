// prompt_assessor 의 항목5 organization descriptor 블록을 5개 → 3개로 교체.
//   node scripts/migrate-assessor-org16.mjs [--apply]
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

// descriptors.json 을 단일 출처로 삼아 블록을 생성한다.
const desc = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/descriptors.json'), 'utf8'));
const org = desc.items.find((i) => i.key === 'organization');
const blocks = org.descriptors.flatMap((d) => [
  `- ${d.key}`,
  `  정의: ${d.definition}`,
  `  탐지 신호: ${d.signal}`,
  '',
]);

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const original = rows.find((r) => r.key === 'prompt_assessor').content;
const L = original.split('\n');

const headerIdx = L.findIndex((l) => /^항목 5\. organization/.test(l));
const nextIdx = L.findIndex((l) => /^항목 6\./.test(l));
if (headerIdx < 0 || nextIdx < 0) { console.error('구간을 찾지 못했습니다.'); process.exit(1); }
// 헤더 아래 구분선(1줄) + 빈 줄(1줄) 다음부터, 항목6 위의 구분선(1줄) 전까지가 descriptor 영역
const start = headerIdx + 3;
const end = nextIdx - 1;

const updated = [...L.slice(0, start), ...blocks, ...L.slice(end)].join('\n');

console.log(`교체 구간: ${start + 1}~${end}행 → descriptor ${org.descriptors.length}개`);
console.log(`길이: ${original.length} → ${updated.length}`);
console.log('\n=== 교체 후 항목5 구간 ===');
updated.split('\n').slice(headerIdx, headerIdx + 3 + blocks.length + 2).forEach((l) => console.log('  ' + l.slice(0, 96)));

if (!APPLY) { console.log('\n(미리보기입니다. 저장하려면 --apply)'); process.exit(0); }
await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_assessor`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ content: updated }),
});
console.log('\n저장 완료.');
