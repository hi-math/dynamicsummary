// Shared "copied from passage" highlighting.
//
// Finds every run of MIN_RUN+ consecutive words in the summary that also appears
// consecutively in the passage, and colors BOTH the summary run and the matching
// passage run with the SAME color, so the pair is visually linked. Colors cycle
// through HL_COLORS (8 distinct hues).

export const MIN_RUN = 3;

// 8 background/text color pairs (static class strings so Tailwind picks them up).
export const HL_COLORS = [
  'bg-amber-200 text-amber-900',
  'bg-lime-200 text-lime-900',
  'bg-sky-200 text-sky-900',
  'bg-violet-200 text-violet-900',
  'bg-pink-200 text-pink-900',
  'bg-orange-200 text-orange-900',
  'bg-cyan-200 text-cyan-900',
  'bg-emerald-200 text-emerald-900',
];

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

// color: index into HL_COLORS, or null when not part of a matched run.
export type ColorSegment = { text: string; color: number | null };

type Tok = { norm: string; start: number; end: number };

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index === undefined) continue;
    toks.push({ norm: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return toks;
}

// Build renderable segments from the raw text, the tokens, and a per-token color array.
// Whitespace/punctuation between two same-colored words is colored too, so a run
// renders as one continuous band.
function buildSegments(text: string, toks: Tok[], colors: (number | null)[]): ColorSegment[] {
  const segs: ColorSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w.start > cursor) {
      const gap = i > 0 && colors[i - 1] !== null && colors[i - 1] === colors[i] ? colors[i] : null;
      segs.push({ text: text.slice(cursor, w.start), color: gap });
    }
    segs.push({ text: text.slice(w.start, w.end), color: colors[i] });
    cursor = w.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), color: null });
  return segs;
}

/**
 * Compute matched-color segments for both the summary and the passage.
 * Deterministic: the same (summary, passage) input always yields the same colors,
 * so the summary panel and the passage panel can call this independently and still
 * agree on which color each shared phrase gets.
 */
export function computeHighlightPair(
  summary: string,
  passage: string,
): { summary: ColorSegment[]; passage: ColorSegment[] } {
  const sTok = tokenize(summary);
  const pTok = tokenize(passage);
  const sN = sTok.map((t) => t.norm);
  const pN = pTok.map((t) => t.norm);

  const sColor: (number | null)[] = new Array(sTok.length).fill(null);
  const pColor: (number | null)[] = new Array(pTok.length).fill(null);

  if (sN.length >= MIN_RUN && pN.length >= MIN_RUN) {
    // Index passage MIN_RUN-grams → starting positions.
    const idx = new Map<string, number[]>();
    for (let j = 0; j + MIN_RUN <= pN.length; j++) {
      const g = pN.slice(j, j + MIN_RUN).join(' ');
      const arr = idx.get(g);
      if (arr) arr.push(j);
      else idx.set(g, [j]);
    }

    // Greedy longest non-overlapping matches from the summary.
    let color = 0;
    let i = 0;
    while (i + MIN_RUN <= sTok.length) {
      const g = sN.slice(i, i + MIN_RUN).join(' ');
      const cands = idx.get(g);
      if (!cands) { i++; continue; }

      let bestLen = 0;
      let bestJ = -1;
      for (const j of cands) {
        let l = MIN_RUN;
        while (i + l < sTok.length && j + l < pTok.length && sN[i + l] === pN[j + l]) l++;
        if (l > bestLen) { bestLen = l; bestJ = j; }
      }

      if (bestLen >= MIN_RUN && bestJ >= 0) {
        const c = color % HL_COLORS.length;
        color++;
        for (let k = i; k < i + bestLen; k++) sColor[k] = c;
        for (let k = bestJ; k < bestJ + bestLen; k++) pColor[k] = c;
        i += bestLen;
      } else {
        i++;
      }
    }
  }

  return {
    summary: buildSegments(summary, sTok, sColor),
    passage: buildSegments(passage, pTok, pColor),
  };
}
