/**
 * The signature handwriting engine.
 *
 * The <textarea> is the single source of truth for text. A hidden "mirror"
 * element with identical typography lays the same text out with the
 * companion Scribe Hand font (whose advance widths equal the stroke glyphs'),
 * so the browser's own line breaking tells us exactly where every grapheme
 * sits. For each grapheme we draw the corresponding pen strokes in an SVG
 * layer, stroke by stroke, and move the quill nib along the very same SVG
 * path geometry (getPointAtLength) while the ink is revealed.
 *
 * The engine never reads text back from the ink; it only mirrors the editor.
 */
import { ASCENDER, DESCENDER, PEN, UNITS_PER_EM, compoundInkPath, glyphFor, hasInk, isBlank, type GlyphDef } from './glyphs';
import { graphemes } from './graphemes';
import { diffText, type TextEdit } from './textDiff';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type EditKind = 'type' | 'paste' | 'instant' | 'provisional';
export type QuillState = 'resting' | 'travel' | 'writing' | 'lift' | 'dipping' | 'reconcile';

export interface QuillPose {
  /** Nib tip in editor-content coordinates (px). */
  x: number;
  y: number;
  /** 0 = nib on paper, 1 = lifted, negative = lowered into the inkpot. */
  lift: number;
  /** Gentle tilt in degrees, derived from the stroke tangent. */
  tilt: number;
  state: QuillState;
  /** False until the engine knows where the nib should be. */
  placed: boolean;
}

export interface EngineOptions {
  container: HTMLElement;
  mirror: HTMLElement;
  svg: SVGSVGElement;
  fallbackLayer: HTMLElement;
  onPose?: (pose: QuillPose) => void;
  /** Called when the nib touches down / scratches; used for optional sound. */
  onInkEvent?: (e: 'stroke' | 'dip') => void;
  /** Inkpot mouth in editor-content coordinates, or null when not reachable. */
  getInkpotPoint?: () => { x: number; y: number } | null;
}

type UnitKind = 'ink' | 'fallback' | 'blank' | 'newline';
type UnitState = 'queued' | 'drawing' | 'done' | 'provisional';

interface Unit {
  start: number;
  end: number;
  text: string;
  kind: UnitKind;
  glyph: GlyphDef | null;
  x: number;
  y: number; // baseline for ink, rect top for fallback
  w: number;
  h: number;
  measured: boolean;
  state: UnitState;
  node: Element | null;
  dead: boolean;
}

interface StrokeRun {
  paths: SVGPathElement[]; // nib copies; [1] is the centre line used for tracking
  len: number;
}

interface Task {
  unit: Unit;
  runs: StrokeRun[];
  stroke: number;
  phase: 'travel' | 'write' | 'glide';
  t: number; // elapsed in phase (ms)
  dur: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface DipStep {
  to: { x: number; y: number } | null;
  lift: number;
  dur: number;
}

/** Writing speed in font units per millisecond at normal pace. */
const BASE_SPEED = 15;
const TRAVEL_PX_PER_MS = 1.7;
const MAX_LAG_MS = 500;
const PASTE_ANIMATED_TAIL = 24;
const TYPE_ANIMATE_LIMIT = 40;

export class HandwritingEngine {
  private opts: EngineOptions;
  private text = '';
  private units: Unit[] = [];
  private queue: Unit[] = [];
  private task: Task | null = null;
  private defs: SVGDefsElement;
  private inkGroup: SVGGElement;
  private definedGlyphs = new Set<string>();
  private fontSize = 40;
  private raf = 0;
  private lastFrame = 0;
  private instant = false;
  private dipEnabled = true;
  private pose: QuillPose = { x: 0, y: 0, lift: 1, tilt: 0, state: 'resting', placed: false };
  private targetTilt = 0;
  private charsSinceDip = 0;
  private dipThreshold = randomDipThreshold();
  private dip: { steps: DipStep[]; i: number; t: number; from: { x: number; y: number; lift: number } } | null = null;
  private wetTimers: number[] = [];
  private glide: { from: { x: number; y: number; lift: number }; to: { x: number; y: number; lift: number }; t: number; dur: number } | null = null;
  private destroyed = false;
  private caretIndex = 0;
  private parkTimer = 0;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    const svg = opts.svg;
    svg.replaceChildren();
    this.defs = document.createElementNS(SVG_NS, 'defs');
    this.inkGroup = document.createElementNS(SVG_NS, 'g');
    this.inkGroup.setAttribute('class', 'ink-glyphs');
    svg.append(this.defs, this.inkGroup);
    opts.fallbackLayer.replaceChildren();
    this.ensureMirrorText();
  }

