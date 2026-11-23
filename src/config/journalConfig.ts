/**
 * Personal, gift-specific content lives here so the diary can be customised
 * without touching the handwriting engine or the components.
 */
export const journalConfig = {
  /** Shown in the masthead and the browser tab. */
  appName: "Saba's Personal Diary",
  /** Small line under the name. */
  tagline: 'a personal diary · every thought deserves to be written beautifully',
  /** Optional recipient name. Leave empty ('') to omit it everywhere. */
  recipientName: 'Saba',
  /** The dedication shown in the masthead and (optionally) in the PDF. */
  dedication: 'For you, a little place to keep the things that matter.',
  includeDedicationInPdf: true,
  /** Placeholders on the page. */
  titlePlaceholder: 'Dear diary…',
  bodyPlaceholder: 'Touch the page and begin to write…',
  /**
   * The hidden note revealed by the wax seal. It is shown in its own card and
   * is never written into the diary.
   */
  loveNote: {
    enabled: true,
    heading: 'A note, sealed in wax',
    paragraphs: [
      'Wherever this little book goes, may it keep your softest days, your bravest thoughts, and all the quiet things you would only tell a page.',
      'Write freely. Every word here is yours, and it stays right here with you.',
    ],
    signature: 'with love',
  },
  /** The two cats on the desk (coat: 'tabby' | 'tuxedo'). Labels are read by screen readers. */
  cats: [
    { coat: 'tabby', label: 'The cream tabby with the pink ribbon' },
    { coat: 'tuxedo', label: 'The little tuxedo cat with the bell' },
  ] as { coat: 'tabby' | 'tuxedo'; label: string }[],
  /** LocalStorage document key (versioned). */
  storageKey: 'the-scribe:v1',
  /** File name stem for exports. */
  exportFileStem: 'sabas-personal-diary',
} as const;

export type JournalConfig = typeof journalConfig;
