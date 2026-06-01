'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePassage, saveComprehensionQuestions } from '@/actions/admin';
import type { Passage, ComprehensionQuestion } from '@/types';

const CYCLE_KEYS = [
  { key: 'cycle1', label: '사이클 1' },
  { key: 'cycle2', label: '사이클 2' },
  { key: 'cycle3', label: '사이클 3' },
  { key: 'cycle4', label: '사이클 4' },
];

// ─── Passage card ─────────────────────────────────────────────────────────────

function PassageCard({ cycleKey, label, initial }: { cycleKey: string; label: string; initial: Passage | undefined }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [draft, setDraft] = useState({ title, content });

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
      <div className="flex items-center px-5 py-3 border-b border-slate-100 bg-slate-50 gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{label} — 지시문</h3>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving}
              className="text-xs px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
              취소
            </button>
          </>
        ) : (
          <button onClick={() => { setDraft({ title, content }); setEditing(true); }}
            className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
            수정
          </button>
        )}
      </div>
      <div className="p-5 space-y-3">
        {editing ? (
          <>
            <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="지시문 제목"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <textarea rows={6} value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="지시문 내용을 입력하세요..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed resize-none" />
          </>
        ) : (
          <>
            {title ? <p className="text-sm font-medium text-slate-800">{title}</p> : <p className="text-sm text-slate-300 italic">제목 없음</p>}
            {content ? <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{content}</p> : <p className="text-sm text-slate-300 italic">내용 없음</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Comprehension questions card ─────────────────────────────────────────────

function ComprehensionCard({ cycleKey, label, initial }: { cycleKey: string; label: string; initial: ComprehensionQuestion[] }) {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<ComprehensionQuestion[]>(initial);
  const [saving, setSaving] = useState(false);

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { id: `q_${Date.now()}`, type: 'sa', stem: '', options: [], answer: '' },
    ]);
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  function updateQuestion(id: string, patch: Partial<ComprehensionQuestion>) {
    setQuestions((qs) => qs.map((q) => q.id === id ? { ...q, ...patch } : q));
  }

  function updateOption(id: string, idx: number, value: string) {
    setQuestions((qs) => qs.map((q) => {
      if (q.id !== id) return q;
      const opts = [...(q.options ?? [])];
      opts[idx] = value;
      return { ...q, options: opts };
    }));
  }

  function addOption(id: string) {
    setQuestions((qs) => qs.map((q) => q.id === id ? { ...q, options: [...(q.options ?? []), ''] } : q));
  }

  async function handleSave() {
    setSaving(true);
    const res = await saveComprehensionQuestions(cycleKey, questions);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast(`${label} 이해도 검사 저장됨`, 'success');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b border-slate-100 bg-slate-50 gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{label} — 이해도 검사 문항</h3>
        <span className="text-xs text-slate-400">{questions.length}개</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={addQuestion}
            className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
            + 문항 추가
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {questions.length === 0 && <p className="text-sm text-slate-300 italic text-center py-2">문항이 없습니다.</p>}
        {questions.map((q, idx) => (
          <div key={q.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Q{idx + 1}</span>
              <select value={q.type} onChange={(e) => updateQuestion(q.id, { type: e.target.value as 'mc' | 'sa' })}
                className="text-xs border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="sa">주관식</option>
                <option value="mc">객관식</option>
              </select>
              <button onClick={() => removeQuestion(q.id)} className="ml-auto text-xs text-red-400 hover:text-red-600">삭제</button>
            </div>
            <textarea rows={2} value={q.stem} onChange={(e) => updateQuestion(q.id, { stem: e.target.value })}
              placeholder="문항을 입력하세요..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            {q.type === 'mc' && (
              <div className="space-y-1.5">
                {(q.options ?? []).map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs text-slate-400 w-4">{i + 1}.</span>
                    <input value={opt} onChange={(e) => updateOption(q.id, i, e.target.value)}
                      placeholder={`선택지 ${i + 1}`}
                      className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                ))}
                <button onClick={() => addOption(q.id)} className="text-xs text-indigo-500 hover:text-indigo-700">+ 선택지 추가</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PassagesTab({ initialPassages, initialComprehensionQs }: {
  initialPassages: Passage[];
  initialComprehensionQs: { cycle_key: string; questions: ComprehensionQuestion[] }[];
}) {
  const passageMap = Object.fromEntries(initialPassages.map((p) => [p.cycle_key, p]));
  const comprehensionMap = Object.fromEntries(initialComprehensionQs.map((c) => [c.cycle_key, c.questions ?? []]));

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">지문 관리</h2>
      <div className="space-y-6">
        {CYCLE_KEYS.map(({ key, label }) => (
          <div key={key} className="space-y-3">
            <PassageCard cycleKey={key} label={label} initial={passageMap[key]} />
            <ComprehensionCard cycleKey={key} label={label} initial={comprehensionMap[key] ?? []} />
          </div>
        ))}
      </div>
    </div>
  );
}
