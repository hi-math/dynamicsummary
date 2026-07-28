// 프롬프트 자산에서 출력 규정 절을 제거한다.
//
//   node scripts/strip-output-sections.mjs           # 미리보기
//   node scripts/strip-output-sections.mjs --apply   # DB 반영
//
// 출력 형식은 이제 코드(src/lib/da-output.ts)가 소유하고, 각 노드가 프롬프트 뒤에 붙인다.
// 프롬프트에는 "무엇을 판단/생성할지"만 남긴다.
//
// 제거 대상 절:
//   ## Output format            (전 자산)
//   ## Output consistency rules (analysis / confirmation)
//   ## Output Requirements      (assessor)
// 남기는 것:
//   ### Step 6. Generate the Output (assessor) — 9필드의 '의미' 설명이라 내용에 해당

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

const TARGETS = ['## Output format', '## Output consistency rules', '## Output Requirements'];

/** head 로 시작하는 절을 다음 `##`/`###` 제목 직전까지 잘라 낸다. */
function dropSection(content, head) {
  const i = content.indexOf(head);
  if (i === -1) return { content, removed: 0 };
  const rest = content.slice(i + head.length);
  const m = rest.match(/^#{2,3} /m);
  const end = i + head.length + (m ? m.index : rest.length);
  const cut = content.slice(i, end);
  const next = (content.slice(0, i) + content.slice(end))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\n---\s*)+\n*$/, '\n')
    .trimEnd() + '\n';
  return { content: next, removed: cut.length };
}

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content&order=key`, { headers: H })).json();
const dir = path.join(ROOT, 'backup-prompts-0726/before-strip');
fs.mkdirSync(dir, { recursive: true });

const updates = [];
for (const r of rows) {
  let content = r.content ?? '';
  const before = content.length;
  const hits = [];
  for (const head of TARGETS) {
    // 같은 제목이 여러 번 있을 수 있으므로 없어질 때까지 반복
    for (;;) {
      const res = dropSection(content, head);
      if (!res.removed) break;
      content = res.content;
      hits.push(`${head}(${res.removed}자)`);
    }
  }
  if (!hits.length) continue;
  fs.writeFileSync(path.join(dir, `${r.key}.txt`), r.content ?? '');
  updates.push({ key: r.key, content });
  console.log(`  ${r.key.padEnd(24)} ${before}자 → ${content.length}자  | ${hits.join(', ')}`);
}

console.log(`\n대상 ${updates.length}개 · 백업: backup-prompts-0726/before-strip/`);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.');
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(updates.map((u) => ({ ...u, updated_at: new Date().toISOString() }))),
});
if (!res.ok) throw new Error(`반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
