'use client';

import { useEffect, useRef, useState } from 'react';

export type SaveResult = { error?: string } | void;
export type NoteStatus = 'idle' | 'saving' | 'saved' | 'error';

// Debounced note autosave with unmount + beforeunload flush.
// - Saves `delay` ms after the last keystroke.
// - `flush()` (call on blur) saves immediately.
// - On unmount (in-app navigation / phase change) any pending change is flushed via onSave.
// - On tab close/refresh, onBeaconSave (navigator.sendBeacon) persists the last value,
//   since async server calls do not reliably complete during unload.
const DELAY = 800;

export function useNoteAutosave(
  initialValue: string,
  onSave: (value: string) => Promise<SaveResult>,
  onBeaconSave?: (value: string) => void,
  // Forces a reload even if initialValue text is unchanged (e.g. switching between two
  // students whose notes happen to be identical).
  resetKey?: string,
) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<NoteStatus>('idle');
  const valueRef = useRef(initialValue);
  const savedRef = useRef(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const onBeaconRef = useRef(onBeaconSave);
  useEffect(() => {
    onSaveRef.current = onSave;
    onBeaconRef.current = onBeaconSave;
  });

  // Reset when a different note loads (phase / cycle / selected student change).
  useEffect(() => {
    setValue(initialValue);
    valueRef.current = initialValue;
    savedRef.current = initialValue;
    setStatus('idle');
  }, [initialValue, resetKey]);

  async function flush() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const v = valueRef.current;
    if (v === savedRef.current) return;
    setStatus('saving');
    const res = await onSaveRef.current(v);
    if (res && res.error) { setStatus('error'); return; }
    savedRef.current = v;
    // Only show "saved" if nothing newer was typed while the request was in flight.
    setStatus(valueRef.current === v ? 'saved' : 'idle');
  }

  function onChange(v: string) {
    setValue(v);
    valueRef.current = v;
    if (status === 'saved' || status === 'error') setStatus('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DELAY);
  }

  useEffect(() => {
    function beforeUnload() {
      if (valueRef.current !== savedRef.current) onBeaconRef.current?.(valueRef.current);
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (valueRef.current !== savedRef.current) void onSaveRef.current(valueRef.current);
    };
  }, []);

  return { value, status, onChange, flush };
}

export function noteStatusLabel(status: NoteStatus): string {
  switch (status) {
    case 'saving': return '저장 중...';
    case 'saved':  return '저장됨';
    case 'error':  return '저장 실패';
    default:       return '자동 저장';
  }
}
