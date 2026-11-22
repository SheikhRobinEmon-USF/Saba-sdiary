export interface TextEdit {
  /** Index in both strings where the change begins. */
  start: number;
  /** Number of UTF-16 code units removed from the old text. */
  removed: number;
  /** Text inserted in place of the removed range. */
  inserted: string;
}

/**
 * Minimal single-range diff between two strings. `caret` (the selection end in
 * the new text after the edit) disambiguates repeated characters so that the
 * inserted range lands where the user actually typed.
 */
export function diffText(prev: string, next: string, caret?: number): TextEdit | null {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);
  let p = 0;
  while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
  if (caret !== undefined && caret >= 0) {
    const insertedLen = next.length - prev.length;
    // When characters were inserted, the insertion cannot start after caret - insertedLen.
    if (insertedLen > 0) p = Math.min(p, Math.max(0, caret - insertedLen));
    else p = Math.min(p, caret);
  }
  // never split a surrogate pair
  if (p > 0 && isHighSurrogate(next.charCodeAt(p - 1))) p--;
  let s = 0;
  const maxS = Math.min(prev.length, next.length) - p;
  while (s < maxS && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
  if (s > 0 && isLowSurrogate(next.charCodeAt(next.length - s))) s--;
  return { start: p, removed: prev.length - p - s, inserted: next.slice(p, next.length - s) };
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

export function applyEdit(text: string, e: TextEdit): string {
  return text.slice(0, e.start) + e.inserted + text.slice(e.start + e.removed);
}
