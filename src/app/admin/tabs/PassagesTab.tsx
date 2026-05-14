'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePassage } from '@/actions/admin';
import type { Passage } from '@/types';

const CYCLE_KEYS = [
  { key: 'pretest', label: '프리테스트' },
  { key: 'cycle1', label: '사이클 1' },
  { key: 'cycle2', label: '사이클 2' },
  { key: 'cycle3', label: '사이클 3' },
  { key: 'posttest', label: '포스트테스트' },
];

function PassageCard({
  cycleKey,
  label,
  initial,
}: {
  cycleKey: string;
  label: string;
  initial: Passage | undefined;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [draft, setDraft] = useState({ title, content });

  function handleEdit() {
    setDraft({ title, content });
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    const fd = new FormData();
    fd.set('cycle_key', cycleKey);
    fd.set('title', draft.title);
    fd.set('content', draft.content);
    const res = await savePassage(fd);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setTitle(draft.title);
    setContent(draft.content);
    setEditing(false);
    showToast(`${label} 지문이 저장되었습니다.`, 'success');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center px-5 py-3 border-b border-slate-100 bg-slate-50 gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={handleCancel}
              className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 transition-colors text-slate-500"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={handleEdit}
            className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 transition-colors text-slate-500"
          >
            수정
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="p-5 space-y-3">
        {editing ? (
          <>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="지문 제목"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <textarea
              rows={6}
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="지문 내용을 입력하세요..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed resize-none"
            />
          </>
        ) : (
          <>
            {title ? (
              <p className="text-sm font-medium text-slate-800">{title}</p>
            ) : (
              <p className="text-sm text-slate-300 italic">제목 없음</p>
            )}
            {content ? (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{content}</p>
            ) : (
              <p className="text-sm text-slate-300 italic">내용 없음</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PassagesTab({ initialPassages }: { initialPassages: Passage[] }) {
  const passageMap = Object.fromEntries(initialPassages.map((p) => [p.cycle_key, p]));

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">지문 관리</h2>
      <div className="space-y-3">
        {CYCLE_KEYS.map(({ key, label }) => (
          <PassageCard key={key} cycleKey={key} label={label} initial={passageMap[key]} />
        ))}
      </div>
    </div>
  );
}
