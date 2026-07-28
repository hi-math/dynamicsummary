'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePromptAsset } from '@/actions/admin';
import {
  DESCRIPTORS_ASSET_KEY, parseItems, serializeItems,
  type DescriptorDef, type ItemDef,
} from '@/lib/descriptors';

// 평가 항목과 descriptor 편집기.
// 저장하면 prompt_assets 의 `descriptors` 행에 JSON 으로 들어가고,
// Assessor 는 전체를, 판정·중재 턴은 현재 항목 하나만 프롬프트에 받는다.

function Field({ label, value, onChange, mono, rows, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  mono?: boolean; rows?: number; placeholder?: string;
}) {
  const cls = `w-full rounded-md border border-slate-300 px-2 py-1 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400 ${mono ? 'font-mono' : ''}`;
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-slate-400">{label}</span>
      {rows ? (
        <textarea rows={rows} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y`} />
      ) : (
        <input value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

export default function DescriptorsPanel({ initialValue }: { initialValue: string }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ItemDef[]>(() => parseItems(initialValue));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const total = items.reduce((n, i) => n + i.descriptors.length, 0);

  function update(next: ItemDef[]) {
    setItems(next);
    setDirty(true);
  }
  function patchItem(idx: number, patch: Partial<ItemDef>) {
    update(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function patchDescriptor(itemIdx: number, dIdx: number, patch: Partial<DescriptorDef>) {
    patchItem(itemIdx, {
      descriptors: items[itemIdx].descriptors.map((d, i) => (i === dIdx ? { ...d, ...patch } : d)),
    });
  }

  async function handleSave() {
    const emptyKey = items.find((i) => !i.key.trim())
      || items.flatMap((i) => i.descriptors).find((d) => !d.key.trim());
    if (emptyKey) { showToast('키가 비어 있는 항목/descriptor 가 있습니다.', 'error'); return; }

    setSaving(true);
    const res = await savePromptAsset(DESCRIPTORS_ASSET_KEY, serializeItems(items));
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setDirty(false);
    showToast(`평가 기준 저장됨 — ${items.length}항목 / ${total}descriptor`, 'success');
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <p className="max-w-3xl text-xs leading-relaxed text-slate-400">
          진단·중재의 공통 기준입니다. <b className="text-slate-500">① Assessor</b> 에는 전체가,{' '}
          <b className="text-slate-500">③ Analysis · ⑤ Mediation · ⑥ Provision · ⑨ Post Confirm</b> 에는
          현재 다루는 항목 하나만 프롬프트에 붙습니다.
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-slate-400">{items.length}항목 · {total}descriptor</span>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? '저장 중...' : dirty ? '저장' : '저장됨'}
          </button>
        </div>
      </div>

      <p className="mb-3 text-[11px] text-amber-600">
        ⚠ 항목 키는 Assessor 가 반환하는 <code className="font-mono">item</code> 값이자 학생 화면의 탭이 됩니다.
        키를 바꾸면 진행 중인 세션의 저장된 상태와 어긋날 수 있습니다.
      </p>

      <div className="space-y-3">
        {items.map((item, ii) => (
          <div key={ii} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="shrink-0 text-[10px] font-semibold text-slate-400">항목 {ii + 1}</span>
              <input
                value={item.key}
                onChange={(e) => patchItem(ii, { key: e.target.value })}
                className="w-56 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <input
                value={item.label}
                onChange={(e) => patchItem(ii, { label: e.target.value })}
                placeholder="표시 이름"
                className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="ml-auto text-[10px] text-slate-400">descriptor {item.descriptors.length}개</span>
              <button
                onClick={() => patchItem(ii, {
                  descriptors: [...item.descriptors, { key: '', description: '', detection: '' }],
                })}
                className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:bg-slate-100"
              >
                + descriptor
              </button>
            </div>

            <div className="space-y-2 p-3">
              <Field label="Core question — 이 항목이 묻는 것" value={item.coreQuestion}
                onChange={(v) => patchItem(ii, { coreQuestion: v })} />
              {item.descriptors.map((d, di) => (
                <div key={di} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="flex-1">
                      <Field label="descriptor 키" value={d.key} mono
                        onChange={(v) => patchDescriptor(ii, di, { key: v })} />
                    </div>
                    <button
                      onClick={() => patchItem(ii, { descriptors: item.descriptors.filter((_, i) => i !== di) })}
                      className="mt-4 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="space-y-2">
                    <Field label="설명 — 이 descriptor 가 무엇인지" value={d.description} rows={2}
                      onChange={(v) => patchDescriptor(ii, di, { description: v })} />
                    <Field label="탐지 지침 (Detection guidance) — 한 줄에 하나씩, '- ' 로 시작" value={d.detection} rows={3}
                      onChange={(v) => patchDescriptor(ii, di, { detection: v })} />
                  </div>
                </div>
              ))}
              {item.descriptors.length === 0 && (
                <p className="py-2 text-center text-[11px] italic text-slate-300">descriptor 가 없습니다.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => update([...items, { key: '', label: '', coreQuestion: '', descriptors: [] }])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100"
        >
          + 항목 추가
        </button>
        {items.length > 0 && (
          <button
            onClick={() => { if (confirm('마지막 항목을 삭제할까요?')) update(items.slice(0, -1)); }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            마지막 항목 삭제
          </button>
        )}
      </div>
    </div>
  );
}
