'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { savePrompts } from '@/actions/admin';
import type { Prompts } from '@/types';

export default function PromptsTab({ initialPrompts }: { initialPrompts: Prompts | null }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await savePrompts(fd);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('프롬프트가 저장되었습니다.', 'success');
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">프롬프트 설정</h2>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">시스템 프롬프트</label>
            <p className="text-xs text-slate-500 mb-2">AI의 기본 역할과 행동 방식을 정의합니다.</p>
            <textarea name="system_prompt" rows={6}
              defaultValue={initialPrompts?.system_prompt ?? ''}
              placeholder="AI 시스템 프롬프트를 입력하세요..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">동적평가(DA) 초기 프롬프트</label>
            <p className="text-xs text-slate-500 mb-2">학생이 요약문을 제출할 때 AI에게 보내는 첫 번째 평가 지시문입니다.</p>
            <textarea name="da_prompt" rows={5}
              defaultValue={initialPrompts?.da_prompt ?? ''}
              placeholder="동적평가 초기 프롬프트를 입력하세요..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 leading-relaxed" />
          </div>

          <button type="submit" disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>
    </div>
  );
}
