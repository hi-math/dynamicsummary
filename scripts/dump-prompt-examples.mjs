// 프롬프트 문서 생성기 — DA 파이프라인의 LLM 턴별 인풋/아웃풋.
//   node scripts/dump-prompt-examples.mjs
//     → PROMPT_EXAMPLES.md        과제 평가 (Assessor, 2턴)
//     → PROMPT_EXAMPLES_CHAT.md   채팅 (Analysis / Mediator / Confirmation)
//
// 프롬프트 본문은 길어서 싣지 않고 제목·글자수·설치 여부만 Supabase에서 실시간으로 읽는다.

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

async function table(q) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: H });
  return r.ok ? r.json() : null;
}

const assets = Object.fromEntries((await table('prompt_assets?select=key,content') ?? []).map((r) => [r.key, r.content ?? '']));
const len = (k) => (assets[k] ?? '').trim().length;
const has = (k) => len(k) > 0;
// "**제목** `키` (상태)"
const slot = (key, label) =>
  `**${label}** \`${key}\` ${has(key) ? `✅ ${len(key).toLocaleString()}자` : '⚠ 없음'}`;

// 컬럼 존재 여부
const colOk = async (q) => (await fetch(`${URL_}/rest/v1/${q}`, { headers: H })).ok;
const iuCol = await colOk('passages?select=idea_units&limit=1');
const stateCol = await colOk('da_session_state?select=state&limit=1');

const EXAMPLE_CYCLE = 'cycle1';
const passage = (await table('passages?select=cycle_key,title,content') ?? []).find((p) => p.cycle_key === EXAMPLE_CYCLE);
const passageLen = (passage?.content ?? '').length;

const out = [];
const w = (s = '') => out.push(s);
const fence = (b, lang = 'text') => { w('```' + lang); w(b); w('```'); w(); };

// ══ 과제 평가 ══════════════════════════════════════════════════════════════════
w('# 과제 평가 (Assessor) — LLM 턴별 인풋/아웃풋');
w();
w('> `node scripts/dump-prompt-examples.mjs` 로 재생성. `[]` = 프롬프트 자산.');
w('> **표시:** ✅ 설치됨 · ⚠ 없음 · `{{ }}` = 실행 시 채워짐.');
w();
w('요약문 제출 후 배경에서 실행 (챗봇팀만). **진단·선택(턴 1) → 심각도·순서(턴 2)** 2턴.');
w(`예시 지문: \`${EXAMPLE_CYCLE}\` — "${passage?.title ?? '(없음)'}" (${passageLen.toLocaleString()}자).`);
w();
w(`코드: \`runAssessor()\` 가 \`prompt_assessor_select\` 유무로 2턴/단일을 자동 선택 (2턴 프롬프트 있으면 2턴).`);
w();

w('## 턴 1 — 진단 + 다룰 항목 선택');
w();
w('`runAssessorSelect()` · 심각도·순서 없음.');
w();
w('**system**');
w(`1. ${slot('prompt_system', '과제 개요')}`);
w('2. `---`');
w(`3. ${slot('prompt_assessor_select', 'Assessor · Select')}`);
w();
w('**user**');
w(`- \`[SOURCE TEXT]\` : 지문 본문 (${passageLen.toLocaleString()}자)`);
w(`- \`[CYCLE KNOWLEDGE RESOURCE]\` : knowledge_${EXAMPLE_CYCLE} — 모범 요약문·IU 설명 ${has(`knowledge_${EXAMPLE_CYCLE}`) ? '' : '(현재 비어 생략)'}`);
w(`- \`[IU TABLE]\` : passages.idea_units ${iuCol ? '(비면 생략)' : '⚠ 컬럼 없음'}`);
w('- `[STUDENT SUMMARY]` : 학생 요약문');
w();
w('**출력**');
w('- `items` : 항목별 검출 결과 — `detected_descriptors`(key, evidence) · `diagnostic_rationale` · `feedback_focus` (심각도 없음)');
w('- `selected_items` : 다룰 항목 최대 3개 — `item` · `primary_descriptor` · `evidence_ref` · `feedback_focus`');
w();

