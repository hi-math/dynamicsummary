'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePrompts, savePromptAsset } from '@/actions/admin';
import type { Prompts } from '@/types';

const SYSTEM_PROMPTS = [
  { key: 'prompt_assessor',          label: 'Assessor',          desc: '학생 글 진단 → mediation plan' },
  { key: 'prompt_assessor_verifier', label: 'Assessor Verifier', desc: 'Assessor 출력 검증 (LLM-as-a-judge)' },
  { key: 'prompt_classifier',        label: 'Classifier',        desc: '학생 응답 3종 분류' },
  { key: 'prompt_evaluator',         label: 'Evaluator',         desc: 'identification + verbalization 판정' },
  { key: 'prompt_reexplainer',       label: 'Reexplainer',       desc: 'confusion 신호 대응 재설명' },
  { key: 'prompt_deflector',         label: 'Deflector',         desc: 'off_topic 대응' },
  { key: 'prompt_mediator_common',   label: 'Mediator (공통)',   desc: '발화 생성 — 항목 공통 규칙' },
];

const ITEM_PROMPTS = [
  { key: 'prompt_main_idea_coverage', label: 'main_idea_coverage', desc: '핵심 내용 선별 — 1~5단계 mediation' },
  { key: 'prompt_condensation',       label: 'condensation',       desc: '정보 압축' },
  { key: 'prompt_content_accuracy',   label: 'content_accuracy',   desc: '원문 충실성' },
  { key: 'prompt_paraphrasing',       label: 'paraphrasing',       desc: '원문 재진술' },
  { key: 'prompt_organization',       label: 'organization',       desc: 'paragraph 구조' },
  { key: 'prompt_language_use',       label: 'language_use',       desc: '언어 형식' },
];


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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-400">— {desc}</span>
        <div className="ml-auto flex gap-1.5">
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

type SectionKey = 'system' | 'item' | 'legacy';

export default function PromptsTab({ initialPrompts, initialAssets }: { initialPrompts: Prompts | null; initialAssets: Record<string, string> }) {
  const { showToast } = useToast();
  const [section, setSection] = useState<SectionKey>('system');
  const [saving, setSaving] = useState(false);

  async function handleLegacySave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await savePrompts(fd);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('저장되었습니다.', 'success');
  }

  const SECTIONS: { key: SectionKey; label: string; count: number }[] = [
    { key: 'system', label: '시스템 프롬프트', count: 7 },
    { key: 'item',   label: '항목별 프롬프트', count: 6 },
    { key: 'legacy', label: '기본 설정',       count: 2 },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">프롬프트 관리</h2>
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${section === s.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {s.label} <span className="ml-1 text-slate-400 font-normal">({s.count})</span>
          </button>
        ))}
      </div>

      {section === 'system' && (
        <div className="space-y-3">
          {SYSTEM_PROMPTS.map((a) => <AssetSlot key={a.key} assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />)}
        </div>
      )}
      {section === 'item' && (
        <div className="space-y-3">
          {ITEM_PROMPTS.map((a) => <AssetSlot key={a.key} assetKey={a.key} label={a.label} desc={a.desc} initialValue={initialAssets[a.key] ?? ''} />)}
        </div>
      )}
      {section === 'legacy' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-2xl">
          <p className="text-xs text-slate-400 mb-4">DA 파이프라인은 위 20개 자산을 사용합니다. 이 설정은 레거시용입니다.</p>
          <form onSubmit={handleLegacySave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">시스템 프롬프트</label>
              <textarea name="system_prompt" rows={5} defaultValue={initialPrompts?.system_prompt ?? ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">DA 프롬프트</label>
              <textarea name="da_prompt" rows={4} defaultValue={initialPrompts?.da_prompt ?? ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>
            <button type="submit" disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
