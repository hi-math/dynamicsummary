'use client';

import { useEffect, useState } from 'react';

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function SummaryPanel({
  initialValue,
  onBlur,
  onSubmit,
  onValueChange,
  submitted,
  submitting,
  submitLabel = '제출',
  hideSubmit = false,
}: {
  initialValue: string;
  onBlur: (value: string) => void;
  onSubmit?: (value: string) => void;
  onValueChange?: (value: string) => void;
  submitted: boolean;
  submitting: boolean;
  submitLabel?: string;
  hideSubmit?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    onValueChange?.(e.target.value);
  }

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">지문을 읽고 핵심 내용을 요약하세요.</h3>
        <span className="text-xs text-slate-400">{countWords(value)} 단어</span>
      </div>

      <textarea
        className="flex-1 p-4 text-sm text-slate-700 focus:outline-none resize-none leading-relaxed"
        placeholder="지문을 읽고 핵심 내용을 요약하세요..."
        value={value}
        onChange={handleChange}
        onBlur={() => onBlur(value)}
      />

      {!hideSubmit && onSubmit && !submitted && (
        <div className="px-4 py-2.5 border-t border-slate-200 shrink-0 flex justify-end">
          <button
            onClick={() => onSubmit(value)}
            disabled={submitting || !value.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {submitting && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {submitting ? '처리 중...' : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