  // ------------------------------------------------------------ public API

  get currentText(): string {
    return this.text;
  }

  get queueLength(): number {
    return this.queue.length + (this.task ? 1 : 0);
  }

  get quillState(): QuillState {
    return this.pose.state;
  }

  setInstant(instant: boolean): void {
    this.instant = instant;
    if (instant) this.finalizeAll();
  }

  setDipping(enabled: boolean): void {
    this.dipEnabled = enabled;
    if (!enabled && this.dip) this.abortDip();
  }

  /**
   * Bring the ink in line with the editor's text. `caret` is the selection end
   * after the change; it disambiguates where repeated characters were typed.
   */
  setText(next: string, kind: EditKind, caret?: number): void {
    if (this.destroyed) return;
    if (caret !== undefined) this.caretIndex = caret;
    clearTimeout(this.parkTimer);
    const edit = diffText(this.text, next, caret);
    if (!edit) {
      if (kind !== 'provisional') this.commitProvisional();
      return;
    }
    const appendLike = edit.start >= this.lastInkedEnd();
    // Anything but typing/pasting after the current ink is a reconcile: finish
    // all pending ink immediately so nothing stale or misplaced survives.
    if (!(appendLike && (kind === 'type' || kind === 'paste'))) {
      if (this.queueLength) this.setState('reconcile');
      this.finalizeAll();
    }
    this.text = next;
    const created = this.applyStructure(edit, kind);
    this.ensureMirrorText();
    this.measureAfterEdit(edit);
    this.placeAll(created);
    this.scheduleNew(created, kind);
    if (this.task && this.task.unit.dead) this.task = null;
    this.kick();
  }

  /** Replace everything without animation (restore from storage, import). */
  load(text: string): void {
    this.finalizeAll();
    this.units.forEach((u) => this.removeNode(u));
    this.units = [];
    this.queue = [];
    this.task = null;
    this.text = '';
    this.setText(text, 'instant');
  }

  /** Re-measure everything (resize, font load, orientation). Never replays. */
  relayout(): void {
    if (this.destroyed) return;
    this.finalizeAll();
    this.ensureMirrorText();
    this.readFontSize();
    this.measureRange(0, this.units.length);
    for (const u of this.units) this.position(u);
    const last = this.lastInkUnit();
    if (last) this.placeRestNear(last);
    this.emit();
  }

  /** Complete every pending stroke immediately (export, visibility change). */
  finalizeAll(): void {
    if (this.task) {
      this.finishUnit(this.task.unit, false);
      this.task = null;
    }
    for (const u of this.queue) if (!u.dead) this.finishUnit(u, false);
    this.queue = [];
    if (this.dip) this.abortDip();
    this.glide = null;
    if (this.pose.state !== 'resting') this.setState('resting');
    this.emit();
  }

  /** Glide the resting quill to hover near a caret position. */
  restAtCaret(index: number): void {
    this.caretIndex = index;
    if (this.task || this.queue.length || this.dip) return;
    const to = this.parkPoint(index);
    if (!to) return;
    if (!this.pose.placed || this.instant) {
      Object.assign(this.pose, to, { placed: true });
      this.emit();
      return;
    }
    const dist = Math.hypot(to.x - this.pose.x, to.y - this.pose.y);
    if (dist < 2) return;
    this.glide = { from: { x: this.pose.x, y: this.pose.y, lift: this.pose.lift }, to, t: 0, dur: clamp(dist / 1.2, 160, 420) };
    this.kick();
  }

  /**
   * Where the quill rests: lifted in the right margin of the caret's line, so
   * the feather never hides what was just written.
   */
  private parkPoint(index: number): { x: number; y: number; lift: number } | null {
    const p = this.caretPoint(index);
    if (!p) return null;
    const cs = getComputedStyle(this.opts.mirror);
    const padR = parseFloat(cs.paddingRight) || 0;
    const width = this.opts.container.clientWidth;
    const marginX = width - padR + Math.min(20, padR * 0.55);
    return { x: Math.max(p.x + 6, marginX), y: p.y - 4, lift: 1 };
  }

  private schedulePark(): void {
    clearTimeout(this.parkTimer);
    this.parkTimer = window.setTimeout(() => {
      if (this.task || this.queue.length || this.dip || this.destroyed) return;
      this.restAtCaret(this.caretIndex);
    }, 1100);
  }

