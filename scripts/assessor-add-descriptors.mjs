// prompt_assessor 의 Step 1 에 descriptors.json 의 16개 descriptor 정의를 넣는다.
//
//   node scripts/assessor-add-descriptors.mjs           # 미리보기
//   node scripts/assessor-add-descriptors.mjs --apply   # DB 반영
//
// 정의(definition)·탐지신호(signal) 문구는 연구 도구이므로 src/data/descriptors.json 원문 그대로 옮긴다.
// 이전 본문은 backup-prompts-0725/prompt_assessor.<timestamp>.txt 로 백업한다.

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

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/descriptors.json'), 'utf8'));

const block = data.items
  .map((item) => {
    const lines = item.descriptors
      .map((d) => `- **${d.key}**\n  - 정의: ${d.definition}\n  - 탐지신호: ${d.signal}`)
      .join('\n');
    return `**${item.key}** (${item.label})\n\n${lines}`;
  })
  .join('\n\n');

const ANCHOR = 'Each assessment item contains multiple descriptors.\n';
const INSERT = `${ANCHOR}
The descriptors for each assessment item are listed below. Each descriptor has a definition (정의) and a detection signal (탐지신호). Judge each item against its own descriptors.

${block}

A descriptor is a diagnostic lens, not a checklist item. Detecting a descriptor does not by itself make an item a mediation target; apply the judgment criteria in Step 3 and Step 4.
`;

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content,updated_at&key=eq.prompt_assessor`, { headers: H })).json();
const cur = rows[0]?.content ?? '';
if (!cur) throw new Error('prompt_assessor 를 찾지 못했습니다.');
console.log(`현재 본문: ${cur.length}자 (updated_at ${rows[0].updated_at})`);

const keys = data.items.flatMap((i) => i.descriptors.map((d) => d.key));
const already = keys.filter((k) => cur.includes(k));
if (already.length) throw new Error(`이미 descriptor 키가 ${already.length}개 있습니다. 중복 추가를 막습니다.`);
if (cur.split(ANCHOR).length !== 2) throw new Error(`기준 문장을 정확히 한 번 찾지 못했습니다: "${ANCHOR.trim()}"`);

const next = cur.replace(ANCHOR, INSERT);

const dir = path.join(ROOT, 'backup-prompts-0725');
fs.mkdirSync(dir, { recursive: true });
const stamp = String(rows[0].updated_at).replace(/[:.]/g, '-');
fs.writeFileSync(path.join(dir, `prompt_assessor.${stamp}.txt`), cur);
console.log(`백업: backup-prompts-0725/prompt_assessor.${stamp}.txt`);
console.log(`신규 본문: ${next.length}자 (+${next.length - cur.length}) · descriptor ${keys.length}개`);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.\n');
  console.log('===== 추가되는 내용 =====');
  console.log(INSERT.slice(ANCHOR.length));
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_assessor`, {
  method: 'PATCH',
  headers: { ...H, Prefer: 'return=minimal' },
  body: JSON.stringify({ content: next, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`DB 반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
