'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePromptAsset } from '@/actions/admin';
import {
  OUTPUT_ANALYSIS, OUTPUT_ASSESSOR, OUTPUT_CONFIRMATION, OUTPUT_MEDIATION, OUTPUT_UTTERANCE,
} from '@/lib/da-output';
import { DESCRIPTORS_ASSET_KEY } from '@/lib/descriptors';
import DescriptorsPanel from './DescriptorsPanel';

// LLM 호출 턴 하나에 프롬프트 자산 하나가 대응한다.
// 여기 있는 것은 모두 코드가 실제로 읽는 자산이다.
type PromptDef = { key: string; label: string; desc: string };

// ── 1. 시스템 프롬프트 — 모든 턴에 공통 주입 ──
const SYSTEM_PROMPTS: PromptDef[] = [
  { key: 'prompt_system', label: '과제 개요',  desc: '과제 전체 설명 — 모든 턴(판정·발화)의 맨 앞에 주입' },
  { key: 'prompt_style',  label: '공통 말투',  desc: '학생에게 보이는 모든 발화의 어조·금지 표현 — 발화 턴에만 주입' },
];

// ── 2. 과제 평가 — 제출된 요약문 진단 (세션 시작 전 1회, 학생 비노출) ──
const EVAL_PROMPTS: PromptDef[] = [
  { key: 'prompt_assessor', label: '① Assessor', desc: '요약문 진단 → 중재 항목 선정 (우선순위·제시순서·PI/PSV 목표)' },
];

// ── 3. 세션 턴 — 실행 순서대로. ⚖ = 판정(비노출), 💬 = 학생에게 보이는 발화 ──
// 지식자료(knowledge)는 과제별로 다르므로 여기가 아니라 지문 관리 탭에서 편집한다.
const CHAT_PROMPTS: PromptDef[] = [
  { key: 'prompt_opening',           label: '② 💬 Opening',        desc: '탭 첫 발화 — 항목 키만 받는다 (진단·요약문·지문 미전달)' },
  { key: 'prompt_analysis',          label: '③ ⚖ Analysis',        desc: '매 응답 분류(on_track·confusion·off_topic) + 활성 목표 PI/PSV 판정' },
  { key: 'prompt_recovery',          label: '④ 💬 Recovery',       desc: 'confusion·off_topic 복구 — 직전 발화와 학생 응답만 받는다 (mode 로 분기)' },
  { key: 'prompt_mediation',         label: '⑤ 💬 Mediation',      desc: '1~4단계 — 확정된 목표·단계에서 발화 (쓴 단계를 함께 신고)' },
  { key: 'prompt_provision',         label: '⑥ 💬 Provision',      desc: '5단계 — 답을 직접 제공하고 유닛 종료 (응답을 기다리지 않음)' },
  { key: 'prompt_confirm_invite',    label: '⑦ 💬 Confirm Invite',  desc: 'PI·PSV 충족 후 정리 + "다음으로 넘어갈까요?"' },
  { key: 'prompt_confirmation',      label: '⑧ ⚖ Confirmation',    desc: '전환 질문에 대한 학생 의사 판정 (move_on·continue_help·unclear)' },
  { key: 'prompt_post_confirm',      label: '⑨ 💬 Post Confirm',    desc: 'continue_help 일 때 직접 설명 1회 후 유닛 종료' },
  { key: 'prompt_closing',           label: '⑩ 💬 Closing',         desc: '마지막 탭 종료 시 세션 요약 — 세션의 마지막 발화' },
];

// 코드가 더 이상 읽지 않지만, 내용을 각 턴 프롬프트로 옮기는 동안 열람용으로 남겨 둔다.
const RETIRED_PROMPTS: PromptDef[] = [
  { key: 'prompt_category_guidance', label: '항목별 가이던스 (이관 중)', desc: '[CATEGORY:항목키] 교수 자료 — 코드가 읽지 않습니다. 내용을 ⑤⑥⑨ 프롬프트로 옮긴 뒤 삭제하세요' },
];

// ── 출력 계약 — 코드(src/lib/da-output.ts)가 소유하며 호출 시 프롬프트 뒤에 붙는다.
//    관리 화면에서는 형태만 표시하고, 전문은 텍스트 파일로 내려받게 한다.
//    (편집하려면 da-output.ts 를 고쳐야 한다.)
const UTTERANCE_KEYS = [
  'prompt_opening', 'prompt_recovery', 'prompt_provision',
  'prompt_confirm_invite', 'prompt_post_confirm', 'prompt_closing',
];

type OutputInfo = { shape: string; contract: string } | { shape: string; note: string };

function outputFor(key: string): OutputInfo {
  if (key === 'prompt_assessor') return { shape: 'JSON · selected_items[]', contract: OUTPUT_ASSESSOR };
  if (key === 'prompt_analysis') return { shape: 'JSON · classification + turn_pi/turn_psv', contract: OUTPUT_ANALYSIS };
  if (key === 'prompt_mediation') return { shape: 'JSON · 발화 + used_step', contract: OUTPUT_MEDIATION };
  if (key === 'prompt_confirmation') return { shape: 'JSON · decision', contract: OUTPUT_CONFIRMATION };
  if (UTTERANCE_KEYS.includes(key)) return { shape: '평문 발화', contract: OUTPUT_UTTERANCE };
  if (key === 'prompt_system') return { shape: '직접 호출 없음', note: '모든 턴(판정·발화)의 system 맨 앞에 주입됩니다. 출력 형식은 그 턴의 계약을 따릅니다.' };
  if (key === 'prompt_style') return { shape: '직접 호출 없음', note: '발화 턴 7종의 프롬프트 앞에 주입됩니다. 출력은 평문 발화입니다.' };
  return { shape: '미사용', note: '코드가 읽지 않습니다. 내용을 각 턴 프롬프트로 옮기는 동안 열람용으로만 남아 있습니다.' };
}

