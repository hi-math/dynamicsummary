// 평가 기준(6항목·16descriptor)의 원천을 prompt_assets['descriptors'] 로 옮긴다.
//
//   node scripts/seed-descriptors-asset.mjs           # 미리보기
//   node scripts/seed-descriptors-asset.mjs --apply   # DB 반영 + 폴백 JSON 갱신
//
// 하는 일:
//   1. prompt_assessor 의 `## Assessment Framework` 절을 파싱해 구조화
//   2. prompt_assets['descriptors'] 에 JSON 으로 저장 (관리 화면 '평가 기준' 탭이 편집)
//   3. src/data/descriptors.json 을 같은 내용으로 갱신 (코드 폴백)
//   4. prompt_assessor 에서 그 절을 제거 — 이제 코드가 호출 시 붙인다
//
// 항목 라벨(한글)은 기존 descriptors.json 에서 키로 찾아 옮긴다.

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
const assessor = map['prompt_assessor'] ?? '';
if (!assessor) throw new Error('prompt_assessor 가 비어 있습니다.');

const HEAD = '## Assessment Framework';
const start = assessor.indexOf(HEAD);
if (start === -1) throw new Error(`"${HEAD}" 절을 찾지 못했습니다. 이미 이관했다면 다시 실행하지 마세요.`);
const after = assessor.slice(start + HEAD.length);
const nextTop = after.search(/^## /m);
const end = start + HEAD.length + (nextTop === -1 ? after.length : nextTop);
const section = assessor.slice(start, end);

// ── 파싱: ### N. item_key → #### `descriptor_key` ───────────────────────────
const labels = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/descriptors.json'), 'utf8'))
    .items.map((i) => [i.key, i.label]),
);

const itemChunks = section.split(/^### /m).slice(1);
const items = itemChunks.map((chunk) => {
  const key = chunk.split('\n')[0].replace(/^\d+\.\s*/, '').replace(/`/g, '').trim();
  const core = chunk.match(/\*\*Core question:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
  const descChunks = chunk.split(/^#### /m).slice(1);
  const descriptors = descChunks.map((d) => {
    const dKey = d.split('\n')[0].replace(/`/g, '').trim();
    const rest = d.slice(d.indexOf('\n') + 1);
    const gi = rest.indexOf('Detection guidance:');
    const description = (gi === -1 ? rest : rest.slice(0, gi)).trim();
    const detection = gi === -1 ? '' : rest.slice(gi + 'Detection guidance:'.length).trim();
    return { key: dKey, description, detection };
  });
  return { key, label: labels[key] ?? key, coreQuestion: core, descriptors };
});

const total = items.reduce((n, i) => n + i.descriptors.length, 0);
console.log(`파싱 결과: ${items.length}항목 / ${total}descriptor`);
for (const i of items) {
  console.log(`  ${i.key.padEnd(24)} core:${i.coreQuestion ? '✅' : '❌'}  descriptors: ${i.descriptors.map((d) => d.key).join(', ')}`);
  const bad = i.descriptors.filter((d) => !d.description || !d.detection);
  if (bad.length) console.log(`    ⚠ 내용이 빈 descriptor: ${bad.map((d) => d.key).join(', ')}`);
}

const json = JSON.stringify({ items }, null, 2);
const strippedAssessor = (assessor.slice(0, start) + assessor.slice(end)).replace(/\n{3,}/g, '\n\n');
console.log(`\ndescriptors 자산: ${json.length}자 (신규)`);
console.log(`prompt_assessor: ${assessor.length}자 → ${strippedAssessor.length}자 (Framework ${section.length}자 이관)`);

const dir = path.join(ROOT, 'backup-prompts-0726');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'prompt_assessor.with-framework.txt'), assessor);
fs.writeFileSync(path.join(dir, 'descriptors.json'), json);

if (!APPLY) { console.log('\n--apply 없이 실행했습니다. DB·파일 모두 변경되지 않았습니다.'); process.exit(0); }

fs.writeFileSync(path.join(ROOT, 'src/data/descriptors.json'), json);
const res = await fetch(`${URL_}/rest/v1/prompt_assets`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([
    { key: 'descriptors', content: json, updated_at: new Date().toISOString() },
    { key: 'prompt_assessor', content: strippedAssessor, updated_at: new Date().toISOString() },
  ]),
});
if (!res.ok) throw new Error(`반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 + src/data/descriptors.json 갱신 완료.');
