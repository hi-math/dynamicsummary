// resource/0719new 의 프롬프트를 admin(prompt_assets)에 설치한다.
//   node scripts/install-prompts-0719.mjs [--apply]
//
// 카테고리 가이던스 1개가 항목별 프롬프트 6개(prompt_main_idea_coverage 등)를 대체한다.
// 대체되는 6개는 backup-prompts-0719/ 로 백업한 뒤 삭제한다.

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

const SRC = path.join(ROOT, 'resource/0719new');
const INSTALL = [
  ['prompt_analysis', 'prompt_analysis_0719_updated.md'],
  ['prompt_confirmation', 'prompt_confirmation_0719_updated.md'],
  ['prompt_mediator_common', 'prompt_mediator_common_0719_updated.md'],
  ['prompt_category_guidance', 'prompt_category_specific_mediation_guidance_0719_updated.md'],
];

// 카테고리 가이던스로 대체되는 항목별 프롬프트
const RETIRE = [
  'prompt_main_idea_coverage', 'prompt_condensation', 'prompt_content_accuracy',
  'prompt_paraphrasing', 'prompt_organization', 'prompt_language_use',
];

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const cur = Object.fromEntries(rows.map((r) => [r.key, r.content ?? '']));

console.log('설치할 프롬프트:');
for (const [key, file] of INSTALL) {
  const body = fs.readFileSync(path.join(SRC, file), 'utf8');
  const before = cur[key];
  const state = before === undefined ? '신규' : before.length ? `교체 (${before.length}자 →)` : '빈 값 →';
  console.log(`  ${key.padEnd(28)} ${state} ${body.length}자`);
}
console.log('\n대체되어 제거할 항목별 프롬프트:');
for (const k of RETIRE) {
  console.log(`  ${k.padEnd(28)} ${cur[k] !== undefined ? `${cur[k].length}자` : '(없음)'}`);
}

if (!APPLY) { console.log('\n(미리보기입니다. 저장하려면 --apply)'); process.exit(0); }

// 백업
const bak = path.join(ROOT, 'backup-prompts-0719');
fs.mkdirSync(bak, { recursive: true });
for (const r of rows) if (r.content) fs.writeFileSync(path.join(bak, `${r.key}.txt`), r.content, 'utf8');
console.log(`\n백업: backup-prompts-0719/ (${rows.filter((r) => r.content).length}개)`);

// 설치 (upsert)
for (const [key, file] of INSTALL) {
  const content = fs.readFileSync(path.join(SRC, file), 'utf8');
  await fetch(`${URL_}/rest/v1/prompt_assets`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, content }]),
  });
}
// 대체된 항목별 프롬프트 제거
for (const k of RETIRE) {
  await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.${k}`, { method: 'DELETE', headers: H });
}

const after = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content&order=key`, { headers: H })).json();
console.log('\n설치 후 prompt_assets:');
for (const r of after) console.log(`  ${r.key.padEnd(28)} ${(r.content ?? '').length}자`);