w('## 턴 2 — 심각도 + 제시 순서 + 목표');
w();
w('`runAssessorOrder()` · 턴 1 출력을 입력으로 받음.');
w();
w('**system**');
w(`1. ${slot('prompt_system', '과제 개요')}`);
w('2. `---`');
w(`3. ${slot('prompt_assessor_order', 'Assessor · Order')}`);
w();
w('**user**');
w('- `[SOURCE TEXT]` : 지문 · `[STUDENT SUMMARY]` : 요약문');
w('- `[TURN 1 — DIAGNOSIS]` : 턴 1 출력 (items + selected_items)');
w();
w('**출력**');
w('- `severity` : 항목별 descriptor 등급 (high · medium · low)');
w('- `mediation_targets` : 다룰 항목 (tab 순)');
w('  - `tab` · `item` · `priority_rationale`');
w('  - `primary_mediation_unit` : `descriptor_key` · `feedback_focus` · `mediation_goal`(problem_identification, problem_solution_verbalization)');
w('  - `secondary_mediation_unit` : 보조 목표 or null');
w();
w('> 코드가 `severity` 를 턴 1 `items` 에 병합 → 최종 `AssessorOutput { items, mediation_targets }`.');
w();

w('## 턴 사이 — 코드 (LLM 없음)');
w('- `tabsFromPlan()` : `tab` 순서대로 탭 확정 ✅');
w('- `designateSecondaryTab()` : 보조 유닛 지정 (탭 3개면 없음) ✅');
w();
w('## 자산 상태');
w('| 프롬프트 | 상태 |');
w('|----------|------|');
for (const [k, l] of [['prompt_system', '과제 개요'], ['prompt_assessor_select', 'Assessor·Select'], ['prompt_assessor_order', 'Assessor·Order'], ['prompt_assessor', 'Assessor(구 단일·폴백용)']]) {
  w(`| **${l}** \`${k}\` | ${has(k) ? `✅ ${len(k).toLocaleString()}자` : '⚠ 없음'} |`);
}
w(`| 컬럼 \`passages.idea_units\` | ${iuCol ? '✅' : '⚠ 없음'} |`);
w();

fs.writeFileSync(path.join(ROOT, 'PROMPT_EXAMPLES.md'), out.join('\n'), 'utf8');
console.log('wrote PROMPT_EXAMPLES.md');

// ══ 채팅 ══════════════════════════════════════════════════════════════════════
out.length = 0;
const cat = has('prompt_category_guidance') ? '+ 항목 category 블록' : '';

w('# 채팅 (DA 상호작용) — LLM 턴별 인풋/아웃풋');
w();
w('> `[]` = 프롬프트 자산. 상태 전이·라우팅은 코드가 결정. 노드 3개.');
w('> **유닛정보** = current_item·descriptor·feedback_focus·근거·PI/PSV목표·current_target·current_step(1~5)·cumulative_pi·cumulative_psv');
w();
w('**프롬프트 상태**');
for (const [k, l] of [['prompt_analysis', 'Analysis'], ['prompt_mediator_common', 'Mediator (공통)'], ['prompt_category_guidance', 'Category 가이던스'], ['prompt_confirmation', 'Confirmation']]) {
  w(`- ${slot(k, l)}`);
}
w(`- DB \`da_session_state.state\` (세션 상태 JSONB) ${stateCol ? '✅' : '⚠ 없음'}`);
w('- ⚠ 실제 LLM 세션 미검증 (입출력 형식만 맞춤)');
w();

w('## 턴 0 — Mediator · 오프닝');
w('**입력:** 유닛정보(1위 탭, step 1) · `response_context=opening` · 지문 · 지식자료 · `[prompt_mediator_common ' + cat + ']`');
w('**출력:** `utterance` (첫 안내 발화)');
w();

