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

      {!hideSubmit && onSubmit && (
        <div className="px-4 py-2.5 border-t border-slate-200 shrink-0 flex justify-end">
          <button
            onClick={() => onSubmit(value)}
            disabled={submitting || !value.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {submitting ? '처리 중...' : submitted ? '재제출' : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
