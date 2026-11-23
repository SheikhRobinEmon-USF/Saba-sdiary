# Saba's Personal Diary

*Every thought deserves to be written beautifully.*

A private, single-page diary that feels like an antique scholar's writing desk: aged parchment, an engraved feather quill, an inkpot, a pressed rose, a burgundy wax seal and a small sleeping cat with a dusty-pink ribbon. Type normally and the quill **writes your words stroke by stroke in real ink** — its nib follows the exact path of every letter.

**Live site:** https://sheikhrobinemon-usf.github.io/Saba-sdiary/

| Desktop | Phone |
|---|---|
| ![Desktop scene](docs/screenshots/desktop.jpg) | ![Phone scene](docs/screenshots/mobile.jpg) |

---

## What it does

- **Live handwriting.** The `<textarea>` is the real, accessible editor; a stroke engine draws each grapheme with pen strokes in natural writing order beneath a moving quill. Typing, selection, paste, undo/redo, deletion, line breaks and mobile IME composition all work normally.
- **Quill behaviour.** Travels lifted between words, writes with the nib on the paper, lifts at the end of each stroke, returns to the next line on Enter or wrap, rests in the margin when you pause, and now and then dips into the inkpot (after ~80–150 letters and a short idle). Typing interrupts the dip at once.
- **Never loses text.** The animation only mirrors the editor. Fast typing speeds the pen up; past ~500 ms of lag (or on a large paste) older letters are finished instantly and only a short tail is animated. Edits in the middle, undo/redo and resizes reconcile instantly.
- **Saves locally**, automatically (debounced ~300 ms, flushed on blur/page hide) into one versioned LocalStorage document. Reloads restore text, title and settings immediately — no replay.
- **Exports:** *Save as PDF* (print dialog, paginated, handwriting font, parchment background, title/date/dedication), plain text (exact text), and a versioned JSON backup that can be imported again after validation and confirmation.
- **Ink colours:** sepia, iron-gall black, burgundy rose — recolours existing writing; fresh ink dries from a wet tone.
- **Romance:** a pressed rose and petals, a trail of paw prints and a heart in the margin, and a heart-shaped wax seal (with a little cat face pressed into it) that opens a hidden note. An optional dedication line can be set in `journalConfig` (currently switched off).
- **Two cats on the desk** — a cream tabby with a dusty-pink ribbon and a little tuxedo with a burgundy ribbon and bell — drawn as jointed line-art puppets and run by a behaviour director modelled on real cat behaviour: sleeping curled up, loafing, slow "cat-kiss" blinks, kneading ("making biscuits"), licking a paw and washing the face, yawning, the play-bow and hind-leg stretch, ear twitches, tail swishes, head tilts, batting, the butt-wiggle pounce, meowing, strolling and trotting along the desk (leaving fading paw prints), nuzzling each other (a heart rises), grooming each other and curling up to nap together. They breathe, blink, and follow the quill — or a rolling ball — with their eyes. Every joint follows its target through a soft spring, walks speed up and slow down, legs move with the distance covered, and turning around is animated.
- **Big, detailed cats:** drawn at twice their original size (`catSize` in `journalConfig`), with textured fur, glossy layered eyes, fluffy cheeks, tapered ringed tails, toe beans and ribboned collars. The page's writing area always ends just above their heads, so nothing you write is ever hidden behind a cat; on a phone with the keyboard open they step out of the way entirely.
- **They react to your writing:** finish the word *cat*, *kitten*, *purr*… and both cats perk up (one may meow); the recipient's name earns a loving slow blink; *love*, *darling*, *hug*… send hearts up; *fish* makes a cat lick her lips and head for the aquarium once you pause; *dinner* or *treat* sends her to the bowl; *play* or *yarn* to the yarn; *sleepy* or *night* makes her yawn; *rain* flattens ears; and words like *sad*, *lonely* or *miss* bring a cat over to sit with you and purr. Finished sentences get an approving slow blink, new paragraphs an ear flick, big erasures a curious head tilt. After a good stretch of writing and a pause, a cat comes over, reads the page, and **signs it with an inky paw print beside your latest words** — decoration only: it is never saved and fades when you start writing again.
- **An aquarium** with three goldfish, swaying weeds and rising bubbles. The cats sit by the glass and watch (their eyes follow the fish), chatter at them and paw at the glass — and the fish dart away. Tap the tank to sprinkle food: the fish rise to eat and a cat comes to watch.
- **Their other things to play with:** a **ball of yarn** (tap it to roll it, or drag and let go to throw it — a cat will sprint after it and pounce; arrow keys roll it too), a **cat house** with a heart-shaped door (tap to invite a cat in for a nap — her eyes glow in the doorway — or to wake her), a **cardboard box** (if it fits, she sits), and a **food bowl** of fishy treats that empties as they eat (tap to refill; a hungry cat with an empty bowl sits and asks). Tap a cat, or focus it and press Enter, to wake her or say hello.
- **Calm while writing:** while you type, the cats only do quiet, in-place things and never walk across the page; with reduced motion they hold still. Settings offer *Playful*, *Calm* or *Hidden* cats.
- **Cat touches everywhere:** cats dozing on the library bookshelf with tails dangling, a cat-face mark beside the title, a paw-print save indicator, a cat-face favicon.
- **Sound (off until you turn it on):** soft quill scratches, an inkpot plip, purrs and chirps when you greet a cat, plus an optional **music-box lullaby with an occasional meow** from one of the cats (her mouth moves as she meows; never while you are typing). All of it is synthesised in the browser — there are no audio files — and one tap mutes everything.
- **Respectful by default:** reduced-motion users get instant ink and still cats; everything can be muted, calmed or hidden.