  /** Caret position (x, baseline) in content coordinates. */
  caretPoint(index: number): { x: number; y: number } | null {
    const node = this.opts.mirror.firstChild;
    if (!node) return null;
    const cr = this.opts.container.getBoundingClientRect();
    const range = document.createRange();
    const len = node.textContent?.length ?? 0;
    const i = clamp(index, 0, len);
    try {
      if (i > 0 && this.text[i - 1] !== '\n') {
        range.setStart(node, i - 1);
        range.setEnd(node, i);
        const r = lastRect(range);
        if (r) return { x: r.right - cr.left, y: r.top - cr.top + this.ascentPx(r.height) };
      }
      range.setStart(node, i);
      range.setEnd(node, Math.min(i + 1, len));
      const r = firstRect(range);
      if (r) return { x: r.left - cr.left, y: r.top - cr.top + this.ascentPx(r.height) };
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Self-check used by the automated tests: the ink must mirror the
   * canonical text exactly — same graphemes, one node each, right glyph, and
   * placed where a fresh layout measurement says it belongs.
   */
  audit(): { ok: boolean; problems: string[]; inked: number; pending: number } {
    const problems: string[] = [];
    if (this.units.map((u) => u.text).join('') !== this.text) problems.push('graphemes do not spell the text');
    let pos = 0;
    let nodes = 0;
    let pending = 0;
    for (const u of this.units) {
      if (u.start !== pos) problems.push(`gap at ${pos}`);
      pos = u.end;
      if (u.kind === 'ink' || u.kind === 'fallback') {
        if (u.state !== 'done') pending++;
        if (!u.node) {
          if (u.state === 'done') problems.push(`missing ink at ${u.start}`);
          continue;
        }
        nodes++;
        if (u.kind === 'ink' && u.state === 'done' && u.node.getAttribute('href') !== '#' + this.glyphId(u.text)) problems.push(`wrong glyph at ${u.start}`);
        if (u.kind === 'fallback' && u.node.textContent !== u.text) problems.push(`wrong fallback at ${u.start}`);
      } else if (u.node) problems.push(`blank with ink at ${u.start}`);
    }
    const domNodes = this.inkGroup.childElementCount + this.opts.fallbackLayer.childElementCount;
    if (domNodes !== nodes) problems.push(`stray ink nodes: dom ${domNodes} vs ${nodes}`);
    const before = this.units.map((u) => [u.x, u.y]);
    this.measureRange(0, this.units.length);
    this.units.forEach((u, i) => {
      if (!u.measured || (u.kind !== 'ink' && u.kind !== 'fallback')) return;
      if (Math.abs(u.x - before[i][0]) > 0.6 || Math.abs(u.y - before[i][1]) > 0.6) problems.push(`misplaced ink at ${u.start}`);
    });
    return { ok: problems.length === 0, problems: problems.slice(0, 20), inked: nodes, pending };
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.parkTimer);
    clearTimeout(this.idleTimer);
    this.wetTimers.forEach((t) => clearTimeout(t));
  }

  // ------------------------------------------------------- text structure

  private lastInkedEnd(): number {
    // End offset of the last unit that is already (being) drawn.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.state === 'done' || u.state === 'drawing') return u.end;
    }
    return 0;
  }

