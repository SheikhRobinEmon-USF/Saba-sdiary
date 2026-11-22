import { expect, type Page } from '@playwright/test';

export interface Audit {
  ok: boolean;
  problems: string[];
  inked: number;
  pending: number;
  textMatches: boolean;
}

export async function openDiary(page: Page, opts: { clear?: boolean } = {}) {
  if (opts.clear !== false) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.clear();
        sessionStorage.setItem('__seeded', '1');
      }
    });
  }
  await page.goto('./');
  await page.waitForSelector('.editor[data-ready="true"]');
}

export const editor = (page: Page) => page.locator('#diary-text');

export async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => (window as unknown as { __scribe: { audit(): Audit } }).__scribe.audit());
}

/** Wait until every queued stroke has been drawn and the quill rests. */
export async function settle(page: Page, timeout = 15_000) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as { __scribe: { queue(): number; quillState(): string } }).__scribe;
          return s.queue() === 0 && s.quillState() === 'resting';
        }),
      { timeout },
    )
    .toBe(true);
}

export async function expectInkMatchesText(page: Page) {
  await settle(page);
  const a = await audit(page);
  expect(a.problems, 'ink audit problems').toEqual([]);
  expect(a.textMatches).toBe(true);
  expect(a.pending).toBe(0);
  return a;
}

export function inkableCount(text: string): number {
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].filter((s) => !/^\s+$/u.test(s.segment)).length;
}
