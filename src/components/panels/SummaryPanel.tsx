'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHighlightPair, type ColorSegment } from '@/lib/highlight';
import HighlightedText from '@/components/HighlightedText';

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// Shared text metrics so the overlay and textarea align character-for-character.
const textClasses = 'p-4 text-sm leading-relaxed whitespace-pre-wrap break-words';

// Self-contained editor area (overlay + textarea) with its own scroll-sync refs,
// so it can be rendered both inline and inside the popup modal.
function EditorArea({
  value,
  onChange,
  onBlur,
  segments,
  highlightActive,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  segments: ColorSegment[];
  highlightActive: boolean;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function syncScroll() {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  return (
    <div className="relative flex-1 min-h-0">
      {highlightActive && (
        <div
          ref={overlayRef}
          aria-hidden
          className={`absolute inset-0 overflow-auto pointer-events-none text-slate-700 ${textClasses}`}
        >
          <HighlightedText segments={segments} />
          {'​'}
        </div>
      )}
      <textarea
        ref={textareaRef}
        onScroll={syncScroll}
        className={`absolute inset-0 w-full h-full overflow-auto focus:outline-none resize-none bg-transparent placeholder:text-slate-400 ${textClasses} ${
          highlightActive ? 'text-transparent caret-slate-700' : 'text-slate-700'
        }`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
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
  highlightOn,
  onToggleHighlight,
  placeholder = '지문을 읽고 핵심 내용을 요약하세요...',
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
  highlightOn: boolean;
  onToggleHighlight: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [popped, setPopped] = useState(false);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  // Close popup on Escape
  useEffect(() => {
    if (!popped) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPopped(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popped]);

  const highlightActive = highlightOn && !!passageContent.trim();

  const segments = useMemo(
    () => (highlightActive ? computeHighlightPair(value, passageContent).summary : []),
    [highlightActive, value, passageContent]
  );

  function handleChange(v: string) {
    setValue(v);
    onValueChange?.(v);
  }

  const highlightToggle = passageContent.trim() ? (
    <button
      type="button"
      onClick={onToggleHighlight}
      title="지문과 3단어 이상 동일한 부분을 지문·요약문에 함께 하이라이트"
      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
    >
      <span className={`relative w-7 h-4 rounded-full transition-colors ${highlightOn ? 'bg-indigo-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${highlightOn ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      하이라이트
    </button>
  ) : null;

  const submitBar = !hideSubmit && onSubmit && !submitted ? (
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
  ) : null;

  return (
    <>
      <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 truncate">지문을 읽고 핵심 내용을 요약하세요. <span className="font-normal text-slate-400">(분량: 140-200단어)</span></h3>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-400">{countWords(value)} 단어</span>
            {highlightToggle}
            <button
              type="button"
              onClick={() => setPopped(true)}
              title="요약칸 팝업으로 크게 보기"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              팝업
            </button>
          </div>
        </div>

        <EditorArea
          value={value}
          onChange={handleChange}
          onBlur={() => onBlur(value)}
          segments={segments}
          highlightActive={highlightActive}
          placeholder={placeholder}
        />

        {submitBar}
      </div>

      {/* Popup modal */}
      {popped && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6"
          onClick={() => setPopped(false)}
        >
          <div
            className="flex flex-col w-full max-w-3xl h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 truncate">지문을 읽고 핵심 내용을 요약하세요. <span className="font-normal text-slate-400">(분량: 140-200단어)</span></h3>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400">{countWords(value)} 단어</span>
                {highlightToggle}
                <button
                  type="button"
                  onClick={() => setPopped(false)}
                  title="닫기"
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <EditorArea
              value={value}
              onChange={handleChange}
              onBlur={() => onBlur(value)}
              segments={segments}
              highlightActive={highlightActive}
              placeholder={placeholder}
            />

            {submitBar}
          </div>
        </div>
      )}
    </>
  );
}
