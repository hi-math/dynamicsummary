'use client';

import { useNoteAutosave, noteStatusLabel } from '@/lib/useNoteAutosave';

export default function NotesPanel({
  initialValue,
  onSave,
  onBeaconSave,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<{ error?: string } | void>;
  onBeaconSave?: (value: string) => void;
}) {
  const { value, status, onChange, flush } = useNoteAutosave(initialValue, onSave, onBeaconSave);

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">노트</h3>
        <span className={`text-xs ${status === 'error' ? 'text-red-500' : 'text-slate-400'}`}>{noteStatusLabel(status)}</span>
      </div>
      <textarea
        className="flex-1 p-4 text-sm text-slate-700 focus:outline-none resize-none leading-relaxed"
        placeholder="메모를 자유롭게 입력하세요 (자동 저장)..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
      />
    </div>
  );
}
