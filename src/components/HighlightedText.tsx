import { HL_COLORS, type ColorSegment } from '@/lib/highlight';

// Renders colored segments produced by computeHighlightPair. Matched runs use the
// paired color; unmatched text renders plainly.
export default function HighlightedText({ segments }: { segments: ColorSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.color !== null ? (
          <mark key={i} className={`${HL_COLORS[seg.color]} rounded-sm`}>{seg.text}</mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
