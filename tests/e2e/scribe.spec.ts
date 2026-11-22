import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { audit, editor, expectInkMatchesText, inkableCount, openDiary, settle } from './helpers';

const SENTENCE = 'Dear you, today was lovely.';

test.describe('handwriting engine', () => {
  test('A01 typing writes exactly the text while the nib tracks the stroke', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    const states = new Set<string>();
    await page.exposeFunction('__noteState', (s: string) => states.add(s));
    await page.evaluate(() => {
      const svg = document.querySelector('.ink-layer')!;
      new MutationObserver(() => (window as unknown as { __noteState(s: string): void }).__noteState(svg.getAttribute('data-quill') ?? '')).observe(svg, {
        attributes: true,
        attributeFilter: ['data-quill'],
      });
    });
    await page.keyboard.type('D');
    // first ink within ~100 ms of the keystroke (we allow CI slack)
    await expect.poll(() => page.locator('.ink-glyphs > *').count(), { timeout: 400, intervals: [20] }).toBeGreaterThan(0);

    // While writing, the nib tip (quill origin) sits on the stroke being drawn.
    await page.keyboard.type('ear you, today was ');
    let tracked = 0;
    for (let i = 0; i < 12; i++) {
      const sample = await page.evaluate(() => {
        const g = document.querySelector('.ink-glyphs g.drawing');
        // only while the nib is on the paper (not during lifts between strokes)
        if (!g || document.querySelector('.ink-layer')!.getAttribute('data-quill') !== 'writing') return null;
        const body = document.querySelector('.quill-body') as HTMLElement;
        const m = new DOMMatrix(getComputedStyle(body).transform);
        const tip = { x: m.e, y: m.f };
        const visible = [...g.querySelectorAll('path')].filter((p) => (p as SVGPathElement).style.visibility === 'visible');
        if (!visible.length) return null;
        // the stroke being drawn is the last visible nib triple; [1] of it is the centre line
        const path = visible[visible.length - 2] as SVGPathElement;
        const off = parseFloat(path.style.strokeDashoffset);
        const total = path.getTotalLength();
        const drawn = total + 1 - off;
        const pt = path.getPointAtLength(Math.max(0, Math.min(total, drawn)));
        const ctm = path.getScreenCTM()!;
        const sp = new DOMPoint(pt.x, pt.y).matrixTransform(ctm);
        return Math.hypot(sp.x - tip.x, sp.y - tip.y);
      });
      if (sample !== null) {
        expect(sample).toBeLessThan(4);
        tracked++;
      }
      await page.waitForTimeout(25);
    }
    expect(tracked).toBeGreaterThan(2);
    await page.keyboard.type('lovely.');
    await expect(editor(page)).toHaveValue(SENTENCE);
    const a = await expectInkMatchesText(page);
    expect(a.inked).toBe(inkableCount(SENTENCE));
    expect(states.has('writing')).toBe(true);
    expect([...states].some((s) => s === 'lift' || s === 'travel')).toBe(true);
  });

  test('A02 fast typing, a long paste, mid-text edits, backspace, undo and redo stay exact', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Quick words typed without pause, ', { delay: 0 });
    const paste = Array.from({ length: 24 }, (_, i) => `Line ${i + 1}: the ink keeps every letter safe and in its place.`).join(' ');
    expect(paste.length).toBeGreaterThan(1000);
    await page.evaluate((t) => navigator.clipboard?.writeText?.(t).catch(() => undefined), paste);
    await page.keyboard.insertText(paste);
    await page.keyboard.type(' The end.', { delay: 5 });
    const original = await editor(page).inputValue();
    // edit in the middle
    await page.evaluate(() => {
      const ta = document.querySelector('#diary-text') as HTMLTextAreaElement;
      ta.focus();
      ta.setSelectionRange(10, 10);
    });
    await page.keyboard.type('XYZ');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(editor(page)).toHaveValue(original.slice(0, 10) + 'X' + original.slice(10));
    await expectInkMatchesText(page);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expectInkMatchesText(page);
    await page.keyboard.press('Control+Shift+z');
    await expectInkMatchesText(page);
    // select-all replace
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Fresh start');
    await expect(editor(page)).toHaveValue('Fresh start');
    const a = await expectInkMatchesText(page);
    expect(a.inked).toBe(inkableCount('Fresh start'));
  });

  test('A03 Enter and automatic wrapping move to the next line with no connecting ink', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('First line\nSecond line that is long enough to wrap around the page edge naturally on its own', { delay: 4 });
    await expectInkMatchesText(page);
    const lines = await page.evaluate(() => {
      const lh = parseFloat(getComputedStyle(document.querySelector('.editor-mirror')!).lineHeight);
      const glyphs = [...document.querySelectorAll('.ink-glyphs use')].map((u) => u.getBoundingClientRect());
      const tallest = Math.max(...glyphs.map((r) => r.height));
      const baselines = new Set(
        [...document.querySelectorAll('.ink-glyphs use')].map((u) => Math.round(parseFloat(/translate\([^ ]+ ([^)]+)\)/.exec(u.getAttribute('transform')!)![1]))),
      );
      return { lh, tallest, lines: baselines.size };
    });
    expect(lines.lines).toBeGreaterThanOrEqual(3); // Enter + at least one wrap
    // no glyph is taller than a line and a half: nothing connects lines
    expect(lines.tallest).toBeLessThan(lines.lh * 1.6);
  });

  test('A04 resizing while writing keeps ink aligned and the text editable', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Resizing the window while the quill is busy writing this sentence', { delay: 10 });
    await page.setViewportSize({ width: 820, height: 700 });
    await page.keyboard.type(' and more', { delay: 10 });
    await page.setViewportSize({ width: 390, height: 700 });
    await expectInkMatchesText(page);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.keyboard.type('!');
    await expectInkMatchesText(page);
    await expect(editor(page)).toHaveValue(/busy writing this sentence and more!$/);
  });

  test('A04 @mobile phone layout writes and stays aligned', async ({ page }) => {
    await openDiary(page);
    await editor(page).tap();
    await page.keyboard.type('Writing on a small phone screen, the quill follows.', { delay: 8 });
    await expectInkMatchesText(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('A09 unsupported characters remain visible via a readable fallback', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.insertText('Cat 🐈 and 日本 and Ω.');
    await expectInkMatchesText(page);
    const fallbacks = await page.locator('.fallback-glyph').allTextContents();
    expect(fallbacks).toEqual(expect.arrayContaining(['🐈', '日', '本']));
  });

  test('IME composition shows provisional text once, then writes the committed text', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Hi ');
    await settle(page);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.imeSetComposition', { text: 'wor', selectionStart: 3, selectionEnd: 3 });
    await expect.poll(() => page.locator('.ink-glyphs .provisional').count()).toBeGreaterThan(0);
    await client.send('Input.imeSetComposition', { text: 'world', selectionStart: 5, selectionEnd: 5 });
    await client.send('Input.insertText', { text: 'world' });
    await expect(editor(page)).toHaveValue('Hi world');
    const a = await expectInkMatchesText(page);
    expect(a.inked).toBe(inkableCount('Hi world'));
    await expect(page.locator('.ink-glyphs .provisional')).toHaveCount(0);
  });
});

