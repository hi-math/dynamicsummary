// Shared "copied from passage" highlighting: flags any run of MIN_RUN+ consecutive
// words in the summary that also appears consecutively in the passage.

export const MIN_RUN = 4;

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export type HighlightSegment = { text: string; hl: boolean };

function normalizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []) as string[];
}

/**
 * Split `summary` into segments, flagging words that participate in a run of
 * MIN_RUN or more consecutive words also appearing consecutively in `passage`.
 * Whitespace/punctuation between two highlighted words is highlighted too, so a
 * run renders as one continuous band.
 */
export function computeSummarySegments(summary: string, passage: string): HighlightSegment[] {
  if (!summary) return [];

  const words: { norm: string; start: number; end: number }[] = [];
  for (const m of summary.matchAll(WORD_RE)) {
    if (m.index === undefined) continue;
    words.push({ norm: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  const pWords = normalizeWords(passage);
  const grams = new Set<string>();
  for (let i = 0; i + MIN_RUN <= pWords.length; i++) {
    grams.add(pWords.slice(i, i + MIN_RUN).join(' '));
  }

  const hl = new Array(words.length).fill(false);
  if (grams.size > 0) {
    for (let i = 0; i + MIN_RUN <= words.length; i++) {
      const gram = words.slice(i, i + MIN_RUN).map((w) => w.norm).join(' ');
      if (grams.has(gram)) {
        for (let k = i; k < i + MIN_RUN; k++) hl[k] = true;
      }
    }
  }

  const segs: HighlightSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.start > cursor) {
      const gapHl = i > 0 && hl[i - 1] && hl[i];
      segs.push({ text: summary.slice(cursor, w.start), hl: gapHl });
    }
    segs.push({ text: summary.slice(w.start, w.end), hl: hl[i] });
    cursor = w.end;
  }
  if (cursor < summary.length) segs.push({ text: summary.slice(cursor), hl: false });
  return segs;
}
