import { describe, expect, it } from 'vitest';
import { applyEdit, diffText } from '../../src/handwriting/textDiff';
import { graphemes } from '../../src/handwriting/graphemes';
import { compoundInkPath, glyphFor, hasInk, isBlank, supportedCharacters, translatePath } from '../../src/handwriting/glyphs';
import { BACKUP_FORMAT, emptyDocument, parseBackup, sanitizeText, toBackup, validateDocument } from '../../src/lib/journalDocument';
import { DEFAULT_PREFERENCES, sanitizePreferences } from '../../src/lib/preferences';

describe('diffText', () => {
  it('detects appends, deletions and replacements', () => {
    expect(diffText('abc', 'abcd')).toEqual({ start: 3, removed: 0, inserted: 'd' });
    expect(diffText('abcd', 'abc')).toEqual({ start: 3, removed: 1, inserted: '' });
    expect(diffText('hello world', 'hello there world')).toEqual({ start: 6, removed: 0, inserted: 'there ' });
    expect(diffText('one two', 'one 2')).toEqual({ start: 4, removed: 3, inserted: '2' });
    expect(diffText('same', 'same')).toBeNull();
  });

  it('uses the caret to place repeated characters where they were typed', () => {
    // typing "l" after "he" in "hello" → "helllo"; caret ends at 3
    expect(diffText('hello', 'helllo', 3)).toEqual({ start: 2, removed: 0, inserted: 'l' });
    // deleting the first of two "s" in "mississippi" at caret 2
    expect(diffText('mississippi', 'misissippi', 2)).toEqual({ start: 2, removed: 1, inserted: '' });
  });

  it('never splits surrogate pairs', () => {
    const e = diffText('a😀b', 'a😃b')!;
    expect(e.inserted).toBe('😃');
    expect(e.removed).toBe(2);
  });

  it('round-trips through applyEdit for random edits', () => {
    const alphabet = 'aab c\nd😀é';
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 400; i++) {
      const a = Array.from({ length: Math.floor(rand() * 12) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
      const b = Array.from({ length: Math.floor(rand() * 12) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
      const e = diffText(a, b);
      if (e) expect(applyEdit(a, e)).toBe(b);
    }
  });
});

describe('graphemes', () => {
  it('keeps emoji sequences and combining marks together', () => {
    const g = graphemes('é👩‍❤️‍👨x');
    expect(g.map((x) => x.text)).toEqual(['é', '👩‍❤️‍👨', 'x']);
    expect(g[1].start).toBe(2);
  });
  it('segments a sub-range with absolute offsets', () => {
    expect(graphemes('abcdef', 2, 4)).toEqual([
      { start: 2, end: 3, text: 'c' },
      { start: 3, end: 4, text: 'd' },
    ]);
  });
});

describe('handwriting glyph set', () => {
  it('covers printable ASCII, Latin-1 letters and smart punctuation', () => {
    for (let c = 0x21; c <= 0x7e; c++) expect(hasInk(glyphFor(String.fromCharCode(c))), String.fromCharCode(c)).toBe(true);
    for (const ch of 'àáâãäåèéêëìíîïñòóôõöùúûüýÿçÀÉÑÖÜßœ’‘“”…—–€'.replace('œ', '')) expect(hasInk(glyphFor(ch)), ch).toBe(true);
    expect(glyphFor('é')).toBe(glyphFor('é'));
    expect(supportedCharacters().length).toBeGreaterThan(250);
  });
  it('returns null for unsupported scripts so a fallback is used', () => {
    expect(glyphFor('日')).toBeNull();
    expect(glyphFor('🐈')).toBeNull();
  });
  it('treats whitespace as blank', () => {
    expect(isBlank(' ')).toBe(true);
    expect(isBlank('\t')).toBe(true);
    expect(isBlank('a')).toBe(false);
  });
  it('stores strokes as absolute M/C paths that start with a move', () => {
    for (const ch of supportedCharacters()) {
      for (const s of glyphFor(ch)!.s) {
        expect(s.d).toMatch(/^M-?\d/);
        expect(s.d).toMatch(/^[MC0-9 .-]+$/);
        expect(s.l).toBeGreaterThan(0);
      }
    }
  });
  it('writes lowercase a in natural pen direction (bowl first)', () => {
    const a = glyphFor('a')!.s[0].d;
    const [x, y] = a.slice(1).split(/[ C]/).map(Number);
    expect(x).toBeLessThan(400); // starts at the top of the bowl, not at the exit stroke
    expect(y).toBeLessThan(-300);
  });
  it('translates paths and builds the compound nib path', () => {
    expect(translatePath('M1 2C3 4 5 6 7 8', 10, -1)).toBe('M11 1C13 3 15 5 17 7');
    const g = glyphFor('i')!;
    const d = compoundInkPath('i', g);
    expect((d.match(/M/g) ?? []).length).toBe(g.s.length * 3);
  });
});

describe('journal document validation', () => {
  it('accepts a valid document and strips unknown preferences', () => {
    const v = validateDocument({ schemaVersion: 1, text: 'hi', title: 'T', preferences: { ink: 'rose', bogus: 1 } });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.doc.preferences).toEqual({ ...DEFAULT_PREFERENCES, ink: 'rose' });
      expect(v.doc.text).toBe('hi');
    }
  });
  it('rejects wrong versions, shapes and types', () => {
    expect(validateDocument(null).ok).toBe(false);
    expect(validateDocument([]).ok).toBe(false);
    expect(validateDocument({ schemaVersion: 2, text: '' }).ok).toBe(false);
    expect(validateDocument({ schemaVersion: 1, text: 5 }).ok).toBe(false);
    expect(validateDocument({ schemaVersion: 1, text: '', title: {} }).ok).toBe(false);
  });
  it('normalises line endings and removes control characters', () => {
    expect(sanitizeText('a\r\nb\rc\u0000d\u0007e\tf')).toBe('a\nb\ncde\tf');
  });
  it('parses backups and refuses non-backups', () => {
    const doc = { ...emptyDocument(), text: 'Dear you' };
    const ok = parseBackup(JSON.stringify(toBackup(doc)));
    expect(ok.ok && ok.doc.text).toBe('Dear you');
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...doc, format: 'other' })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1 })).ok).toBe(false);
  });
  it('keeps imported markup as plain text', () => {
    const v = parseBackup(JSON.stringify(toBackup({ ...emptyDocument(), text: '<img src=x onerror=alert(1)>' })));
    expect(v.ok && v.doc.text).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('preferences', () => {
  it('falls back to defaults for invalid values', () => {
    expect(sanitizePreferences({ ink: 'neon', sound: 'yes', motion: 'fast', ambience: 0 })).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.sound).toBe(false);
  });
});
