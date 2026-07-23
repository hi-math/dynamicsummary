'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePassage, saveComprehensionQuestions, savePromptAsset } from '@/actions/admin';
import type { Passage, ComprehensionQuestion } from '@/types';

const CYCLE_KEYS = [
  { key: 'cycle1', label: '과제 1' },
  { key: 'cycle2', label: '과제 2' },
  { key: 'cycle3', label: '과제 3' },
  { key: 'cycle4', label: '과제 4' },
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
    showToast(`${label} 지시문이 저장되었습니다.`, 'success');
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

// ─── Knowledge prompt card (과제별 지식자료) ───────────────────────────────────
// 이 과제(cycle)의 지문을 설명하는 참고자료. loadPromptAssets(student.ts)가 현재 phase의
// knowledge_<cycle> 을 knowledge_active 로 골라, 과제평가(Assessor)의 user 입력에
// [PASSAGE KNOWLEDGE] 블록으로 넣는다. DA 채팅(Mediator)에서는 쓰지 않는다.

function KnowledgePromptCard({ cycleKey, label, initialValue }: { cycleKey: string; label: string; initialValue: string }) {
  const { showToast } = useToast();
  const assetKey = `knowledge_${cycleKey}`;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [draft, setDraft] = useState(initialValue);

  async function handleSave() {
    setSaving(true);
    const res = await savePromptAsset(assetKey, draft);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    setValue(draft);
    setEditing(false);
    showToast(`${label} 지식자료 프롬프트가 저장되었습니다.`, 'success');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center px-5 py-3 border-b border-slate-100 bg-slate-50 gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{label} — 지식자료 프롬프트</h3>
        <span className="text-xs text-slate-400 font-mono">{assetKey}</span>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving}
              className="ml-auto text-xs px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-md transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={() => { setDraft(value); setEditing(false); }}
              className="text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
              취소
            </button>
          </>
        ) : (
          <button onClick={() => { setDraft(value); setEditing(true); }}
            className="ml-auto text-xs px-2.5 py-0.5 border border-slate-300 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
            수정
          </button>
        )}
      </div>
      <div className="p-5">
        {editing ? (
          <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="이 과제에서 사용할 지식자료 프롬프트를 입력하세요..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y leading-relaxed" />
        ) : value ? (
          <pre className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-4 font-mono">{value}</pre>
        ) : (
          <p className="text-sm text-slate-300 italic">지식자료 프롬프트가 입력되지 않았습니다.</p>
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

export default function PassagesTab({
  initialPassages,
  initialComprehensionQs,
  initialPromptAssets,
}: {
  initialPassages: Passage[];
  initialComprehensionQs: { cycle_key: string; questions: ComprehensionQuestion[] }[];
  initialPromptAssets: Record<string, string>;
}) {
  const [activeKey, setActiveKey] = useState('cycle1');
  const passageMap = Object.fromEntries(initialPassages.map((p) => [p.cycle_key, p]));
  const comprehensionMap = Object.fromEntries(initialComprehensionQs.map((c) => [c.cycle_key, c.questions ?? []]));

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">과제 관리</h2>

      {/* Cycle tab bar */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        {CYCLE_KEYS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveKey(key)}
            className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeKey === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Active cycle content */}
      {CYCLE_KEYS.map(({ key, label }) =>
        activeKey === key ? (
          <div key={key} className="space-y-4">
            <PassageCard cycleKey={key} label={label} initial={passageMap[key]} />
            <KnowledgePromptCard cycleKey={key} label={label} initialValue={initialPromptAssets[`knowledge_${key}`] ?? ''} />
            <ComprehensionCard cycleKey={key} label={label} initial={comprehensionMap[key] ?? []} />
          </div>
        ) : null
      )}
    </div>
  );
}
