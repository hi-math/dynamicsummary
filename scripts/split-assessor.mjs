// prompt_assessor 를 2턴으로 분리:
//   prompt_assessor_select : 진단 + 다룰 항목 선택 + 근거 (심각도·순서 없음)
//   prompt_assessor_order  : 심각도 산출 + 제시 순서 + 목표(PI/PSV·보조)
//
//   node scripts/split-assessor.mjs [--apply]
//
// 대부분의 규칙은 원본에서 그대로 옮긴다. 새로 작성한 부분은 [AUTHORED] 로 표시.
// 원본에서 '심각도 기반 선택'을 하던 Step 1 은 턴 1 에서 빼고, 심각도 없이
// 질적으로 선택하도록 다시 썼다 (사용자 설계: 심각도는 턴 2).

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

const src = fs.readFileSync(path.join(ROOT, 'scripts/prompt_assessor_0719_updated_v5_1.md'), 'utf8').split('\n');
// 1-indexed inclusive → 배열 slice
const sec = (a, b) => src.slice(a - 1, b).join('\n').trim();

const S = {
  MATERIALS:        sec(31, 93),
  ITEMS:            sec(94, 115),
  DIAG_RATIONALE:   sec(116, 133),
  SEVERITY:         sec(134, 158),
  OVERLAP:          sec(159, 171),
  COMPRESSION:      sec(172, 178),
  DESCRIPTORS:      sec(179, 376),
  AFFECTS_MEANING:  sec(377, 395),
  LU_SAFEGUARD:     sec(396, 410),
  ORDERING:         sec(411, 436),
  ONE_PER_TAB:      sec(437, 490),
  CROSS_REDUNDANCY: sec(491, 529),
  STEP2:            sec(577, 624),
  FEEDBACK_FOCUS:   sec(625, 653),
  EVIDENCE:         sec(654, 677),
  PSV_PRINCIPLE:    sec(678, 700),
  MEDIATION_GOALS:  sec(701, 777),
};

// ─── 턴 1: prompt_assessor_select ─────────────────────────────────────────────
const TASK1 = `# Assessor · Turn 1 — Diagnose and select

Diagnose the student's summary against all six items, then select up to three items to mediate.
This turn produces WHAT will be addressed and WHY (evidence) — it does NOT assign severity and
does NOT order the tabs. Severity and tab ordering are decided in Turn 2.

For each item:
1. detect only the descriptors actually present;
2. provide concrete, text-grounded evidence for each;
3. write a brief internal \`diagnostic_rationale\`;
4. identify one item-level \`feedback_focus\` for the first detected descriptor.

After assessing all six items, select up to three non-redundant items to mediate, based on the
strength and clarity of evidence, impact on the source text's central meaning, and instructional
importance. Do NOT use severity labels here. If fewer than three meaningful, non-redundant items
exist, select fewer. Record the evidence sentence behind each selection.

The Assessor does not speak to the student. Return one valid JSON object only.`;

const SELECT1 = `## Selecting items (Turn 1 — no severity)

Compare the six items' first (most consequential) detected descriptors qualitatively.

- Base selection on evidence clarity, impact on central meaning/accuracy/organization, and
  instructional importance — NOT on a severity score (severity is assigned in Turn 2).
- An item with MORE detected descriptors is NOT automatically higher priority.
- If one root cause appears as symptoms across items, keep only the more representative item
  (redundancy/subsumption): do not select two items whose learner-facing purpose is the same.
- Select each item at most once; select up to three.

For each selected item, order its detected descriptors most-important-first. The first descriptor
is the primary mediation candidate. Do NOT set severity, tab order, or PI/PSV goals in this turn.`;

