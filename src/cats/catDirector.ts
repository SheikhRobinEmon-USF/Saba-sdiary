/**
 * The cats' behaviour director.
 *
 * Each cat runs a queue of steps (pose tweens, waits, walks, callbacks). When
 * the queue empties the director chooses what the cat does next, based on
 * its current posture, on the other cat, and on whether someone is writing:
 * while the diary is being typed in, cats keep to calm, in-place behaviour
 * (dozing, slow blinks, ear twitches, watching the quill) and never walk
 * across the desk.
 *
 * Behaviours modelled on real cats: sleeping curled up, loafing, slow
 * "cat-kiss" blinks, kneading ("making biscuits"), paw licking and face
 * washing, yawning, the play-bow stretch and hind-leg stretch, ear twitches,
 * tail flicks, head tilts, batting with a paw, the butt-wiggle pounce,
 * watching a moving pen, walking over to greet the other cat with a nuzzle
 * (bunting), grooming each other, and curling up together.
 */
import { GALLERY } from './catActions';
import { POSES, blend, type Pose } from './catRig';

export type Posture = 'sleep' | 'loaf' | 'sphinx' | 'sit' | 'stand';

export interface CatView {
  apply(p: Pose): void;
  /** x = centre of the cat on the desk lane (layer px); facing 1 = right. */
  place(x: number, facing: 1 | -1): void;
  setAction(name: string, awake: boolean): void;
  /** Head position in client coordinates (for hearts and gaze). */
  headPoint(): { x: number; y: number } | null;
}

export interface DirectorEnv {
  /** ms timestamp of the last diary keystroke. */
  lastTyped(): number;
  /** nib position (client px) and whether the quill is moving. */
  quill(): { x: number; y: number; active: boolean } | null;
  heart(x: number, y: number): void;
  sound(kind: 'purr' | 'chirp'): void;
  /** lane geometry in layer px */
  lane(): { min: number; max: number; homes: [number, number]; scale: number };
}

type Ease = (t: number) => number;
const inOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const out: Ease = (t) => 1 - Math.pow(1 - t, 3);

type Step =
  | { kind: 'tween'; to: Partial<Pose>; dur: number; ease?: Ease }
  | { kind: 'wait'; dur: number }
  | { kind: 'call'; fn: () => void }
  | { kind: 'walk'; toX: number }
  | { kind: 'until'; test: () => boolean; max: number };

const tw = (to: Partial<Pose>, dur: number, ease?: Ease): Step => ({ kind: 'tween', to, dur, ease });
const wait = (dur: number): Step => ({ kind: 'wait', dur });
const call = (fn: () => void): Step => ({ kind: 'call', fn });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(items: [T, number][]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[0][0];
};
const key = (name: keyof typeof GALLERY, extra: Partial<Pose> = {}): Partial<Pose> => ({
  ...POSES[GALLERY[name].base],
  ...GALLERY[name].pose,
  ...extra,
});

const TYPING_CALM_MS = 6000;

class Cat {
  pose: Pose;
  posture: Posture;
  x: number;
  facing: 1 | -1;
  steps: Step[] = [];
  cur: Step | null = null;
  t = 0;
  from: Pose;
  action = 'resting';
  walkPhase = 0;
  blinkIn = rnd(2000, 5000);
  blinkT = -1;
  flick = 0;
  gazeX = 0;
  gazeY = 0;
  gazeHead = 0;
  breathT = Math.random() * 10000;
  tailT = Math.random() * 10000;
  constructor(
    public index: number,
    public view: CatView,
    posture: Posture,
    x: number,
    facing: 1 | -1,
  ) {
    this.posture = posture;
    this.pose = { ...POSES[posture] };
    this.from = this.pose;
    this.x = x;
    this.facing = facing;
  }
  get awake(): boolean {
    return this.posture !== 'sleep';
  }
}

export class CatDirector {
  private cats: Cat[] = [];
  private raf = 0;
  private last = 0;
  private running = false;
  private socialAt = performance.now() + rnd(14000, 24000);
  private reduced: boolean;

