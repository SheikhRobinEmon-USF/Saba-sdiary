import data from './glyphs.generated.json';

export interface StrokeDef {
  /** Absolute SVG path (M/C only) in font units, y down, origin = pen on baseline. */
  d: string;
  /** Approximate length in font units (used for timing estimates). */
  l: number;
}

export interface GlyphDef {
  /** Advance width in font units. */
  w: number;
  s: StrokeDef[];
}

interface GlyphData {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  pen: { width: number; nibHalf: number; nibAngleDeg: number };
  glyphs: Record<string, GlyphDef>;
}

const font = data as unknown as GlyphData;

export const UNITS_PER_EM = font.unitsPerEm;
/** Ascender / descender as a fraction of the em (matches scribe-hand.woff2). */
export const ASCENDER = font.ascender;
export const DESCENDER = font.descender;

const nibAngle = (font.pen.nibAngleDeg * Math.PI) / 180;
/** Pen model in font units (screen orientation, y down). */
export const PEN = {
  width: font.pen.width * UNITS_PER_EM,
  /** Offset of the outer nib copies, in font units. */
  nibDx: Math.cos(nibAngle) * font.pen.nibHalf * UNITS_PER_EM,
  nibDy: -Math.sin(nibAngle) * font.pen.nibHalf * UNITS_PER_EM,
};

/**
 * Glyph for one grapheme, or null when the handwriting set cannot draw it
 * (the renderer then shows a readable typeset fallback).
 */
export function glyphFor(grapheme: string): GlyphDef | null {
  const direct = font.glyphs[grapheme];
  if (direct) return direct;
  const nfc = grapheme.normalize('NFC');
  return font.glyphs[nfc] ?? null;
}

/** True when the grapheme is whitespace (no ink, no fallback). */
export function isBlank(grapheme: string): boolean {
  return /^\s+$/u.test(grapheme);
}

export function hasInk(glyph: GlyphDef | null): glyph is GlyphDef {
  return !!glyph && glyph.s.length > 0;
}

/** Translate every coordinate pair of an absolute M/C path. */
export function translatePath(d: string, dx: number, dy: number): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => {
    const v = parseFloat(n) + (i++ % 2 === 0 ? dx : dy);
    return String(Math.round(v * 10) / 10);
  });
}

const compoundCache = new Map<string, string>();
/**
 * Every stroke of the glyph swept by the three nib copies, as one path. Used
 * for finished ink so that each written letter costs a single DOM node.
 */
export function compoundInkPath(ch: string, glyph: GlyphDef): string {
  let d = compoundCache.get(ch);
  if (d === undefined) {
    const parts: string[] = [];
    for (const s of glyph.s) {
      parts.push(translatePath(s.d, -PEN.nibDx, -PEN.nibDy), s.d, translatePath(s.d, PEN.nibDx, PEN.nibDy));
    }
    d = parts.join('');
    compoundCache.set(ch, d);
  }
  return d;
}

/** Characters the handwriting set can draw (for tests and docs). */
export function supportedCharacters(): string[] {
  return Object.keys(font.glyphs);
}
