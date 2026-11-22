export interface Grapheme {
  start: number;
  end: number;
  text: string;
}

type SegmenterLike = { segment(s: string): Iterable<{ segment: string; index: number }> };

let segmenter: SegmenterLike | null | undefined;
function getSegmenter(): SegmenterLike | null {
  if (segmenter === undefined) {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => SegmenterLike }).Segmenter;
    segmenter = Seg ? new Seg('en', { granularity: 'grapheme' }) : null;
  }
  return segmenter;
}

/**
 * Split text[from, to) into user-perceived characters. Line breaks are
 * returned as their own graphemes so callers can skip them.
 */
export function graphemes(text: string, from = 0, to = text.length): Grapheme[] {
  const slice = text.slice(from, to);
  const out: Grapheme[] = [];
  const seg = getSegmenter();
  if (seg) {
    for (const { segment, index } of seg.segment(slice)) {
      out.push({ start: from + index, end: from + index + segment.length, text: segment });
    }
    return out;
  }
  let i = 0;
  for (const ch of slice) {
    out.push({ start: from + i, end: from + i + ch.length, text: ch });
    i += ch.length;
  }
  return out;
}
