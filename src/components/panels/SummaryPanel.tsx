'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// Minimum run length (consecutive words) that counts as "copied" from the passage.
const MIN_RUN = 4;

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

type Segment = { text: string; hl: boolean };

function normalizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []) as string[];
}

/**
 * Split `summary` into segments, flagging any word that participates in a run of
 * MIN_RUN or more consecutive words also appearing consecutively in `passage`.
 * Whitespace/punctuation between two highlighted words is highlighted too, so a
 * run renders as one continuous band.
 */
function computeSegments(summary: string, passage: string): Segment[] {
  if (!summary) return [];

  // Collect summary words with their original-text offsets.
  const words: { norm: string; start: number; end: number }[] = [];
  for (const m of summary.matchAll(WORD_RE)) {
    if (m.index === undefined) continue;
    words.push({ norm: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  // Build the set of passage n-grams (length MIN_RUN).
  const pWords = normalizeWords(passage);
  const grams = new Set<string>();
  for (let i = 0; i + MIN_RUN <= pWords.length; i++) {
    grams.add(pWords.slice(i, i + MIN_RUN).join(' '));
  }

  // Flag every summary word covered by at least one matching window.
  const hl = new Array(words.length).fill(false);
  if (grams.size > 0) {
    for (let i = 0; i + MIN_RUN <= words.length; i++) {
      const gram = words.slice(i, i + MIN_RUN).map((w) => w.norm).join(' ');
      if (grams.has(gram)) {
        for (let k = i; k < i + MIN_RUN; k++) hl[k] = true;
      }
    }
  }

  // Rebuild the original text as highlighted / plain segments.
  const segs: Segment[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.start > cursor) {
      const gapHl = i > 0 && hl[i - 1] && hl[i]; // keep runs continuous across spaces/punctuation
      segs.push({ text: summary.slice(cursor, w.start), hl: gapHl });
    }
    segs.push({ text: summary.slice(w.start, w.end), hl: hl[i] });
    cursor = w.end;
  }
  if (cursor < summary.length) segs.push({ text: summary.slice(cursor), hl: false });
  return segs;
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
  passageContent = '',
}: {
  initialValue: string;
  onBlur: (value: string) => void;
  onSubmit?: (value: string) => void;
  onValueChange?: (value: string) => void;
  submitted: boolean;
  submitting: boolean;
  submitLabel?: string;
  hideSubmit?: boolean;
  passageContent?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [highlightOn, setHighlightOn] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  const highlightActive = highlightOn && !!passageContent.trim();

  const segments = useMemo(
    () => (highlightActive ? computeSegments(value, passageContent) : []),
    [highlightActive, value, passageContent]
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    onValueChange?.(e.target.value);
  }

  function syncScroll() {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  // Shared text metrics so the overlay and textarea align character-for-character.
  const textClasses = 'p-4 text-sm leading-relaxed whitespace-pre-wrap break-words';

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 truncate">지문을 읽고 핵심 내용을 요약하세요.</h3>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400">{countWords(value)} 단어</span>
          {passageContent.trim() && (
            <button
              type="button"
              onClick={() => setHighlightOn((v) => !v)}
              title="지문과 4단어 이상 동일한 부분 하이라이트"
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <span className={`relative w-7 h-4 rounded-full transition-colors ${highlightOn ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${highlightOn ? 'left-3.5' : 'left-0.5'}`} />
              </span>
              하이라이트
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {highlightActive && (
          <div
            ref={overlayRef}
            aria-hidden
            className={`absolute inset-0 overflow-auto pointer-events-none text-slate-700 ${textClasses}`}
          >
            {segments.map((seg, i) =>
              seg.hl ? (
                <mark key={i} className="bg-yellow-200 text-slate-800 rounded-sm">{seg.text}</mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
            {'​'}
          </div>
        )}
        <textarea
          ref={textareaRef}
          onScroll={syncScroll}
          className={`absolute inset-0 w-full h-full overflow-auto focus:outline-none resize-none bg-transparent ${textClasses} ${
            highlightActive ? 'text-transparent caret-slate-700' : 'text-slate-700'
          }`}
          placeholder="지문을 읽고 핵심 내용을 요약하세요..."
          value={value}
          onChange={handleChange}
          onBlur={() => onBlur(value)}
        />
      </div>

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