## Privacy

There is no backend, account, analytics or AI service. Nothing you write leaves the browser unless you export it yourself. LocalStorage belongs to this browser on this device: clearing site data or using a private window removes it, so download a backup now and then (**Export → Backup**). The automated tests assert that no network request carries diary content.

## Personalising the gift

Edit **`src/config/journalConfig.ts`** — app name, recipient name (optional), dedication, placeholders, the sealed love note (or disable it), storage key and export file names. No engine or component changes are needed.

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server at http://localhost:5173
npm test             # unit tests (Vitest)
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build
npm run test:e2e     # browser acceptance tests (Playwright, Chromium)
npm run gen:font     # rebuild handwriting data + Scribe Hand font from vendor/ems-allure
npm run gen:art      # regenerate the engraved SVG artwork
```

The production build is fully static, uses relative paths, and needs no keys. Pushing to `main` runs unit + browser tests and deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).

## How the handwriting engine works

`src/handwriting/handwritingEngine.ts`

1. **Canonical input.** A real `<textarea>` (transparent text, visible caret) holds the text. The engine never reads text back from the ink.
2. **Exact layout.** A hidden *mirror* element with identical typography lays out the same text in **Scribe Hand**, a companion font generated from the stroke data whose advance widths equal the strokes' widths. The browser's own line breaking therefore decides where every grapheme goes; the engine measures each grapheme with DOM `Range` rects and calibrates the baseline in place (so sub-pixel snapping matches the caret). In tests the ink and the textarea's own glyphs overlap pixel-for-pixel.
3. **Strokes.** Each grapheme is drawn from single-line pen strokes (EMS Allure, SIL OFL — see below), corrected to natural pen direction and smoothed into Béziers. A calligraphic nib is simulated by three offset copies of every stroke, so down-strokes are fuller than hairlines.
4. **Drawing & nib tracking.** Strokes are revealed with `stroke-dashoffset` in a `requestAnimationFrame` loop; the quill's anchor is the exact nib tip and its position comes from `getPointAtLength` on the same path at the same progress, transformed into scene coordinates. Tilt follows the tangent through a low-pass filter.
5. **Edits.** An input diff (disambiguated by the caret) updates only the affected graphemes; later paragraphs are shifted rather than re-measured. Anything other than typing after the current ink — deletes, mid-text edits, undo/redo — reconciles instantly. IME text is shown provisionally (faint) and written once on commit.
6. **State machine:** `resting → travel → writing ⇄ lift → … → resting`, plus `dipping` and `reconcile`, exposed as `data-quill` on the ink layer.
7. **Unsupported characters** (emoji, CJK, …) stay editable and visible as typeset text in the same position, laid out by the same fallback font chain as the editor.

Finished letters collapse into a single `<use>` of a shared glyph definition, so long diaries stay light.

**Why not Tegaki?** Tegaki (MIT) was evaluated: it renders handwriting beautifully but owns its own text layout, so it cannot be kept glyph-for-glyph aligned with a live, editable, wrapping textarea and caret; its EMS Allure bundle also keeps the plotter's reversed stroke order (e.g. `a`), and the package is ~76 MB. A small custom engine on the same single-line font fit the requirements better.

## Accessibility

Real form controls with visible focus, a skip link to the page, named buttons (icon-only buttons have labels), radio-group ink selector, native `<dialog>` modals, keyboard navigation in menus, polite save-status announcements, reduced-motion support and sufficient contrast. Decorative layers are `aria-hidden` and never intercept pointer input; screen readers read the textarea itself.

## Tests

- **Unit (Vitest, 18 tests):** text diff (incl. randomized round-trips and surrogate pairs), grapheme segmentation, glyph coverage and stroke data, document/backup validation and sanitising, preferences.
- **Browser (Playwright, Chromium, 31 tests):** acceptance tests A01–A12 + A14 — nib tracking during writing, exact text after fast typing / 1,000+ character paste / mid-text edits / undo / redo, line returns without connecting ink, resize while writing, phone layout, IME composition, reload without replay, storage-full and corrupt-data handling, exact `.txt`/`.json` exports, paginated print/PDF, validated import with confirmation, new-page confirmation with backup, cross-tab conflict, both cats reacting to tap/Enter, the cats' full repertoire, playing with the yarn / house / box / bowl, reacting to written words and signing the page with a paw print, the aquarium (fish swim, feeding brings a cat) and the writing area staying clear of the cats, the Playful / Calm / Hidden cat setting, cats staying calm while typing and never blocking the page, wax seal, sound opt-in and mute, reduced motion, keyboard-only use and accessible names, no network leakage, and screenshots at 360/390/768/1024/1440 px with overflow checks. Every writing test ends with an engine **audit** that re-measures the layout and checks each grapheme has exactly one correctly placed glyph.

Only Chromium is automated here; Safari/Firefox and real mobile keyboards should be spot-checked by hand.

## Project layout

```
src/
  App.tsx                    composition, dialogs, exports, preferences
  config/journalConfig.ts    personal content (name, dedication, love note)
  handwriting/               engine, glyph data, diff, graphemes
  cats/                      cat rig (poses), behaviour director with springs, toys logic, action key poses
  components/                DeskScene, NotebookEditor, Quill, Inkpot, CatsLayer, CatCompanion,
                             CatToys, WaxSeal, Dedication, Toolbar, Modal, PrintSheet, Icons
  hooks/useJournalStorage.ts versioned LocalStorage document
  lib/                       exportJournal, journalDocument, preferences, sound
  assets/art/                generated engraved SVG artwork
  assets/fonts/              Scribe Hand (generated, OFL)
scripts/                     font and artwork generators
vendor/ems-allure/           source stroke font + licence
tests/unit, tests/e2e        Vitest and Playwright suites
```

## Credits & licences

- Code: MIT (see `LICENSE`).
- Handwriting strokes: **EMS Allure** by Sheldon B. Michaels (single-line derivative of *Allura* by Rob Leuschke, TypeSETit), SVG conversion by Windell H. Oskay — **SIL Open Font License 1.1** (`vendor/ems-allure/OFL.txt`). The derived *Scribe Hand* font and stroke data are distributed under the same licence.
- **Cormorant Garamond** and **IM Fell English** — SIL OFL 1.1, bundled locally via Fontsource.
- All artwork (quill, inkpot, desk and library, rose, petals, botanicals, wax seal, cat, icons) is original, generated from code in this repository. Sounds, the lullaby (an original melody) and the meows are synthesised in the browser; there are no audio files.

## Scope notes

Implemented: all P0 requirements and the P1 items (inkpot dipping, dust-in-lamplight ambience, ink drying, wax-seal note). Deliberately not included: multiple sheets per notebook (one sheet scrolls without limit), per-passage ink colours (ink is global, as allowed for v1), and a candle — the warm lamplight and drifting dust stand in for it.
