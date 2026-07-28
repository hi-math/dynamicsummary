// prompt_assessor 에 (1) 출력 형식 절, (2) Step 7 의 인용 제약을 추가한다.
//
//   node scripts/assessor-add-output-rules.mjs           # 미리보기
//   node scripts/assessor-add-output-rules.mjs --apply   # DB 반영
//
// 진단 절차(Step 1~7)의 판단 기준은 손대지 않는다.
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

// ── 1. Step 7 의 student_text_evidence 항목에 인용 제약을 붙인다 ──
const EVIDENCE_FROM = `- student_text_evidence
`;
const EVIDENCE_TO = `- student_text_evidence
  - Quote one or two excerpts verbatim from the STUDENT_SUMMARY.
  - Copy the student's exact wording, including any errors. Do NOT paraphrase, correct, translate, or summarize.
  - Do NOT write commentary, observation, or explanation in this field. Commentary belongs in problem_description.
  - Do NOT quote the SOURCE_TEXT, the model summary, or the knowledge_cycle.
  - If the problem is an omission and no student wording can show it, return an empty array.
`;

// ── 2. 출력 형식 절 (프롬프트 맨 끝에 추가) ──
const OUTPUT_SECTION = `
---

## Output Requirements

Return JSON only.

Do NOT output your reasoning, your evaluation of the six items, step-by-step explanation, headings, or any text before or after the JSON. The reasoning in Steps 1-6 is internal and must not appear in the output.

Do NOT wrap the JSON in a code fence.

Do NOT output descriptor names, descriptor IDs, or assessment scores.

Return only the selected mediation targets, using exactly this schema:

{
  "selected_items": [
    {
      "item": "main_idea_coverage",
      "problem_priority": 1,
      "presentation_order": 1,
      "problem_description": "...",
      "student_text_evidence": ["...", "..."],
      "selection_rationale": "...",
      "mediation_focus": "...",
      "PI_goal": "...",
      "PSV_goal": "..."
    }
  ]
}

- \`selected_items\` contains at most three objects, one per selected assessment item.
- Every object contains exactly these nine fields, and no others.
- \`item\` is one of the six assessment item keys.
- \`problem_priority\` and \`presentation_order\` are integers as defined in Steps 5 and 6.
- \`student_text_evidence\` is an array of one or two verbatim excerpts from the STUDENT_SUMMARY, or an empty array when the problem is an omission.
- All other fields are strings.
- Return an empty \`selected_items\` array if no item genuinely requires mediation.
`;

const rows = await (await fetch(`${URL_}/rest/v1/prompt_assets?select=key,content,updated_at&key=eq.prompt_assessor`, { headers: H })).json();
const cur = rows[0]?.content ?? '';
if (!cur) throw new Error('prompt_assessor 를 찾지 못했습니다.');
console.log(`현재 본문: ${cur.length}자 (updated_at ${rows[0].updated_at})`);

if (cur.includes('## Output Requirements')) throw new Error('이미 Output Requirements 절이 있습니다. 중복 추가를 막습니다.');
if (!cur.includes(EVIDENCE_FROM)) throw new Error('Step 7 의 "- student_text_evidence" 줄을 찾지 못했습니다.');
if (cur.split(EVIDENCE_FROM).length !== 2) throw new Error('"- student_text_evidence" 줄이 여러 번 나옵니다. 수동 확인이 필요합니다.');

const next = cur.replace(EVIDENCE_FROM, EVIDENCE_TO).trimEnd() + '\n' + OUTPUT_SECTION;

const dir = path.join(ROOT, 'backup-prompts-0725');
fs.mkdirSync(dir, { recursive: true });
const stamp = String(rows[0].updated_at).replace(/[:.]/g, '-');
fs.writeFileSync(path.join(dir, `prompt_assessor.${stamp}.txt`), cur);
console.log(`백업: backup-prompts-0725/prompt_assessor.${stamp}.txt`);
console.log(`신규 본문: ${next.length}자 (+${next.length - cur.length})`);

if (!APPLY) {
  console.log('\n--apply 없이 실행했습니다. DB 는 변경되지 않았습니다.');
  console.log('\n===== 추가되는 내용 =====');
  console.log(EVIDENCE_TO + OUTPUT_SECTION);
  process.exit(0);
}

const res = await fetch(`${URL_}/rest/v1/prompt_assets?key=eq.prompt_assessor`, {
  method: 'PATCH',
  headers: { ...H, Prefer: 'return=minimal' },
  body: JSON.stringify({ content: next, updated_at: new Date().toISOString() }),
});
if (!res.ok) throw new Error(`DB 반영 실패: ${res.status} ${await res.text()}`);
console.log('\nDB 반영 완료.');