  private unitIndexAt(offset: number): number {
    // first unit with end > offset
    let lo = 0;
    let hi = this.units.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.units[mid].end > offset) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Update the unit list for an edit; returns newly created units. */
  private applyStructure(edit: TextEdit, kind: EditKind): Unit[] {
    const delta = edit.inserted.length - edit.removed;
    const editEnd = edit.start + edit.removed;
    let lo = this.unitIndexAt(edit.start);
    if (lo > 0 && this.units[lo - 1].end === edit.start) lo--; // context for grapheme merges
    let hi = this.unitIndexAt(editEnd); // first unit ending after the removed range
    if (hi < this.units.length && this.units[hi].start < editEnd) hi++;
    if (hi < this.units.length) hi++; // following context
    const segStart = lo < this.units.length ? Math.min(this.units[lo].start, edit.start) : edit.start;
    const segEndOld = hi > 0 && hi - 1 < this.units.length && hi > lo ? Math.max(this.units[hi - 1].end, editEnd) : editEnd;
    const fresh = graphemes(this.text, segStart, segEndOld + delta);

    // keep identical leading / trailing context units (and their ink)
    let a = 0;
    while (a < fresh.length && lo + a < hi && this.units[lo + a].start === fresh[a].start && this.units[lo + a].text === fresh[a].text && fresh[a].end <= edit.start) a++;
    let b = 0;
    while (
      b < fresh.length - a &&
      hi - 1 - b >= lo + a &&
      this.units[hi - 1 - b].text === fresh[fresh.length - 1 - b].text &&
      this.units[hi - 1 - b].start + delta === fresh[fresh.length - 1 - b].start &&
      fresh[fresh.length - 1 - b].start >= edit.start + edit.inserted.length
    )
      b++;

    const removed = this.units.slice(lo + a, hi - b);
    for (const u of removed) {
      u.dead = true;
      this.removeNode(u);
    }
    if (removed.length) this.queue = this.queue.filter((u) => !u.dead);

    const created: Unit[] = fresh.slice(a, fresh.length - b).map((g) => {
      const kindOf: UnitKind = g.text === '\n' || g.text === '\r\n' ? 'newline' : isBlank(g.text) ? 'blank' : hasInk(glyphFor(g.text)) ? 'ink' : 'fallback';
      return {
        start: g.start,
        end: g.end,
        text: g.text,
        kind: kindOf,
        glyph: kindOf === 'ink' ? glyphFor(g.text) : null,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        measured: false,
        state: kind === 'provisional' ? 'provisional' : 'queued',
        node: null,
        dead: false,
      };
    });
    for (let i = hi - b; i < this.units.length; i++) {
      this.units[i].start += delta;
      this.units[i].end += delta;
    }
    this.units.splice(lo + a, hi - b - (lo + a), ...created);
    return created;
  }

  // ---------------------------------------------------------- measurement

  private ensureMirrorText(): void {
    const m = this.opts.mirror;
    // zero-width space keeps a trailing empty line measurable
    const want = this.text + '​';
    if (m.firstChild && m.firstChild.nodeType === Node.TEXT_NODE && m.childNodes.length === 1) {
      if ((m.firstChild as Text).data !== want) (m.firstChild as Text).data = want;
    } else {
      m.replaceChildren(document.createTextNode(want));
    }
  }

  private readFontSize(): void {
    const fs = parseFloat(getComputedStyle(this.opts.mirror).fontSize);
    if (fs > 0) this.fontSize = fs;
  }

  private measureAfterEdit(edit: TextEdit): void {
    this.readFontSize();
    const t = this.text;
    const paraStart = t.lastIndexOf('\n', edit.start - 1) + 1;
    const after = t.indexOf('\n', edit.start + edit.inserted.length);
    const paraEnd = after === -1 ? t.length : after;
    const i0 = this.unitIndexAt(paraStart);
    const i1 = this.unitIndexAt(paraEnd);
    // remember where the next measurable unit used to be
    let probe = -1;
    for (let i = i1; i < this.units.length; i++) {
      const u = this.units[i];
      if ((u.kind === 'ink' || u.kind === 'fallback') && u.measured) {
        probe = i;
        break;
      }
    }
    const oldProbeY = probe >= 0 ? this.units[probe].y : 0;
    this.measureRange(i0, i1);
    if (probe >= 0) {
      this.measureRange(probe, probe + 1);
      const dy = this.units[probe].y - oldProbeY;
      for (let i = i1; i < this.units.length; i++) {
        const u = this.units[i];
        if (i === probe || !u.measured) {
          if (!u.measured) this.measureRange(i, i + 1);
          continue;
        }
        if (dy !== 0) {
          u.y += dy;
          this.position(u);
        }
      }
    } else {
      this.measureRange(i1, this.units.length);
    }
  }

  private measureRange(i0: number, i1: number): void {
    const node = this.opts.mirror.firstChild;
    if (!node) return;
    const cr = this.opts.container.getBoundingClientRect();
    const range = document.createRange();
    for (let i = i0; i < i1; i++) {
      const u = this.units[i];
      if (u.kind !== 'ink' && u.kind !== 'fallback') continue;
      range.setStart(node, u.start);
      range.setEnd(node, u.end);
      const r = firstRect(range);
      if (!r) continue;
      u.x = r.left - cr.left;
      u.w = r.width;
      u.h = r.height;
      u.y = u.kind === 'ink' ? r.top - cr.top + this.ascentPx(r.height) : r.top - cr.top;
      u.measured = true;
      if (i < i0 || i >= i1) continue;
      this.position(u);
    }
  }