test.describe('storage, export and backup', () => {
  test('A05 reload restores text, title and settings instantly without replay', async ({ page }) => {
    await openDiary(page);
    await page.locator('#entry-title').fill('A quiet evening');
    await editor(page).click();
    await page.keyboard.type('Saved and restored.', { delay: 5 });
    await page.getByRole('radio', { name: /Burgundy rose ink/ }).click();
    await settle(page);
    await page.waitForTimeout(500); // debounce
    await page.reload();
    await page.waitForSelector('.editor[data-ready="true"]');
    await expect(editor(page)).toHaveValue('Saved and restored.');
    await expect(page.locator('#entry-title')).toHaveValue('A quiet evening');
    await expect(page.getByRole('radio', { name: /Burgundy rose ink/ })).toHaveAttribute('aria-checked', 'true');
    // drawn immediately: nothing pending, no stroke-by-stroke groups
    const a = await audit(page);
    expect(a.pending).toBe(0);
    expect(a.inked).toBe(inkableCount('Saved and restored.'));
    await expect(page.locator('.ink-glyphs g.drawing')).toHaveCount(0);
  });

  test('A05 storage failures are reported and the session text survives', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'the-scribe:v1') throw new DOMException('full', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    });
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Do not lose me.');
    await expect(page.getByRole('status')).toContainText('Not saved', { timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Download a backup' })).toBeVisible();
    await expect(editor(page)).toHaveValue('Do not lose me.');
  });

  test('A05 corrupt saved data is never silently reset', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('the-scribe:v1', '{"schemaVersion":1,"text":'));
    await page.goto('./');
    await expect(page.getByRole('dialog', { name: 'The saved diary could not be read' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave it untouched' }).click();
    await editor(page).click();
    await page.keyboard.type('new words');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => localStorage.getItem('the-scribe:v1'))).toBe('{"schemaVersion":1,"text":');
  });

  test('A06 text and JSON exports preserve the exact canonical text', async ({ page }) => {
    await openDiary(page);
    const text = 'Line one\n\n  indented line with “quotes” — and 🐈\ttab\nlast';
    await editor(page).click();
    await page.keyboard.insertText(text);
    await page.getByRole('button', { name: 'Export' }).click();
    const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Plain text/ }).click()]);
    expect(fs.readFileSync(await txt.path(), 'utf8')).toBe(text);
    await page.getByRole('button', { name: 'Export' }).click();
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Backup/ }).click()]);
    const data = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
    expect(data.text).toBe(text);
    expect(data.schemaVersion).toBe(1);
    expect(data.format).toBe('sabas-diary-backup');
  });

  test('A06 print / PDF shows every line of a long entry and no floating UI', async ({ page }) => {
    await openDiary(page);
    const long = Array.from({ length: 60 }, (_, i) => `Entry line ${i + 1} — written with care.`).join('\n');
    await page.locator('#entry-title').fill('Long entry');
    await editor(page).click();
    await page.keyboard.insertText(long);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.app')).toBeHidden();
    await expect(page.locator('.quill-layer')).toBeHidden();
    await expect(page.locator('.print-text')).toHaveText(long, { useInnerText: true });
    await expect(page.locator('.print-title')).toHaveText('Long entry');
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(5000);
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/print-sample.pdf', pdf);
  });

  test('A12 imports validate the schema, confirm first and reject bad files safely', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Keep me');
    const input = page.locator('input[type=file]');
    await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByRole('dialog', { name: 'That backup could not be used' })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(editor(page)).toHaveValue('Keep me');

    const backup = {
      format: 'sabas-diary-backup',
      schemaVersion: 1,
      title: 'Restored',
      text: 'From the backup <b>not html</b>\r\nsecond line',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      preferences: { ink: 'black', sound: false, motion: 'auto', ambience: true, evil: 'x' },
    };
    await input.setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    const dlg = page.getByRole('dialog', { name: 'Replace this page with the backup?' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor(page)).toHaveValue('Keep me');
    await input.setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.getByRole('button', { name: 'Replace with backup' }).click();
    await expect(editor(page)).toHaveValue('From the backup <b>not html</b>\nsecond line');
    await expect(page.locator('#entry-title')).toHaveValue('Restored');
    await expect(page.locator('.ink-layer b')).toHaveCount(0);
    await expectInkMatchesText(page);
  });

  test('A14 new page asks for confirmation and offers a backup first', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Old page');
    await page.getByRole('button', { name: 'New page' }).click();
    const dlg = page.getByRole('dialog', { name: 'Start a fresh page?' });
    await expect(dlg).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download a backup first' }).click()]);
    expect(JSON.parse(fs.readFileSync(await dl.path(), 'utf8')).text).toBe('Old page');
    await dlg.getByRole('button', { name: /Erase/ }).click();
    await expect(editor(page)).toHaveValue('');
    const a = await audit(page);
    expect(a.inked).toBe(0);
  });

  test('another tab changing the diary pauses saving instead of overwriting', async ({ page, context }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Tab one');
    await page.waitForTimeout(500);
    const other = await context.newPage();
    await other.goto('./');
    await other.waitForSelector('.editor[data-ready="true"]');
    await other.locator('#diary-text').click();
    await other.keyboard.press('End');
    await other.keyboard.type(' plus tab two');
    await other.waitForTimeout(600);
    await expect(page.getByRole('alert')).toContainText('changed in another tab');
    await page.getByRole('button', { name: 'Load the other version' }).click();
    await expect(editor(page)).toHaveValue('Tab one plus tab two');
  });
});