const OUTPUT1 = `## Output schema (Turn 1)

Return exactly one JSON object:

\`\`\`json
{
  "items": {
    "<item_key>": {
      "detected_descriptors": [
        { "key": "...", "evidence": { "problem_location": "...", "student_text": "...|null",
          "reference_type": "...", "reference_content": "...", "explanation": "..." } }
      ],
      "diagnostic_rationale": "...",
      "feedback_focus": "..."
    }
  },
  "selected_items": [
    { "item": "<item_key>", "primary_descriptor": "<key>",
      "evidence_ref": "<the first descriptor's evidence>", "feedback_focus": "..." }
  ]
}
\`\`\`

- Include all six item keys under \`items\` (empty \`detected_descriptors\` + empty \`feedback_focus\` if none).
- \`selected_items\`: up to three, non-redundant. No severity, no tab number, no goals.
- Do NOT output severity, tab, mediation_targets, or PI/PSV in this turn.
- Return JSON only. No Markdown, commentary, or code fences.`;

const turn1 = [
  TASK1, S.MATERIALS, S.ITEMS, S.DIAG_RATIONALE, S.OVERLAP, S.COMPRESSION,
  S.DESCRIPTORS, S.AFFECTS_MEANING, S.FEEDBACK_FOCUS, S.EVIDENCE, SELECT1, OUTPUT1,
].join('\n\n');

// ─── 턴 2: prompt_assessor_order ──────────────────────────────────────────────
const TASK2 = `# Assessor · Turn 2 — Severity, order, and goals

You receive Turn 1's diagnosis: the six-item \`items\` record and the \`selected_items\`
(up to three) with their evidence. Do NOT re-select items and do NOT re-diagnose.

For the already-selected items:
1. assign \`high\`, \`medium\`, or \`low\` severity to each detected descriptor;
2. order the selected items into tabs using severity together with the higher-order-before-
   lower-order rule (Step 2);
3. define one required primary mediation unit (PI + PSV) per selected item;
4. prepare at most one optional secondary unit per item, only when eligible.

The Assessor does not speak to the student. Return one valid JSON object only.`;

const OUTPUT2 = `## Output schema (Turn 2)

Return exactly one JSON object:

\`\`\`json
{
  "severity": { "<item_key>": { "<descriptor_key>": "high|medium|low" } },
  "mediation_targets": [
    {
      "tab": 1,
      "item": "<item_key>",
      "priority_rationale": "...",
      "primary_mediation_unit": {
        "descriptor_key": "<first descriptor of the item>",
        "feedback_focus": "<identical to the item's feedback_focus>",
        "mediation_goal": { "problem_identification": "...", "problem_solution_verbalization": "..." }
      },
      "secondary_mediation_unit": null
    }
  ]
}
\`\`\`

- Number tabs 1..N only after Step 2 sequencing.
- \`primary_mediation_unit.descriptor_key\` = the item's first detected descriptor.
- \`secondary_mediation_unit\` = null unless the eligibility conditions are met.
- Use severity qualitatively; do not compute a numeric priority.
- Return JSON only. No Markdown, commentary, or code fences.`;

const turn2 = [
  TASK2, S.SEVERITY, S.LU_SAFEGUARD, S.ORDERING, S.ONE_PER_TAB, S.CROSS_REDUNDANCY,
  S.STEP2, S.PSV_PRINCIPLE, S.MEDIATION_GOALS, OUTPUT2,
].join('\n\n');

console.log(`prompt_assessor_select : ${turn1.length}자`);
console.log(`prompt_assessor_order  : ${turn2.length}자`);

fs.writeFileSync(path.join(ROOT, 'scripts/prompt_assessor_select_v1.md'), turn1, 'utf8');
fs.writeFileSync(path.join(ROOT, 'scripts/prompt_assessor_order_v1.md'), turn2, 'utf8');
console.log('파일 저장: scripts/prompt_assessor_{select,order}_v1.md');

if (!APPLY) { console.log('\n(미리보기. 설치하려면 --apply)'); process.exit(0); }

for (const [key, content] of [['prompt_assessor_select', turn1], ['prompt_assessor_order', turn2]]) {
  await fetch(`${URL_}/rest/v1/prompt_assets`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, content }]),
  });
}
console.log('\n설치 완료. (기존 prompt_assessor 는 그대로 두었습니다 — 코드가 2턴으로 바뀔 때까지 참조용)');
