'use client';

import { useEffect, useState } from 'react';

export default function NotesPanel({
  initialValue,
  onBlur,
}: {
  initialValue: string;
  onBlur: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
        <h3 className="text-sm font-semibold text-slate-700">노트</h3>
      </div>
      <textarea
        className="flex-1 p-4 text-sm text-slate-700 focus:outline-none resize-none leading-relaxed"
        placeholder="메모를 자유롭게 입력하세요 (자동 저장)..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onBlur(value)}
      />
    </div>
  );
}