  /**
   * Distance from the top of a Scribe Hand glyph's content box to its
   * baseline, measured (not assumed) because engines round font metrics
   * differently. Calibrated once per font size with a zero-height
   * inline-block sitting on the baseline.
   */
  private baselineCache = new Map<string, number>();
  private ascentPx(height: number): number {
    const F = this.fontSize;
    const m = this.opts.mirror;
    const phase = (m.getBoundingClientRect().top % 1).toFixed(2);
    const key = `${F}|${phase}`;
    let off = this.baselineCache.get(key);
    if (off === undefined) {
      // Measure inside the mirror itself so sub-pixel snapping matches.
      const saved = [...m.childNodes];
      const text = document.createElement('span');
      text.textContent = 'x';
      const mark = document.createElement('span');
      mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      m.replaceChildren(text, mark);
      const tr = text.getBoundingClientRect();
      const mr = mark.getBoundingClientRect();
      m.replaceChildren(...saved);
      off = tr.height > 0 ? mr.top - tr.top : F * ASCENDER;
      this.baselineCache.set(key, off);
    }
    const expected = (ASCENDER + DESCENDER) * F;
    return Math.abs(height - expected) < 2 ? off : height * (ASCENDER / (ASCENDER + DESCENDER));
  }

  // ------------------------------------------------------------ rendering

  private get k(): number {
    return this.fontSize / UNITS_PER_EM;
  }

  private transformFor(u: Unit): string {
    return `translate(${r2(u.x)} ${r2(u.y)}) scale(${this.k.toFixed(5)})`;
  }

  private position(u: Unit): void {
    if (!u.node) return;
    if (u.kind === 'ink') u.node.setAttribute('transform', this.transformFor(u));
    else if (u.kind === 'fallback') {
      const el = u.node as HTMLElement;
      el.style.transform = `translate(${r2(u.x)}px, ${r2(u.y)}px)`;
      el.style.lineHeight = `${u.h}px`;
      el.style.fontSize = `${this.fontSize}px`;
    }
  }

  private placeAll(created: Unit[]): void {
    for (const u of created) if (u.state === 'provisional') this.drawInstant(u, true);
  }

