// descriptor 체계 19개 → 16개 마이그레이션 (admin 프롬프트)
//
//   node scripts/migrate-descriptors-16.mjs --dry     (미리보기, 기본값)
//   node scripts/migrate-descriptors-16.mjs --apply   (실제 저장)
//
// 이 스크립트가 처리하는 것은 "이미 작성된 내용을 옮기거나 지우는" 기계적 변경뿐이다.
// Organization 5→3 재편은 새 지도 발화를 써야 하므로 여기서 다루지 않는다.

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

// descriptor 한 개에 딸린 줄을 뽑아낸다.
//   - "  - <key>: 설명"            → bullet (ITEM_INFO 목록 / 비중 목록)
//   - "  Anchor가 <key>인 경우:"   → anchor (다음 줄의 발화까지 한 블록)
function extractDescriptor(text, dkey) {
  const L = text.split('\n');
  const keep = [];
  const taken = [];
  const anchorRe = new RegExp(`^\\s*Anchor가\\s*${dkey}\\s*인 경우:`);
  const bulletRe = new RegExp(`^\\s*-\\s*${dkey}\\s*:`);
  for (let i = 0; i < L.length; i++) {
    if (anchorRe.test(L[i])) {
      taken.push({ type: 'anchor', lines: [L[i], L[i + 1] ?? ''] });
      i++;
      continue;
    }
    if (bulletRe.test(L[i])) {
      taken.push({ type: 'bullet', lines: [L[i]] });
      continue;
    }
    keep.push(L[i]);
  }
  return { stripped: keep.join('\n'), taken };
}

// condensation 에 superordination_failure 블록을 끼워 넣는다.
//   bullet → non_essential_inclusion 줄 바로 뒤 (19→16 표의 순서를 따름)
//   anchor → 각 STEP 의 anchor 목록 맨 뒤 ("학생 응답 처리:" 직전)
function insertDescriptor(text, bullets, anchors) {
  const L = text.split('\n');
  const out = [];
  const bq = [...bullets];
  const aq = [...anchors];
  for (let i = 0; i < L.length; i++) {
    const line = L[i];
    const next = L[i + 1] ?? '';
    out.push(line);

    if (/^\s*-\s*non_essential_inclusion\s*:/.test(line) && bq.length) {
      const indent = line.match(/^\s*/)[0];
      out.push(bq.shift().replace(/^\s*/, indent));
      continue;
    }
    // anchor 목록의 마지막 줄 = 다음 줄이 "학생 응답 처리:" 이고, 위쪽에 Anchor 줄이 있는 구간
    if (/^\s*학생 응답 처리\s*:/.test(next) && aq.length) {
      const hasAnchorAbove = out.slice(-6).some((l) => /Anchor가/.test(l));
      if (hasAnchorAbove) {
        const blk = aq.shift();
        out.push(blk.lines[0]);
        out.push(blk.lines[1]);
      }
    }
  }
  return { text: out.join('\n'), leftoverBullets: bq.length, leftoverAnchors: aq.length };
}

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content`, { headers: H })).json();
const get = (k) => rows.find((r) => r.key === k)?.content ?? '';

// ── 1. main_idea_coverage → superordination_failure 추출 ──
const mic = extractDescriptor(get('prompt_main_idea_coverage'), 'superordination_failure');
const micBullets = mic.taken.filter((t) => t.type === 'bullet').map((t) => t.lines[0]);
const micAnchors = mic.taken.filter((t) => t.type === 'anchor');

// ── 2. condensation → source_length_proximity 제거 ──
const con = extractDescriptor(get('prompt_condensation'), 'source_length_proximity');

// ── 3. condensation ← superordination_failure 삽입 ──
const ins = insertDescriptor(con.stripped, micBullets, micAnchors);

console.log('[main_idea_coverage] superordination_failure 추출:',
  `bullet ${micBullets.length}, anchor ${micAnchors.length}`);
console.log('[condensation]       source_length_proximity 제거:',
  `bullet ${con.taken.filter((t) => t.type === 'bullet').length}, anchor ${con.taken.filter((t) => t.type === 'anchor').length}`);
console.log('[condensation]       superordination_failure 삽입:',
  `남은 bullet ${ins.leftoverBullets}, 남은 anchor ${ins.leftoverAnchors}`);
console.log();
console.log('길이 변화:');
console.log('  prompt_main_idea_coverage', get('prompt_main_idea_coverage').length, '→', mic.stripped.length);
console.log('  prompt_condensation      ', get('prompt_condensation').length, '→', ins.text.length);

if (ins.leftoverBullets || ins.leftoverAnchors) {
  console.error('\n⚠ 삽입되지 않은 블록이 있습니다. 저장하지 않고 중단합니다.');
  process.exit(1);
}

if (!APPLY) {
  console.log('\n(미리보기입니다. 실제 저장하려면 --apply)');
  process.exit(0);
}

await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_main_idea_coverage`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ content: mic.stripped }),
});
await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_condensation`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ content: ins.text }),
});
console.log('\n저장 완료.');
