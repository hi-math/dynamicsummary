// 항목별 mediation 프롬프트 6종을 하나의 JSON으로 내보낸다.
//
//   node scripts/export-item-prompts.mjs
//     → item-prompts.json
//
// 키는 항목 키(prompt_ 접두사 제외), 값은 프롬프트 본문 전문.
// 항목 목록과 순서는 src/data/descriptors.json 을 따른다.

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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const desc = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/descriptors.json'), 'utf8'));
const items = desc.items.map((i) => i.key);

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const map = Object.fromEntries(rows.map((r) => [r.key, r.content ?? '']));

const out = {};
for (const k of items) out[k] = map[`prompt_${k}`] ?? '';

const outPath = path.join(ROOT, 'item-prompts.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

let total = 0;
console.log('항목 프롬프트 내보내기 → item-prompts.json\n');
for (const k of items) {
  const body = out[k];
  // 각 프롬프트가 선언한 descriptor 목록을 뽑아 descriptors.json 과 대조
  const declared = (body.match(/^\s*-\s*([a-z_]+):/gm) ?? [])
    .map((l) => l.replace(/^\s*-\s*/, '').replace(/:$/, ''));
  const expected = desc.items.find((i) => i.key === k).descriptors.map((d) => d.key);
  const ok = expected.every((d) => declared.includes(d));
  total += body.length;
  console.log(
    '  ' + k.padEnd(34),
    String(body.length).padStart(6) + '자',
    ' descriptor ' + expected.length + '개',
    ok ? '✅' : '⚠ 불일치',
  );
}
console.log('\n  ' + '합계'.padEnd(34), String(total).padStart(6) + '자');