test.describe('scene, sound, motion and accessibility', () => {
  test('A07 the cat wakes gracefully and the dedication shows; neither touches the text', async ({ page }) => {
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Hello cat');
    await expect(page.locator('.dedication')).toContainText('a little place to keep the things that matter');
    const cat = page.getByRole('button', { name: /sleeping cat/i });
    await cat.click();
    await expect(page.locator('.cat')).toHaveAttribute('data-mood', /waking|awake/);
    await expect(page.locator('.cat')).toHaveAttribute('data-mood', 'asleep', { timeout: 8000 });
    await expect(editor(page)).toHaveValue('Hello cat');
    // the wax seal opens the hidden note without changing the diary
    await page.getByRole('button', { name: /Wax seal/ }).click();
    await expect(page.getByRole('dialog', { name: /sealed in wax/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveValue('Hello cat');
  });

  test('A08 sound starts only after opt-in and can be muted', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __audioCreated: number; AudioContext: typeof AudioContext };
      w.__audioCreated = 0;
      const Orig = w.AudioContext;
      w.AudioContext = class extends Orig {
        constructor(...a: ConstructorParameters<typeof AudioContext>) {
          super(...a);
          w.__audioCreated++;
        }
      } as typeof AudioContext;
    });
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Silence first');
    await settle(page);
    expect(await page.evaluate(() => (window as unknown as { __audioCreated: number }).__audioCreated)).toBe(0);
    const toggle = page.getByRole('button', { name: /Sound off/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    expect(await page.evaluate(() => (window as unknown as { __audioCreated: number }).__audioCreated)).toBe(1);
    const mute = page.getByRole('button', { name: /Sound on/ });
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await mute.click();
    await expect(page.getByRole('button', { name: /Sound off/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('A08 reduced motion renders text promptly with no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('Instant ink please', { delay: 5 });
    const a = await audit(page);
    expect(a.pending).toBe(0);
    expect(a.inked).toBe(inkableCount('Instant ink please'));
    await expect(page.locator('.ink-glyphs g.drawing')).toHaveCount(0);
  });

  test('A09 keyboard-only writing, saving and exporting; every control is named', async ({ page }) => {
    await openDiary(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to the diary page' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('Only keys');
    await expect(editor(page)).toHaveValue('Only keys');
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role=radio], a, input, textarea')]
        .filter((el) => {
          const he = el as HTMLElement;
          if (he.offsetParent === null && getComputedStyle(he).position !== 'fixed') return false;
          const label =
            he.getAttribute('aria-label') ||
            he.textContent?.trim() ||
            (he.id && document.querySelector(`label[for="${he.id}"]`)?.textContent?.trim()) ||
            he.getAttribute('title');
          return !label;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    // reach the export menu with the keyboard
    const exportBtn = page.getByRole('button', { name: 'Export' });
    await exportBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Save as PDF/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: /Plain text/ })).toBeFocused();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(fs.readFileSync(await dl.path(), 'utf8')).toBe('Only keys');
  });

  test('A10 works offline-first: no request carries journal content off the page', async ({ page }) => {
    const external: string[] = [];
    const bodies: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4173/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
      const b = r.postData();
      if (b) bodies.push(b);
    });
    await openDiary(page);
    await editor(page).click();
    await page.keyboard.type('secret-marker-1234');
    await settle(page);
    await page.waitForTimeout(500);
    expect(external).toEqual([]);
    expect(bodies.join('')).not.toContain('secret-marker-1234');
  });

  for (const [w, h] of [
    [360, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ] as const) {
    test(`A11 layout at ${w}px has no overflow and keeps the paper generous`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openDiary(page);
      await editor(page).click();
      await page.keyboard.type('Dear you, today was lovely.', { delay: 4 });
      await settle(page);
      await page.waitForTimeout(1300);
      const m = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet')!.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, share: (sheet.width * sheet.height) / (innerWidth * innerHeight) };
      });
      expect(m.overflow).toBeLessThanOrEqual(0);
      expect(m.share).toBeGreaterThan(0.38);
      fs.mkdirSync('test-results/screens', { recursive: true });
      await page.screenshot({ path: `test-results/screens/scene-${w}x${h}.png` });
    });
  }
});
