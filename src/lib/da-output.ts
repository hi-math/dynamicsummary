// LLM 호출별 출력 계약.
//
// 출력 형식은 프롬프트가 아니라 **코드가 소유한다.** 응답을 파싱하는 쪽이 코드이므로,
// 계약이 프롬프트 안에 있으면 관리자가 프롬프트를 고칠 때 코드와 어긋날 수 있다.
// 각 노드는 프롬프트 본문 뒤에 아래 계약을 붙여서 보낸다.
//
// 프롬프트에는 "무엇을 판단/생성할지"만 남기고, "어떤 모양으로 돌려줄지"는 여기에 둔다.

/** 프롬프트 본문 뒤에 출력 계약을 붙인다. */
export function withOutputContract(sysPrompt: string, contract: string): string {
  return `${sysPrompt}\n\n---\n\n${contract}`;
}

// ─── 평문 발화 턴 6종 공통 ───────────────────────────────────────────────────
// opening · recovery · provision · confirm_invite · post_confirm · closing
// (mediation 만 예외 — 쓴 자리를 신고해야 해서 OUTPUT_MEDIATION 을 쓴다)
export const OUTPUT_UTTERANCE = `## Output format

Return the tutor utterance itself as plain text — one Korean tutor utterance.

Do not return JSON, Markdown, code fences, headings, labels, quotation marks around the
whole utterance, or any commentary. Return only what the learner should see.`;

// ─── Assessor (판정) ─────────────────────────────────────────────────────────
export const OUTPUT_ASSESSOR = `## Output format

Return valid JSON only, using exactly this structure:

\`\`\`json
{
  "selected_items": [
    {
      "item": "main_idea_coverage",
      "problem_priority": 1,
      "problem_description": "...",
      "student_text_evidence": ["..."],
      "selection_rationale": "...",
      "mediation_focus": "...",
      "PI_goal": "...",
      "PSV_goal": "..."
    }
  ]
}
\`\`\`

Return exactly these eight fields for every selected item, and at most three items.

Do not order the items and do not return any ordering field. The system arranges the
selected items into the feedback sequence by instructional level; \`problem_priority\` is
severity only, not presentation order.

For \`student_text_evidence\`:

- Copy one or two passages exactly as they appear in STUDENT_SUMMARY.
- Preserve all errors exactly as written.
- Do not paraphrase, correct, translate, summarize, complete, or otherwise modify the quotations.
- Include only quotations, not observations, explanations, or interpretations.
- Do not quote the source text, Model Summary, IU table, IU explanations, or other knowledge materials.
- If the problem is an omission and no student wording can be quoted, return an empty array: \`[]\`.

Do not include Markdown, code fences, headings, or commentary outside the JSON object.
Do not include descriptor names, descriptor scores, or an \`affects_meaning\` field.
Do not include information about unselected items or fields outside this schema.

When no assessment item requires mediation, return exactly:

\`\`\`json
{
  "selected_items": []
}
\`\`\``;

// ─── Analysis (판정) ─────────────────────────────────────────────────────────
// 응답을 분류하고, 활성 목표 하나를 판정한다. 발화는 만들지 않는다.
export const OUTPUT_ANALYSIS = `## Output format

Return valid JSON only.

Do not use Markdown, code fences, headings, or commentary in the output.

Use exactly this schema:

\`\`\`json
{
  "classification": "on_track | confusion | off_topic",
  "turn_pi": "absent | sufficient" or null,
  "turn_psv": "absent | sufficient" or null,
  "rationale": "판정 근거를 간결한 한국어로 작성"
}
\`\`\`

## Output consistency rules

- If \`classification = confusion\`:
  - \`turn_pi = null\`
  - \`turn_psv = null\`

- If \`classification = off_topic\`:
  - \`turn_pi = null\`
  - \`turn_psv = null\`

- If \`classification = on_track\` and \`current_target = PI\`:
  - \`turn_pi = absent\` or \`sufficient\`
  - \`turn_psv = null\`

- If \`classification = on_track\` and \`current_target = PSV\`:
  - \`turn_pi = null\`
  - \`turn_psv = absent\` or \`sufficient\`

Judge only the learner's latest response against the active goal, not the summary overall.
Use \`sufficient\` only when the response demonstrates the essential meaning of the active goal
clearly enough — exact wording, technical terms, and polished language are not required.
Anything short of that is \`absent\`. There is no \`partial\` value.`;

// ─── Mediation, step 1~4 (발화 + 자기 신고) ──────────────────────────────────
// 판정은 Analysis 가 이미 끝냈다. 이 턴은 확정된 목표·단계로 발화만 만든다.
export const OUTPUT_MEDIATION = `## Output format

Return valid JSON only.

Do not use Markdown, code fences, headings, or commentary outside the JSON.

Use exactly this schema:

\`\`\`json
{
  "used_target": "PI | PSV",
  "used_step": 1,
  "utterance": "학습자에게 보일 한국어 발화 한 개"
}
\`\`\`

## Writing the utterance

Mediate the goal named by \`current_target\` at the explicitness level given by
\`current_step\`. Both values are decided by the calling code — do not change them, and do not
move to the other goal on your own.

\`latest_verdict\` tells you how the learner's previous response was judged. When it says the
goal was just met, acknowledge that briefly before moving on; when it says the goal is still
absent, do not repeat the previous utterance — make this turn more concrete.

Write exactly one learner-facing Korean utterance. Do not restate the judgment, the step, the
target, or any internal label to the learner.

## Reporting what your utterance used

\`used_target\` and \`used_step\` must describe **the utterance you actually wrote**. Normally
they equal \`current_target\` and \`current_step\`. Report them honestly if they differ — the
calling code keeps its record in step with your utterance.`;

// ─── Confirmation (판정) ─────────────────────────────────────────────────────
export const OUTPUT_CONFIRMATION = `## Output format

Return valid JSON only.

Do not use Markdown, code fences, headings, or commentary.

Use exactly this schema:

\`\`\`json
{
  "decision": "move_on | continue_help | unclear",
  "rationale": "판정 근거를 간결한 한국어로 작성"
}
\`\`\`

## Output consistency rules

- If the learner clearly agrees to move on:
  - \`decision = move_on\`

- If the learner clearly requests more help about the current completed unit:
  - \`decision = continue_help\`

- If the learner's transition intent cannot be determined:
  - \`decision = unclear\`

- If the learner clearly agrees to move on and also asks a separate question:
  - \`decision = move_on\`

- If the learner asks only a separate question without answering the transition invitation:
  - \`decision = unclear\``;