/** 출력 계약 — 클릭하면 전문을 텍스트 파일로 내려받는다. */
function OutputChip({ assetKey, label }: { assetKey: string; label: string }) {
  const info = outputFor(assetKey);

  // 단독 호출되지 않는 자산은 내려받을 계약이 없다 — 어디에 주입되는지만 알린다.
  if (!('contract' in info)) {
    return (
      <span
        title={info.note}
        className="shrink-0 cursor-help rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
      >
        출력: {info.shape}
      </span>
    );
  }

  const { shape, contract } = info;
  function download() {
    const body =
      `${label} (${assetKey}) — 출력 계약\n` +
      `출력 형태: ${shape}\n\n` +
      `이 계약은 프롬프트가 아니라 코드가 소유하며, 호출할 때 프롬프트 본문 뒤에 붙습니다.\n` +
      `수정하려면 src/lib/da-output.ts 를 고쳐야 합니다.\n\n` +
      `${'='.repeat(70)}\n\n${contract}\n`;
    const blob = new Blob(['﻿' + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assetKey}.output.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      title="클릭하면 이 프롬프트에 붙는 출력 계약 전문을 텍스트 파일로 내려받습니다"
      className="shrink-0 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
    >
      출력: {shape} ↓
    </button>
  );
}

function AssetSlot({ assetKey, label, desc, initialValue }: { assetKey: string; label: string; desc: string; initialValue: string }) {
  const { showToast } = useToast();
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await savePromptAsset(assetKey, draft);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setValue(draft);
    setEditing(false);
    showToast(`${label} 저장됨`, 'success');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 rounded-t-xl">
        <span className="text-xs font-semibold text-slate-700 shrink-0">{label}</span>
        <span className="text-xs text-slate-400 truncate">— {desc}</span>
        <OutputChip assetKey={assetKey} label={label} />
        <div className="ml-auto flex gap-1.5 shrink-0">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="text-xs px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md transition-colors">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => { setDraft(value); setEditing(false); }}
                className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                취소
              </button>
            </>
          ) : (
            <button onClick={() => { setDraft(value); setEditing(true); }}
              className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
              수정
            </button>
          )}
        </div>
      </div>
      <div className="p-3">
        {editing ? (
          <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y leading-relaxed" />
        ) : value ? (
          <pre className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-4 font-mono">{value}</pre>
        ) : (
          <p className="text-xs text-slate-300 italic">프롬프트가 입력되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}

type SectionKey = 'system' | 'eval' | 'chat' | 'items';

export default function PromptsTab({ initialAssets }: { initialAssets: Record<string, string> }) {
  const [section, setSection] = useState<SectionKey>('system');

  const SECTIONS: { key: SectionKey; label: string; count: number }[] = [
    { key: 'system', label: '시스템 프롬프트',   count: SYSTEM_PROMPTS.length },
    { key: 'eval',   label: '과제 평가 프롬프트', count: EVAL_PROMPTS.length },
    { key: 'chat',   label: '세션 턴 프롬프트',    count: CHAT_PROMPTS.length },
    { key: 'items',  label: '평가 기준',           count: 0 },
  ];

  const SECTION_DESC: Record<SectionKey, string> = {
    system: '모든 턴에 공통으로 주입됩니다. 과제 개요는 판정·발화 전부에, 공통 말투는 학생에게 보이는 발화 턴에만 붙습니다.',
    eval:   '학생이 제출한 요약문을 진단해 다룰 항목을 정하는 프롬프트입니다. 세션 시작 전 한 번 실행되며 결과는 학생에게 직접 보이지 않습니다.',
    chat:   'LLM 호출 턴 하나에 프롬프트 하나가 대응합니다. 번호는 실행 순서이며, ⚖ 는 학생에게 보이지 않는 판정, 💬 는 학생에게 보이는 발화입니다. (과제별 지식자료는 지문 관리 탭에서 편집)',
    items:  '',
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">프롬프트 관리</h2>
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${section === s.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {s.label}
            {s.count > 0 && <span className="ml-1 text-slate-400 font-normal">({s.count})</span>}
          </button>
        ))}
      </div>

      {SECTION_DESC[section] && (
        <p className="text-xs text-slate-400 mb-3 max-w-2xl leading-relaxed">{SECTION_DESC[section]}</p>
      )}

      {section === 'system' && (
        <div className="space-y-3">
          {SYSTEM_PROMPTS.map((a) => <AssetSlot key={a.key} assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />)}
        </div>
      )}
      {section === 'eval' && (
        <div className="space-y-3">
          {EVAL_PROMPTS.map((a) => <AssetSlot key={a.key} assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />)}
        </div>
      )}
      {section === 'chat' && (
        <div className="space-y-3">
          {CHAT_PROMPTS.map((a) => <AssetSlot key={a.key} assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />)}
          <p className="pt-2 text-[11px] text-slate-400">아래는 코드가 읽지 않는 자산입니다.</p>
          {RETIRED_PROMPTS.map((a) => (
            <div key={a.key} className="opacity-60">
              <AssetSlot assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />
            </div>
          ))}
        </div>
      )}
      {section === 'items' && (
        <DescriptorsPanel initialValue={initialAssets[DESCRIPTORS_ASSET_KEY] ?? ''} />
      )}
    </div>
  );
}
