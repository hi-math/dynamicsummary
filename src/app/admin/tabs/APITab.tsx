'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { saveAPISettings } from '@/actions/admin';
import type { APISettings } from '@/types';

// OpenAI: 2026-07-09 GPT-5.6 세대(Sol/Terra/Luna)로 전환. 별칭 gpt-5.6 → Sol.
const OPENAI_MODELS = [
  'gpt-5.6-sol',    // 프론티어 티어
  'gpt-5.6-terra',  // 지능/비용 균형 (구 mini 티어)
  'gpt-5.6-luna',   // 최저가·고volume (구 nano 티어)
  'gpt-5.5',
  'gpt-5.4-mini',
  'gpt-4o',
];
// Anthropic: 별칭(alias) 문자열만 사용한다. 날짜 접미사를 붙이면 404가 난다.
// 권장 기본값은 claude-opus-4-8.
const ANTHROPIC_MODELS = [
  'claude-opus-4-8',   // 최신 Opus — 기본값 권장
  'claude-sonnet-5',   // Opus급 품질 / Sonnet 가격
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',  // 가장 저렴·빠름
];
// Gemini: 3.5 Flash가 GA(=gemini-flash-latest). 2.0 계열은 2026-06-01 종료됨.
const GEMINI_MODELS = [
  'gemini-3.5-flash',       // GA — 현행 Flash
  'gemini-3.1-pro-preview', // gemini-3-pro-preview 가 여기로 연결됨
  'gemini-3.1-flash-lite',  // 최저가
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

export default function APITab({ initialAPI }: { initialAPI: APISettings | null }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState(initialAPI?.provider ?? 'openai');
  const [openaiModel, setOpenaiModel] = useState(initialAPI?.openai_model ?? 'gpt-5.5');
  const [anthropicModel, setAnthropicModel] = useState(initialAPI?.anthropic_model ?? 'claude-opus-4-8');
  const [geminiModel, setGeminiModel] = useState(initialAPI?.gemini_model ?? 'gemini-2.5-flash');

  const activeModel =
    provider === 'openai' ? openaiModel :
    provider === 'anthropic' ? anthropicModel :
    geminiModel;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    fd.set('provider', provider);
    fd.set('openai_model', openaiModel);
    fd.set('anthropic_model', anthropicModel);
    fd.set('gemini_model', geminiModel);
    const res = await saveAPISettings(fd);
    setSaving(false);
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast('API 설정이 저장되었습니다.', 'success');
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">API 설정</h2>

      {/* 현재 활성 모델 표시 */}
      <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl max-w-lg">
        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <div className="text-sm text-slate-600">
          현재 챗봇 모델:
          <span className="ml-2 font-semibold text-indigo-700">{PROVIDER_LABEL[provider]} / {activeModel}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">제공사</label>
            <div className="flex gap-2">
              {(['openai', 'anthropic', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    provider === p
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Anthropic CORS warning */}
          {provider === 'anthropic' && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Anthropic API는 CORS 제한이 있습니다. Next.js 서버 액션을 통해 호출되므로 서버 환경에서는 정상 작동합니다.
            </div>
          )}

          {/* OpenAI */}
          {provider === 'openai' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                <input name="openai_key" type="password" defaultValue={initialAPI?.openai_key ?? ''}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">모델</label>
                <select name="openai_model" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Anthropic */}
          {provider === 'anthropic' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                <input name="anthropic_key" type="password" defaultValue={initialAPI?.anthropic_key ?? ''}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">모델</label>
                <select name="anthropic_model" value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {ANTHROPIC_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Gemini */}
          {provider === 'gemini' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                <input name="gemini_key" type="password" defaultValue={initialAPI?.gemini_key ?? ''}
                  placeholder="AIza..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">모델</label>
                <select name="gemini_model" value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Preserve keys for the non-active providers. The active provider's key is
              submitted by its visible input above — rendering a hidden field with the
              same name here too would create a duplicate. */}
          {provider !== 'openai' && (
            <input type="hidden" name="openai_key" value={initialAPI?.openai_key ?? ''} />
          )}
          {provider !== 'anthropic' && (
            <input type="hidden" name="anthropic_key" value={initialAPI?.anthropic_key ?? ''} />
          )}
          {provider !== 'gemini' && (
            <input type="hidden" name="gemini_key" value={initialAPI?.gemini_key ?? ''} />
          )}

          <button type="submit" disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>
    </div>
  );
}