w('## 턴 A — Analysis · 판정 (매 학생 메시지마다 먼저)');
w('**입력:** 유닛정보 · latest_tutor_utterance · latest_learner_response · current_unit_history(최근 12) · `[prompt_analysis]`');
w('**출력:** `classification`(on_track|confusion|off_topic) · `turn_pi` · `turn_psv`(absent|partial|sufficient|null) · `rationale`');
w();
w('### → 코드 분기 (LLM 없음)');
fence(`confusion            → 턴 A-1 (confusion_rephrase)
off_topic            → 턴 A-2 (off_topic_redirect)
on_track, 미충족      → 턴 A-3 (on_track_continue, step+1)
on_track, 둘 다 충족   → 턴 A-4 (전환 질문 → 다음은 턴 C)
on_track, 미충족+step5 → 턴 A-5 (종료형, 유닛 자동 종료)`);

const med = (ctx, note) => {
  w(`**입력:** 유닛정보 · \`response_context=${ctx}\` · latest_learner_response · history · \`[prompt_mediator_common ${cat}]\``);
  w(`**출력:** \`utterance\` — ${note}`);
  w();
};
w('## 턴 A-1 — Mediator · confusion'); med('confusion_rephrase', '같은 질문 더 쉬운 말로 (단계·목표 유지)');
w('## 턴 A-2 — Mediator · off_topic'); med('off_topic_redirect', '가볍게 받고 원래 문제로');
w('## 턴 A-3 — Mediator · 계속'); med('on_track_continue', '맞은 부분 짚고 다음 단계 힌트 (step+1, PI→PSV 자동 전환)');
w('## 턴 A-4 — Mediator · 전환 질문'); med('on_track_continue', '정리 + "넘어갈까요?" → 다음 학생 응답은 턴 C');
w('## 턴 A-5 — Mediator · step 5 (종료형)');
w('**입력:** 유닛정보(step 5) · `response_context=on_track_continue` · `[prompt_mediator_common ' + cat + ']`');
w('**출력:** `utterance` — 문제+해결 원리 직접 설명 → 코드: 유닛 종료 → 다음 유닛 오프닝(턴 0) 또는 턴 D');
w();

w('## 턴 C — Confirmation · 전환 확인 판정');
w('> 확인 대기 중일 때만. 대화 기록·요약·원문 안 넣음.');
w('**입력:** confirmation_question · latest_learner_response · current_item · feedback_focus · 근거 · `[prompt_confirmation]`');
w('**출력:** `decision`(move_on|continue_help|unclear) · `rationale`');
w();
w('### → 코드 분기');
fence(`move_on       → 유닛 종료 → 다음 유닛 오프닝(턴 0) 또는 턴 D
continue_help → 턴 C-1
unclear       → 코드가 되묻고 대기 유지 (LLM 없음)`);
w('## 턴 C-1 — Mediator · 추가 설명 1회'); med('post_confirmation_help', '직접 답변 1회 → 유닛 종료 (Confirmation 반복 안 함)');

w('## 턴 D — Mediator · 세션 마무리');
w('> 모든 유닛 종료 후. 25분 경과 시 진행 유닛만 끝내고 진입.');
w('**입력:** completed_unit_summaries · `response_context=session_closing_invite` · `[prompt_mediator_common]`');
w('**출력:** `utterance` — 다룬 내용 정리 + 질문 있는지');
w();
w('## 턴 D-1 — Mediator · 마지막 질문 답변');
w('> 종료 국면의 학생 질문. Analysis 안 거침.');
w('**입력:** latest_learner_response · completed_unit_summaries · `response_context=final_question_answer` · `[prompt_mediator_common]`');
w('**출력:** `utterance` — 5단계 없이 바로 직접 답변');
w();

fs.writeFileSync(path.join(ROOT, 'PROMPT_EXAMPLES_CHAT.md'), out.join('\n'), 'utf8');
console.log('wrote PROMPT_EXAMPLES_CHAT.md');