  private glyphId(ch: string): string {
    const id = 'sg-' + [...ch].map((c) => c.codePointAt(0)!.toString(16)).join('-');
    if (!this.definedGlyphs.has(id)) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('id', id);
      p.setAttribute('d', compoundInkPath(ch, glyphFor(ch)!));
      this.defs.append(p);
      this.definedGlyphs.add(id);
    }
    return id;
  }

  private drawInstant(u: Unit, provisional = false, wet = false): void {
    this.removeNode(u);
    if (u.kind === 'ink') {
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#' + this.glyphId(u.text));
      use.setAttribute('class', provisional ? 'glyph provisional' : wet ? 'glyph wet' : 'glyph');
      this.inkGroup.append(use);
      u.node = use;
      if (wet) this.dryLater(use);
    } else if (u.kind === 'fallback') {
      const span = document.createElement('span');
      span.className = provisional ? 'fallback-glyph provisional' : 'fallback-glyph';
      span.textContent = u.text;
      this.opts.fallbackLayer.append(span);
      u.node = span;
    }
    u.state = provisional ? 'provisional' : 'done';
    this.position(u);
  }

  private dryLater(el: Element): void {
    const t = window.setTimeout(() => {
      el.classList.remove('wet');
      this.wetTimers = this.wetTimers.filter((x) => x !== t);
    }, 450);
    this.wetTimers.push(t);
  }

  private removeNode(u: Unit): void {
    if (u.node) {
      u.node.remove();
      u.node = null;
    }
  }

  private commitProvisional(): void {
    for (const u of this.units) if (u.state === 'provisional') this.drawInstant(u);
  }

  private finishUnit(u: Unit, wet: boolean): void {
    if (u.dead) return;
    if (u.kind === 'ink' || u.kind === 'fallback') this.drawInstant(u, false, wet && u.kind === 'ink');
    else u.state = 'done';
  }

  private scheduleNew(created: Unit[], kind: EditKind): void {
    if (kind === 'provisional') return;
    const drawable = created.filter((u) => u.kind === 'ink' || u.kind === 'fallback');
    if (kind === 'type' || kind === 'paste') this.charsSinceDip += Math.min(drawable.length, 60);
    let animate: Unit[] = [];
    if (!this.instant && (kind === 'type' || kind === 'paste')) {
      const tail = kind === 'paste' || drawable.length > TYPE_ANIMATE_LIMIT ? PASTE_ANIMATED_TAIL : drawable.length;
      animate = drawable.slice(Math.max(0, drawable.length - tail));
    }
    const animSet = new Set(animate);
    for (const u of created) {
      if (animSet.has(u)) continue;
      this.finishUnit(u, false);
    }
    if (animate.length) {
      // keep document order: new units go after everything already queued
      this.queue.push(...animate);
      this.queue.sort((p, q) => p.start - q.start);
      this.dip && this.abortDip();
      this.glide = null;
      this.enforceLag();
    }
  }

  // ------------------------------------------------------------ animation

  private speedFactor(): number {
    const backlog = this.queue.length;
    return 1 + Math.min(5, backlog / 5);
  }

  private estimateQueueMs(): number {
    const sp = BASE_SPEED * this.speedFactor();
    let ms = 0;
    for (const u of this.queue) {
      if (u.glyph) for (const s of u.glyph.s) ms += s.l / sp + 12;
      else ms += 60;
    }
    if (this.task) {
      const { unit, stroke } = this.task;
      if (unit.glyph) for (let i = stroke; i < unit.glyph.s.length; i++) ms += unit.glyph.s[i].l / sp;
    }
    return ms;
  }

  private enforceLag(): void {
    if (this.estimateQueueMs() <= MAX_LAG_MS) return;
    // Finish the oldest work immediately; keep animating a short tail.
    if (this.task) {
      this.finishUnit(this.task.unit, true);
      this.task = null;
    }
    while (this.queue.length > 1 && this.estimateQueueMs() > MAX_LAG_MS / 2) {
      const u = this.queue.shift()!;
      this.finishUnit(u, true);
    }
  }

  private kick(): void {
    if (this.raf || this.destroyed) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    let dt = Math.min(64, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    let guard = 0;
    while (dt > 0 && guard++ < 64) {
      const used = this.step(dt);
      if (used <= 0) break;
      dt -= used;
    }
    // ease the tilt towards the stroke tangent (no jitter)
    this.pose.tilt += (this.targetTilt - this.pose.tilt) * 0.12;
    this.emit();
    if (this.task || this.queue.length || this.dip || this.glide || Math.abs(this.targetTilt - this.pose.tilt) > 0.05) {
      this.kick();
    } else if (this.pose.state !== 'resting') {
      this.setState('resting');
      this.scheduleIdleDip();
      if (!this.dipPending()) this.schedulePark();
    }
  };

  /** Advance the state machine by up to dt ms; returns ms consumed. */
  private step(dt: number): number {
    if (!this.task && this.queue.length) {
      this.startNext();
      if (!this.task) return 0;
    }
    if (this.task) return this.stepTask(dt);
    if (this.dip) return this.stepDip(dt);
    if (this.glide) {
      const g = this.glide;
      g.t += dt;
      const e = easeInOut(Math.min(1, g.t / g.dur));
      this.pose.x = lerp(g.from.x, g.to.x, e);
      this.pose.y = lerp(g.from.y, g.to.y, e);
      this.pose.lift = lerp(g.from.lift, g.to.lift, e);
      if (g.t >= g.dur) this.glide = null;
      return dt;
    }
    return 0;
  }

  private startNext(): void {
    while (this.queue.length) {
      const u = this.queue.shift()!;
      if (u.dead || u.state === 'done') continue;
      if (!u.measured) this.measureRange(this.units.indexOf(u), this.units.indexOf(u) + 1);
      const runs: StrokeRun[] = [];
      if (u.kind === 'ink' && u.glyph) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'glyph wet drawing');
        g.setAttribute('transform', this.transformFor(u));
        this.removeNode(u);
        this.inkGroup.append(g);
        u.node = g;
        for (const s of u.glyph.s) {
          const paths: SVGPathElement[] = [];
          for (const m of [-1, 0, 1]) {
            const p = document.createElementNS(SVG_NS, 'path');
            p.setAttribute('d', s.d);
            if (m !== 0) p.setAttribute('transform', `translate(${r2(m * PEN.nibDx)} ${r2(m * PEN.nibDy)})`);
            p.style.visibility = 'hidden';
            paths.push(p);
            g.append(p);
          }
          const len = paths[1].getTotalLength() || s.l;
          for (const p of paths) {
            p.style.strokeDasharray = `${len + 1} ${len + 1}`;
            p.style.strokeDashoffset = `${len + 1}`;
          }
          runs.push({ paths, len: len || s.l });
        }
      } else if (u.kind === 'fallback') {
        this.drawInstant(u);
        (u.node as HTMLElement | null)?.classList.add('appearing');
      }
      u.state = 'drawing';
      this.task = { unit: u, runs, stroke: 0, phase: 'travel', t: 0, dur: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } };
      this.beginTravel();
      return;
    }
  }

  private strokePoint(run: StrokeRun, at: number, u: Unit): { x: number; y: number } {
    const p = run.paths[1].getPointAtLength(clamp(at, 0, run.len));
    return { x: u.x + p.x * this.k, y: u.y + p.y * this.k };
  }

  private beginTravel(): void {
    const t = this.task!;
    const u = t.unit;
    const to =
      t.runs.length > 0 ? this.strokePoint(t.runs[t.stroke], 0, u) : { x: u.x + 2, y: u.kind === 'fallback' ? u.y + u.h * 0.75 : u.y };
    const from = this.pose.placed ? { x: this.pose.x, y: this.pose.y } : { x: to.x + 30, y: to.y - 24 };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    t.phase = 'travel';
    t.t = 0;
    t.from = from;
    t.to = to;
    t.dur = dist < 0.5 ? 0 : clamp(dist / TRAVEL_PX_PER_MS, 14, 110) / Math.sqrt(this.speedFactor());
    this.pose.placed = true;
    this.setState(t.stroke > 0 || dist < this.fontSize * 1.2 ? 'lift' : 'travel');
  }

  private stepTask(dt: number): number {
    const t = this.task!;
    const u = t.unit;
    if (u.dead) {
      this.task = null;
      return 0.001;
    }
    if (t.phase === 'travel') {
      const remain = t.dur - t.t;
      const used = Math.min(dt, Math.max(remain, 0));
      t.t += used;
      const e = t.dur > 0 ? easeInOut(Math.min(1, t.t / t.dur)) : 1;
      this.pose.x = lerp(t.from.x, t.to.x, e);
      this.pose.y = lerp(t.from.y, t.to.y, e);
      // arc: lifted mid-way, touching down on arrival
      this.pose.lift = t.dur > 0 ? Math.sin(Math.PI * Math.min(1, t.t / t.dur)) * 0.9 + (1 - e) * 0.1 : 0;
      this.targetTilt = clamp((t.to.x - t.from.x) * 0.05, -4, 4);
      if (t.t >= t.dur) {
        this.pose.lift = 0;
        if (t.runs.length) {
          t.phase = 'write';
          t.t = 0;
          for (const p of t.runs[t.stroke].paths) p.style.visibility = 'visible';
          this.setState('writing');
          this.opts.onInkEvent?.('stroke');
        } else {
          // typeset fallback: the nib sweeps across while it appears
          t.phase = 'glide';
          t.t = 0;
          t.dur = 90;
          t.from = { ...t.to };
          t.to = { x: u.x + u.w, y: t.from.y };
          this.setState('writing');
        }
        return Math.max(used, 0.001);
      }
      return used;
    }
    if (t.phase === 'glide') {
      t.t += dt;
      const e = Math.min(1, t.t / t.dur);
      this.pose.x = lerp(t.from.x, t.to.x, e);
      this.pose.y = t.from.y;
      this.pose.lift = 0.15;
      if (e >= 1) {
        this.completeTask();
      }
      return dt;
    }
    // write
    const run = t.runs[t.stroke];
    const speed = BASE_SPEED * this.speedFactor() * this.k; // px per ms (len is in font units → convert)
    const lenPx = run.len * this.k;
    const before = t.t;
    const remainingMs = (lenPx - before * speed) / speed;
    const used = Math.min(dt, Math.max(remainingMs, 0));
    t.t += used;
    const at = Math.min(run.len, (t.t * speed) / this.k);
    const off = run.len + 1 - at;
    for (const p of run.paths) p.style.strokeDashoffset = `${off}`;
    const pt = this.strokePoint(run, at, u);
    const ahead = this.strokePoint(run, at + 18, u);
    const dx = ahead.x - pt.x;
    const dy = ahead.y - pt.y;
    const m = Math.hypot(dx, dy) || 1;
    this.targetTilt = clamp((dx / m) * 3.5 - (dy / m) * 2.5, -6, 6);
    this.pose.x = pt.x;
    this.pose.y = pt.y;
    this.pose.lift = 0;
    if (at >= run.len - 0.01) {
      for (const p of run.paths) p.style.strokeDashoffset = '0';
      t.stroke++;
      if (t.stroke >= t.runs.length) this.completeTask();
      else this.beginTravel();
      return Math.max(used, 0.001);
    }
    return used;
  }

  private completeTask(): void {
    const u = this.task!.unit;
    this.task = null;
    if (u.kind === 'ink') {
      // swap the per-stroke group for a single shared glyph instance
      this.drawInstant(u, false, true);
    } else {
      u.state = 'done';
      (u.node as HTMLElement | null)?.classList.remove('appearing');
    }
    if (!this.queue.length) {
      // lift off and hover just beside the last stroke
      this.glide = {
        from: { x: this.pose.x, y: this.pose.y, lift: this.pose.lift },
        to: { x: this.pose.x + 5, y: this.pose.y - 3, lift: 1 },
        t: 0,
        dur: 160,
      };
      this.setState('lift');
    }
  }

  // ---------------------------------------------------------------- dip

  private idleTimer = 0;
  private scheduleIdleDip(): void {
    clearTimeout(this.idleTimer);
    if (!this.dipEnabled || this.instant || this.charsSinceDip < this.dipThreshold) return;
    this.idleTimer = window.setTimeout(() => this.startDip(), 650);
  }

  private dipPending(): boolean {
    return this.dipEnabled && !this.instant && this.charsSinceDip >= this.dipThreshold;
  }

  private startDip(): void {
    if (this.task || this.queue.length || this.dip || this.instant || !this.dipEnabled || this.destroyed) return;
    const pot = this.opts.getInkpotPoint?.();
    if (!pot) return;
    const park = this.parkPoint(this.caretIndex);
    const home = park ? { x: park.x, y: park.y } : { x: this.pose.x, y: this.pose.y };
    const above = { x: pot.x, y: pot.y - 26 };
    this.dip = {
      i: 0,
      t: 0,
      from: { x: this.pose.x, y: this.pose.y, lift: this.pose.lift },
      steps: [
        { to: above, lift: 1, dur: clamp(Math.hypot(above.x - home.x, above.y - home.y) / 0.9, 380, 900) },
        { to: pot, lift: -0.6, dur: 260 },
        { to: pot, lift: -0.6, dur: 180 },
        { to: { x: pot.x, y: pot.y - 20 }, lift: 0.8, dur: 240 },
        { to: { x: pot.x + 3, y: pot.y - 22 }, lift: 0.8, dur: 90 },
        { to: { x: pot.x - 3, y: pot.y - 21 }, lift: 0.8, dur: 90 },
        { to: home, lift: 1, dur: clamp(Math.hypot(above.x - home.x, above.y - home.y) / 0.9, 380, 900) },
      ],
    };
    this.setState('dipping');
    this.kick();
  }

  private stepDip(dt: number): number {
    const d = this.dip!;
    const s = d.steps[d.i];
    d.t += dt;
    const e = easeInOut(Math.min(1, d.t / s.dur));
    const to = s.to ?? d.from;
    this.pose.x = lerp(d.from.x, to.x, e);
    this.pose.y = lerp(d.from.y, to.y, e);
    this.pose.lift = lerp(d.from.lift, s.lift, e);
    this.targetTilt = d.i === 0 ? 3 : d.i === d.steps.length - 1 ? -3 : 0;
    if (d.t >= s.dur) {
      if (d.i === 1) this.opts.onInkEvent?.('dip');
      d.from = { x: this.pose.x, y: this.pose.y, lift: this.pose.lift };
      d.i++;
      d.t = 0;
      if (d.i >= d.steps.length) {
        this.dip = null;
        this.charsSinceDip = 0;
        this.dipThreshold = randomDipThreshold();
      }
    }
    return dt;
  }

  private abortDip(): void {
    this.dip = null;
    this.charsSinceDip = Math.max(0, this.charsSinceDip - 20);
  }

  // -------------------------------------------------------------- helpers

  private lastInkUnit(): Unit | null {
    for (let i = this.units.length - 1; i >= 0; i--) if (this.units[i].kind === 'ink' && this.units[i].measured) return this.units[i];
    return null;
  }

  private placeRestNear(u: Unit): void {
    this.pose.x = u.x + (u.glyph ? u.glyph.w * this.k : u.w) + 4;
    this.pose.y = u.y - 2;
    this.pose.lift = 1;
    this.pose.placed = true;
  }

  private setState(s: QuillState): void {
    this.pose.state = s;
    this.opts.svg.dataset.quill = s;
  }

  private emit(): void {
    this.opts.onPose?.({ ...this.pose });
  }
}

function firstRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  for (const r of rects) if (r.height > 0) return r;
  const b = range.getBoundingClientRect();
  return b.height > 0 ? b : null;
}
function lastRect(range: Range): DOMRect | null {
  const rects = [...range.getClientRects()].filter((r) => r.height > 0);
  return rects.at(-1) ?? null;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const r2 = (v: number) => Math.round(v * 100) / 100;

function randomDipThreshold(): number {
  return 80 + Math.floor(Math.random() * 71);
}