  constructor(
    views: [CatView, CatView],
    private env: DirectorEnv,
    reducedMotion: boolean,
  ) {
    const lane = env.lane();
    this.reduced = reducedMotion;
    this.cats = [new Cat(0, views[0], 'sleep', lane.homes[0], 1), new Cat(1, views[1], 'loaf', lane.homes[1], -1)];
    for (const c of this.cats) this.render(c);
    if (!reducedMotion) {
      this.cats[0].steps.push(wait(rnd(3000, 6000)));
      this.cats[1].steps.push(wait(rnd(1200, 2500)));
    }
  }

  start(): void {
    if (this.running || this.reduced) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setReducedMotion(r: boolean): void {
    this.reduced = r;
    if (r) {
      this.stop();
      for (const c of this.cats) {
        c.steps = [];
        c.cur = null;
        c.pose = { ...POSES[c.posture === 'sleep' ? 'sleep' : 'loaf'] };
        this.render(c);
      }
    } else this.start();
  }

  /** Re-anchor cats after a resize; keeps them on the lane. */
  relayout(): void {
    const lane = this.env.lane();
    for (const c of this.cats) {
      if (c.cur?.kind === 'walk') c.cur = null;
      c.x = Math.min(lane.max, Math.max(lane.min, c.x));
      if (this.reduced || Math.abs(c.x - lane.homes[c.index]) > lane.max) c.x = lane.homes[c.index];
      this.render(c);
    }
  }

  info() {
    return this.cats.map((c) => ({ action: c.action, posture: c.posture, x: Math.round(c.x), facing: c.facing }));
  }

  /** The cat was tapped / clicked / activated from the keyboard. */
  tap(i: number): void {
    const c = this.cats[i];
    const head = c.view.headPoint();
    if (head) this.env.heart(head.x, head.y - 10);
    if (this.reduced) {
      c.posture = c.posture === 'sleep' ? 'loaf' : 'sleep';
      c.pose = { ...POSES[c.posture] };
      c.action = c.posture === 'sleep' ? 'dozing' : 'looking at you';
      this.render(c);
      return;
    }
    c.steps = [];
    c.cur = null;
    if (!c.awake) {
      this.env.sound('chirp');
      this.run(c, 'waking up to say hello', [
        tw({ eye: 0.5, earNear: 14, earFar: -6 }, 260),
        tw({ ...POSES.sphinx, eye: 1, headRot: -12, headY: -4, pupilW: 2.3 }, 520, out),
        tw({ earNear: -10 }, 120),
        tw({ earNear: 0 }, 160),
        ...this.slowBlink(),
        call(() => this.setPosture(c, 'sphinx')),
      ]);
      return;
    }
    this.env.sound('purr');
    const choice = pick<string>([
      ['tilt', 3],
      ['blink', 3],
      ['bat', c.posture === 'sit' ? 2 : 0],
      ['bow', c.posture === 'stand' ? 2 : 0],
    ]);
    if (choice === 'bat') this.run(c, 'batting a paw at you', this.batSteps());
    else if (choice === 'bow') this.run(c, 'doing a little play bow', this.stretchSteps());
    else if (choice === 'tilt') this.run(c, 'tilting her head at you', [tw({ headRot: c.pose.headRot + 14, earNear: 14, pupilW: 2.4 }, 280, out), wait(900), tw({ headRot: c.pose.headRot, earNear: 0, pupilW: 1.5 }, 400)]);
    else this.run(c, 'giving you a slow blink', this.slowBlink());
  }

  // ------------------------------------------------------------ the loop

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    if (document.visibilityState === 'visible') {
      const typing = now - this.env.lastTyped() < TYPING_CALM_MS;
      if (typing) this.calmDown();
      else if (now > this.socialAt) this.maybeSocial(now);
      for (const c of this.cats) {
        this.advance(c, dt, typing);
        this.render(c, dt);
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private advance(c: Cat, dt: number, typing: boolean): void {
    let budget = dt;
    let guard = 0;
    while (budget > 0 && guard++ < 8) {
      if (!c.cur) {
        c.cur = c.steps.shift() ?? null;
        c.t = 0;
        c.from = { ...c.pose };
        if (!c.cur) {
          this.choose(c, typing);
          c.cur = c.steps.shift() ?? null;
          c.from = { ...c.pose };
          if (!c.cur) return;
        }
      }
      const s = c.cur;
      if (s.kind === 'call') {
        s.fn();
        c.cur = null;
        continue;
      }
      if (s.kind === 'until') {
        c.t += budget;
        if (s.test() || c.t >= s.max) c.cur = null;
        return;
      }
      if (s.kind === 'walk') {
        const lane = this.env.lane();
        const speed = 0.075 * (lane.scale / 0.8) * 1.0; // px per ms
        const dir = Math.sign(s.toX - c.x) || 1;
        c.facing = dir > 0 ? 1 : -1;
        const step = Math.min(Math.abs(s.toX - c.x), speed * budget);
        c.x += dir * step;
        c.walkPhase += budget * 0.0115;
        const ph = c.walkPhase;
        const A = 24;
        Object.assign(c.pose, POSES.stand, {
          fnS: 4 + A * Math.sin(ph),
          fnE: -4 + Math.max(0, -Math.cos(ph)) * 34,
          ffS: -5 + A * Math.sin(ph + Math.PI),
          ffE: 3 + Math.max(0, Math.cos(ph)) * 34,
          hnH: -4 + A * 0.9 * Math.sin(ph + Math.PI),
          hnK: 10 + Math.max(0, Math.cos(ph)) * 26,
          hfH: 6 + A * 0.9 * Math.sin(ph),
          hfK: 4 + Math.max(0, -Math.cos(ph)) * 26,
          bodyY: -1.2 * Math.abs(Math.sin(ph)),
          headY: 1.2 * Math.abs(Math.cos(ph)),
          tail0: -104,
          tailCurl: 11,
          pupilW: 1.4,
        });
        if (Math.abs(s.toX - c.x) < 0.5) {
          c.x = s.toX;
          c.cur = null;
          c.from = { ...c.pose };
          continue;
        }
        return;
      }
      const dur = s.dur;
      const used = Math.min(budget, dur - c.t);
      c.t += used;
      budget -= used;
      if (s.kind === 'tween') {
        const e = (s.ease ?? inOut)(dur > 0 ? Math.min(1, c.t / dur) : 1);
        c.pose = blend(c.from, s.to, e);
      }
      if (c.t >= dur) {
        c.cur = null;
        c.from = { ...c.pose };
      } else return;
    }
  }

  /** Breathing, blinking, tail sway and gaze are layered on top of the pose. */
  private render(c: Cat, dt = 0): void {
    const p = { ...c.pose };
    c.breathT += dt;
    c.tailT += dt;
    const sleeping = c.posture === 'sleep' && c.pose.eye < 0.2;
    p.bodySX += Math.sin(c.breathT / (sleeping ? 900 : 700)) * (sleeping ? 0.012 : 0.006);
    const wave = (sleeping ? 2.5 : c.posture === 'stand' ? 7 : 4.5) + c.flick;
    p.tailWave += wave;
    p.tailPhase += c.tailT / (sleeping ? 1400 : 900);
    c.flick = Math.max(0, c.flick - dt * 0.012);
    // blinks while awake
    if (!sleeping && p.eye > 0.6 && c.cur?.kind !== 'tween') {
      c.blinkIn -= dt;
      if (c.blinkIn <= 0 && c.blinkT < 0) c.blinkT = 0;
      if (c.blinkT >= 0) {
        c.blinkT += dt;
        const b = c.blinkT / 170;
        p.eye *= b < 1 ? 1 - Math.sin(Math.PI * b) * 0.95 : 1;
        if (b >= 1) {
          c.blinkT = -1;
          c.blinkIn = rnd(2600, 6500);
        }
      }
    }
    // eyes (and a little head turn) follow the quill while it writes
    const q = this.env.quill();
    let gx = 0, gy = 0, gh = 0;
    if (q && q.active && !sleeping && c.pose.eye > 0.5) {
      const h = c.view.headPoint();
      if (h) {
        const dx = (q.x - h.x) * c.facing;
        const dy = q.y - h.y;
        const m = Math.hypot(dx, dy) || 1;
        gx = Math.max(-1, Math.min(1, (dx / m) * 1.2));
        gy = Math.max(-1, Math.min(1, (dy / m) * 1.2));
        gh = Math.max(-7, Math.min(7, (dy / m) * 7 - (dx < 0 ? 4 : 0)));
      }
    }
    const k = Math.min(1, dt / 220);
    c.gazeX += (gx - c.gazeX) * k;
    c.gazeY += (gy - c.gazeY) * k;
    c.gazeHead += (gh - c.gazeHead) * k;
    p.pupilX += c.gazeX;
    p.pupilY += c.gazeY;
    p.headRot += c.gazeHead;
    c.view.apply(p);
    c.view.place(c.x, c.facing);
  }

  // --------------------------------------------------------- behaviour

  private run(c: Cat, action: string, steps: Step[]): void {
    c.action = action;
    c.view.setAction(action, true);
    c.steps.push(...steps);
  }

  private label(c: Cat, action: string): Step {
    return call(() => {
      c.action = action;
      c.view.setAction(action, c.awake);
    });
  }

  private setPosture(c: Cat, p: Posture): void {
    c.posture = p;
    c.view.setAction(c.action, p !== 'sleep');
  }

  private go(c: Cat, p: Posture, dur = 700): Step[] {
    if (c.posture === p) return [];
    const steps: Step[] = [];
    // waking from sleep: open eyes and lift the head first
    if (c.posture === 'sleep') steps.push(tw({ eye: 0.6, headRot: 4, headY: 3, headX: 0, earFar: 0, earNear: 0 }, 420));
    // lying down from standing goes through sitting, which looks natural
    if (c.posture === 'stand' && (p === 'loaf' || p === 'sleep' || p === 'sphinx')) steps.push(tw(POSES.sit, 520));
    steps.push(tw({ ...POSES[p], eye: p === 'sleep' ? 0 : 1 }, dur), call(() => this.setPosture(c, p)));
    return steps;
  }

  private slowBlink(): Step[] {
    return [tw({ eye: 0.12, pupilW: 2 }, 650), wait(420), tw({ eye: 1, pupilW: 1.6 }, 520)];
  }

  private batSteps(): Step[] {
    return [
      tw({ pupilW: 2.5, earNear: 8 }, 150),
      tw(key('bat'), 170, out),
      tw({ fnS: -40, fnE: -8 }, 160),
      tw(key('bat', { fnS: -88 }), 150, out),
      tw({ ...POSES.sit, pupilW: 1.6 }, 380),
    ];
  }

  private stretchSteps(): Step[] {
    return [
      tw(key('bow'), 700),
      wait(550),
      tw(POSES.stand, 480),
      tw(key('hindStretch'), 520),
      wait(350),
      tw(POSES.stand, 420),
    ];
  }

  private groomSteps(c: Cat): Step[] {
    const s: Step[] = [...this.go(c, 'sit', 600)];
    for (let i = 0; i < 4; i++) {
      s.push(tw(key('groomLick', { tongue: 1, headY: 8 }), i === 0 ? 420 : 200), tw({ tongue: 0, headY: 5, headRot: 40 }, 190));
    }
    for (let i = 0; i < 2; i++) {
      s.push(tw(key('washFace'), 420), tw(key('groomLick', { tongue: 0, eye: 0.25 }), 360));
    }
    s.push(tw({ ...POSES.sit }, 520));
    return s;
  }

  private kneadSteps(c: Cat): Step[] {
    const s: Step[] = [...this.go(c, 'sphinx', 600), tw({ eye: 0.35, pupilW: 2 }, 400)];
    for (let i = 0; i < 6; i++) {
      s.push(tw({ fnS: -58, fnE: 34, ffS: -84, ffE: 0 }, 230), tw({ fnS: -84, fnE: 0, ffS: -60, ffE: 30 }, 230));
    }
    s.push(tw({ ...POSES.sphinx, eye: 0.5 }, 500));
    return s;
  }

  private yawnSteps(c: Cat): Step[] {
    const base = c.posture === 'sit' ? POSES.sit : c.posture === 'stand' ? POSES.stand : POSES.sphinx;
    return [
      tw({ headRot: base.headRot - 12, mouth: 1, eye: 0.08, earFar: -14, earNear: 14, tongue: 0 }, 650),
      wait(650),
      tw({ headRot: base.headRot, mouth: 0, eye: 0.85, earFar: 0, earNear: 0 }, 520),
      tw({ headRot: base.headRot + 3 }, 160),
      tw({ headRot: base.headRot }, 180),
    ];
  }

  private pounceSteps(c: Cat): Step[] {
    const dir = c.facing;
    const lane = this.env.lane();
    const s: Step[] = [...this.go(c, 'stand', 400), tw(POSES.crouch, 500)];
    for (let i = 0; i < 4; i++) s.push(tw({ bodyRot: 8, x: -1.5 }, 90), tw({ bodyRot: 2, x: 1.5 }, 90));
    s.push(
      tw({ ...POSES.stand, y: -22, bodyRot: -12, fnS: -40, ffS: -30, hnH: 30, hfH: 26, x: 18 }, 240, out),
      tw({ ...POSES.crouch, y: 0, x: 30 }, 200),
      call(() => {
        c.x = Math.min(lane.max, Math.max(lane.min, c.x + 30 * dir * (lane.scale / 0.8)));
        c.pose.x = 0;
        c.from = { ...c.pose };
      }),
      tw({ ...POSES.stand, x: 0 }, 360),
    );
    return s;
  }

  /** While someone writes: no walking, nothing sudden. */
  private calmDown(): void {
    for (const c of this.cats) {
      const walking = c.cur?.kind === 'walk' || c.steps.some((s) => s.kind === 'walk');
      if (walking) {
        c.steps = [];
        c.cur = null;
        this.run(c, 'settling down to watch you write', this.go(c, 'sit', 500));
      }
    }
  }

  private choose(c: Cat, typing: boolean): void {
    const lane = this.env.lane();
    if (typing) {
      const calm = pick<string>([
        ['watch', c.awake ? 4 : 0],
        ['blink', c.awake ? 2 : 0],
        ['ear', 2],
        ['flick', 2],
        ['doze', c.awake ? 1 : 6],
        ['knead', c.posture === 'sphinx' || c.posture === 'loaf' ? 1 : 0],
      ]);
      switch (calm) {
        case 'watch':
          this.run(c, 'watching the quill write', [...(c.posture === 'stand' ? this.go(c, 'sit') : []), tw({ pupilW: 2.2, earNear: 6, earFar: -4 }, 400), wait(rnd(3000, 6000))]);
          return;
        case 'blink':
          this.run(c, 'giving a slow blink', [...this.slowBlink(), wait(rnd(1500, 3000))]);
          return;
        case 'ear':
          this.run(c, c.awake ? 'twitching an ear' : 'twitching an ear in her sleep', [tw({ earNear: -18 }, 90), tw({ earNear: 0 }, 150), tw({ earNear: -14 }, 90), tw({ earNear: 0 }, 160), wait(rnd(2000, 4000))]);
          return;
        case 'flick':
          this.run(c, c.awake ? 'flicking her tail' : 'dreaming', [call(() => (c.flick = 14)), wait(rnd(2500, 4500))]);
          return;
        case 'knead':
          this.run(c, 'kneading — making biscuits', this.kneadSteps(c));
          return;
        default:
          this.run(c, 'dozing', [...this.go(c, 'sleep', 1200), wait(rnd(6000, 12000))]);
          return;
      }
    }

    const home = lane.homes[c.index];
    const far = Math.abs(c.x - home) > 40 * (lane.scale / 0.8);
    const options: [string, number][] =
      c.posture === 'sleep'
        ? [['sleep', 6], ['wake', 2], ['stretchUp', 1], ['ear', 1], ['flick', 1]]
        : c.posture === 'loaf' || c.posture === 'sphinx'
          ? [['blink', 2], ['knead', 2], ['yawn', 1], ['ear', 1], ['sleep', 2], ['sit', 2], ['stand', 1], ['home', far ? 3 : 0]]
          : c.posture === 'sit'
            ? [['groom', 3], ['flick', 1], ['bat', 1], ['tilt', 1], ['yawn', 1], ['loaf', 1], ['stand', 1], ['home', far ? 3 : 0]]
            : [['stretch', 2], ['wander', 2], ['sit', 2], ['pounce', 1], ['home', far ? 4 : 0]];
    this.act(c, pick(options));
  }

  /** Make a cat do a named behaviour now (used by tests and the tap reaction). */
  perform(i: number, name: string): void {
    const c = this.cats[i];
    if (!c || this.reduced) return;
    c.steps = [];
    c.cur = null;
    if (name === 'social') {
      this.maybeSocial(performance.now());
      return;
    }
    this.act(c, name);
  }

  private act(c: Cat, choice: string): void {
    const lane = this.env.lane();
    const home = lane.homes[c.index];
    switch (choice) {
      case 'sleep':
        this.run(c, 'sleeping, curled up', [...this.go(c, 'sleep', 1400), wait(rnd(9000, 20000))]);
        break;
      case 'wake':
        this.run(c, 'waking up', [...this.go(c, 'sphinx', 800), ...this.yawnSteps({ ...c, posture: 'sphinx' } as Cat), wait(rnd(1500, 3000))]);
        break;
      case 'stretchUp':
        this.run(c, 'waking up with a big stretch', [...this.go(c, 'stand', 900), ...this.stretchSteps(), call(() => this.setPosture(c, 'stand')), wait(800)]);
        break;
      case 'ear':
        this.run(c, 'twitching an ear', [tw({ earNear: -18 }, 90), tw({ earNear: 0 }, 150), wait(rnd(1500, 3000))]);
        break;
      case 'flick':
        this.run(c, 'swishing her tail', [call(() => (c.flick = 16)), wait(rnd(2000, 3500))]);
        break;
      case 'blink':
        this.run(c, 'giving a slow blink', [...this.slowBlink(), wait(rnd(2000, 4000))]);
        break;
      case 'knead':
        this.run(c, 'kneading — making biscuits', [...this.kneadSteps(c), wait(rnd(1000, 2500))]);
        break;
      case 'yawn':
        this.run(c, 'yawning', [...this.yawnSteps(c), wait(rnd(1500, 3000))]);
        break;
      case 'sit':
        this.run(c, 'sitting up', [...this.go(c, 'sit'), wait(rnd(1500, 3500))]);
        break;
      case 'loaf':
        this.run(c, 'tucking in her paws', [...this.go(c, 'loaf'), wait(rnd(2500, 5000))]);
        break;
      case 'stand':
        this.run(c, 'getting up', [...this.go(c, 'stand'), wait(rnd(600, 1400))]);
        break;
      case 'groom':
        this.run(c, 'licking her paw and washing her face', [...this.groomSteps(c), wait(rnd(1500, 3000))]);
        break;
      case 'bat':
        this.run(c, 'batting at a speck of dust', [...this.go(c, 'sit'), ...this.batSteps(), wait(rnd(1500, 2500))]);
        break;
      case 'tilt':
        this.run(c, 'tilting her head, curious', [...this.go(c, 'sit'), tw({ headRot: POSES.sit.headRot + 14, earNear: 14 }, 300, out), wait(1100), tw({ headRot: POSES.sit.headRot, earNear: 0 }, 400), wait(rnd(1500, 3000))]);
        break;
      case 'stretch':
        this.run(c, 'stretching — a play bow', [...this.go(c, 'stand', 600), ...this.stretchSteps(), wait(rnd(1000, 2000))]);
        break;
      case 'pounce':
        this.run(c, 'wiggling and pouncing', [...this.pounceSteps(c), wait(rnd(1200, 2400))]);
        break;
      case 'wander': {
        const span = 120 * (lane.scale / 0.8);
        const to = Math.min(lane.max, Math.max(lane.min, home + rnd(-span, span)));
        this.run(c, 'strolling along the desk', [...this.go(c, 'stand', 500), { kind: 'walk', toX: to }, this.label(c, 'looking around'), tw(POSES.stand, 300), wait(rnd(800, 2000))]);
        break;
      }
      case 'home':
        this.run(c, 'heading back to her spot', [...this.go(c, 'stand', 500), { kind: 'walk', toX: home }, this.label(c, 'back in her spot'), tw(POSES.stand, 300), ...this.go(c, 'sit', 600)]);
        break;
    }
  }

  /** One cat walks over to the other to say hello; sometimes they nap together. */
  private maybeSocial(now: number): void {
    this.socialAt = now + rnd(28000, 50000);
    const [a, b] = Math.random() < 0.5 ? this.cats : [this.cats[1], this.cats[0]];
    if (a.cur?.kind === 'walk' || b.cur?.kind === 'walk') return;
    const lane = this.env.lane();
    const gap = 168 * lane.scale;
    const side = a.x < b.x ? -1 : 1; // a stops on its own side of b
    const target = Math.min(lane.max, Math.max(lane.min, b.x + side * gap));
    if (Math.abs(target - a.x) < 10) return;
    let arrived = false;
    a.steps = [];
    a.cur = null;
    b.steps = [];
    b.cur = null;
    const faceB = -side as 1 | -1;
    const together = Math.random() < 0.4;
    this.run(a, 'walking over to say hello', [
      ...this.go(a, 'stand', 600),
      { kind: 'walk', toX: target },
      call(() => {
        a.facing = faceB;
        arrived = true;
      }),
      this.label(a, 'nuzzling her friend'),
      tw(POSES.stand, 250),
      tw(key('nuzzle'), 480),
      call(() => {
        const h = a.view.headPoint();
        if (h) this.env.heart(h.x + 12 * faceB, h.y - 14);
      }),
      wait(700),
      tw(POSES.stand, 400),
      ...(Math.random() < 0.5
        ? // a little grooming for her friend
          [tw({ ...key('nuzzle'), tongue: 1, headY: 3 }, 220), tw({ tongue: 0, headY: 0 }, 200), tw({ tongue: 1, headY: 3 }, 220), tw({ ...POSES.stand }, 300)]
        : []),
      ...(together ? [tw(POSES.sit, 500), tw({ ...POSES.loaf }, 700), call(() => this.setPosture(a, 'loaf')), wait(2500), tw({ ...POSES.sleep }, 1500), call(() => this.setPosture(a, 'sleep')), wait(rnd(14000, 22000))] : [wait(600)]),
    ]);
    a.posture = 'stand';
    this.run(b, 'greeting her friend', [
      ...this.go(b, b.posture === 'sleep' ? 'sphinx' : b.posture, 600),
      call(() => (b.facing = side as 1 | -1)),
      { kind: 'until', test: () => arrived, max: 15000 },
      tw({ headRot: b.pose.headRot - 10, headX: 4, eye: 0.2 }, 480),
      wait(900),
      tw({ eye: 1, headX: 0, headRot: b.pose.headRot }, 400),
      ...(together ? [tw({ ...POSES.sleep }, 1600), call(() => this.setPosture(b, 'sleep')), wait(rnd(14000, 22000))] : [wait(1200)]),
    ]);
  }
}
