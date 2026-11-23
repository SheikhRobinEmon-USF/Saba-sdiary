/**
 * The cats' behaviour director.
 *
 * Each cat runs a queue of steps (pose tweens, waits, walks, hops, callbacks).
 * When the queue empties the director chooses what the cat does next from her
 * posture, the toys on the desk, the other cat, and whether someone is
 * writing: while the diary is being typed in, cats keep to calm, in-place
 * behaviour and never walk across the page — unless the writer has just
 * played with a toy themselves.
 *
 * Motion: keyframes set a *target* pose; every joint follows its target
 * through a critically damped spring, so movement never snaps or stops dead
 * between keyframes. Walks accelerate and slow down, legs move with the
 * distance actually covered (no skating), and turning around is animated.
 *
 * Behaviours modelled on real cats: sleeping curled up, loafing, slow
 * "cat-kiss" blinks, kneading, paw licking and face washing, yawning,
 * stretches, ear twitches, tail swishes, head tilts, batting, the butt-wiggle
 * pounce, meowing, watching a moving pen, chasing and batting a ball of yarn,
 * napping in the cat house, sitting in a cardboard box ("if it fits, I sits"),
 * eating from the bowl and asking for more, greeting each other with a
 * nuzzle, grooming each other and curling up together.
 */
import { GALLERY } from './catActions';
import { POSES, POSE_KEYS, blend, type Pose } from './catRig';

export type Posture = 'sleep' | 'loaf' | 'sphinx' | 'sit' | 'stand';
export type Place = 'house' | 'box' | null;

export interface CatView {
  apply(p: Pose): void;
  /** x = centre of the cat on the lane (layer px); facing in [-1, 1]. */
  place(x: number, facing: number): void;
  setAction(name: string, awake: boolean): void;
  setHidden(hidden: boolean): void;
  /** Head position in client coordinates (for hearts and gaze). */
  headPoint(): { x: number; y: number } | null;
}

export interface Lane {
  y: number;
  min: number;
  max: number;
  homes: [number, number];
  scale: number;
  house: number | null;
  box: number | null;
  bowl: number | null;
  aquarium: number | null;
  /** half-width of the aquarium on screen, in layer px */
  aquariumHalf: number;
  yarnHome: number;
  /** x of the middle of the page (where a reading cat sits) */
  pageMid: number;
}

export interface WorldView {
  placeYarn(x: number, rot: number): void;
  setBowl(food: number): void;
  setHouse(occupant: number | null): void;
  pawPrint(x: number, facing: number): void;
  placeFish(i: number, x: number, y: number, dir: number, tilt: number): void;
  feedFish(): void;
  rippleGlass(side: 'l' | 'r'): void;
  /** a fish's position in client coordinates (for the cats' gaze) */
  fishPoint(i: number): { x: number; y: number } | null;
}

/** Things happening in the writing that the cats can react to. */
export type WritingEvent =
  | { kind: 'word'; word: string }
  | { kind: 'sentence' }
  | { kind: 'paragraph' }
  | { kind: 'erase'; count: number }
  | { kind: 'typed'; count: number };

export interface DirectorEnv {
  lastTyped(): number;
  quill(): { x: number; y: number; active: boolean } | null;
  heart(x: number, y: number): void;
  sound(kind: 'purr' | 'chirp' | 'meow' | 'chatter', cat: number): void;
  /** Press a small inky paw print onto the page beside the latest words. */
  stamp(): boolean;
  /** The recipient's name, lower-case (the cats know it). */
  name: string;
  /** Whether the periodic meows (ambient sound) are on. */
  meows(): boolean;
  /** 'lively': free to roam; 'calm': mostly rest, move only when played with. */
  mood(): 'lively' | 'calm';
  lane(): Lane;
}

type Ease = (t: number) => number;
const inOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const out: Ease = (t) => 1 - Math.pow(1 - t, 3);
const inQ: Ease = (t) => t * t;

type Step =
  | { kind: 'tween'; to: Partial<Pose>; dur: number; ease?: Ease }
  | { kind: 'wait'; dur: number }
  | { kind: 'call'; fn: () => void }
  | { kind: 'walk'; toX: number | (() => number); run?: boolean; until?: () => boolean }
  | { kind: 'slide'; toX: number; dur: number; to: Partial<Pose>; ease?: Ease }
  | { kind: 'until'; test: () => boolean; max: number };

const tw = (to: Partial<Pose>, dur: number, ease?: Ease): Step => ({ kind: 'tween', to, dur, ease });
const wait = (dur: number): Step => ({ kind: 'wait', dur });
const call = (fn: () => void): Step => ({ kind: 'call', fn });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
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
const BOX_FLOOR = -7;

class Cat {
  pose: Pose;
  disp: Pose;
  vel: Record<string, number> = {};
  posture: Posture;
  x: number;
  vx = 0;
  facing: 1 | -1;
  facingVis: number;
  facingVel = 0;
  steps: Step[] = [];
  cur: Step | null = null;
  t = 0;
  from: Pose;
  fromX = 0;
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
  inside: Place = null;
  hunger = rnd(0.3, 0.8);
  /** index of the fish she is watching, if any */
  watch: number | null = null;
  /** something she means to do once the writing pauses */
  intent: string | null = null;
  lastReact = -1e9;
  /** the last thing in the writing she reacted to (for tests and curious minds) */
  reaction = '';
  constructor(
    public index: number,
    public view: CatView,
    posture: Posture,
    x: number,
    facing: 1 | -1,
  ) {
    this.posture = posture;
    this.pose = { ...POSES[posture] };
    this.disp = { ...this.pose };
    this.from = this.pose;
    this.x = x;
    this.facing = facing;
    this.facingVis = facing;
  }
  get awake(): boolean {
    return this.posture !== 'sleep';
  }
  get busyMoving(): boolean {
    return this.cur?.kind === 'walk' || this.cur?.kind === 'slide' || this.steps.some((s) => s.kind === 'walk' || s.kind === 'slide');
  }
}

export class CatDirector {
  private cats: Cat[] = [];
  private raf = 0;
  private last = 0;
  private running = false;
  private socialAt = performance.now() + rnd(16000, 26000);
  private meowAt = performance.now() + rnd(9000, 16000);
  private playedAt = -1e9;
  private reduced: boolean;
  private yarn = { x: 0, vx: 0, rot: 0, dragging: false, samples: [] as { x: number; t: number }[] };
  private bowl = 1;
  private houseOwner: number | null = null;
  private boxOwner: number | null = null;
  private chaser: Cat | null = null;
  private fish = [0, 1, 2].map((i) => ({ x: 50 + i * 35, y: 46 + i * 14, vx: (i % 2 ? -1 : 1) * 0.02, vy: 0, tx: 80, ty: 60, dir: i % 2 ? -1 : 1, wait: 0 }));
  private foodUntil = 0;
  private foodX = 88;
  private written = 0;
  private lastRead = performance.now();

  constructor(
    views: [CatView, CatView],
    private world: WorldView,
    private env: DirectorEnv,
    reducedMotion: boolean,
  ) {
    const lane = env.lane();
    this.reduced = reducedMotion;
    this.cats = [new Cat(0, views[0], 'sleep', lane.homes[0], 1), new Cat(1, views[1], 'loaf', lane.homes[1], -1)];
    this.yarn.x = lane.yarnHome;
    for (const c of this.cats) this.render(c, 0, true);
    this.world.placeYarn(this.yarn.x, 0);
    this.world.setBowl(this.bowl);
    if (!reducedMotion) {
      this.cats[0].steps.push(wait(rnd(2500, 5000)));
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
        this.leave(c);
        c.steps = [];
        c.cur = null;
        c.pose = { ...POSES[c.posture === 'sleep' ? 'sleep' : 'loaf'] };
        this.render(c, 0, true);
      }
    } else this.start();
  }

  /** Re-anchor everything after a resize; keeps cats and toys on the lane. */
  relayout(): void {
    const lane = this.env.lane();
    for (const c of this.cats) {
      if (c.cur?.kind === 'walk' || c.cur?.kind === 'slide') c.cur = null;
      if (c.inside === 'house' && lane.house !== null) c.x = lane.house;
      else if (c.inside === 'box' && lane.box !== null) c.x = lane.box;
      else if (c.inside) this.leave(c);
      c.x = clamp(c.x, lane.min, lane.max);
      this.render(c, 0, true);
    }
    this.yarn.x = clamp(this.yarn.x, lane.min, lane.max);
    this.world.placeYarn(this.yarn.x, this.yarn.rot);
  }

  info() {
    return this.cats.map((c) => ({ action: c.action, posture: c.posture, x: Math.round(c.x), facing: c.facing, inside: c.inside, reaction: c.reaction }));
  }

  world_info() {
    return { yarn: Math.round(this.yarn.x), yarnSpeed: this.yarn.vx, bowl: this.bowl, house: this.houseOwner, box: this.boxOwner };
  }

  // ------------------------------------------------------ the writer plays

  /** A cat was tapped / clicked / activated from the keyboard. */
  tap(i: number): void {
    const c = this.cats[i];
    const head = c.view.headPoint();
    if (head) this.env.heart(head.x, head.y - 10);
    if (this.reduced) {
      c.posture = c.posture === 'sleep' ? 'loaf' : 'sleep';
      c.pose = { ...POSES[c.posture] };
      this.label(c, c.posture === 'sleep' ? 'dozing' : 'looking at you');
      this.render(c, 0, true);
      return;
    }
    this.played();
    this.interrupt(c);
    if (!c.awake) {
      this.env.sound('chirp', i);
      this.run(c, 'waking up to say hello', [
        tw({ eye: 0.5, earNear: 14, earFar: -6 }, 260),
        tw({ ...POSES.sphinx, eye: 1, headRot: -12, headY: -4, pupilW: 2.3 }, 520, out),
        tw({ earNear: -10 }, 140),
        tw({ earNear: 0 }, 180),
        ...this.slowBlink(),
        call(() => this.setPosture(c, 'sphinx')),
      ]);
      return;
    }
    const choice = pick<string>([
      ['tilt', 3],
      ['blink', 3],
      ['meow', 2],
      ['bat', c.posture === 'sit' && !c.inside ? 2 : 0],
      ['bow', c.posture === 'stand' && !c.inside ? 2 : 0],
    ]);
    if (choice !== 'meow') this.env.sound('purr', i);
    if (choice === 'bat') this.run(c, 'batting a paw at you', this.batSteps());
    else if (choice === 'bow') this.run(c, 'doing a little play bow', this.stretchSteps());
    else if (choice === 'meow') this.run(c, 'meowing hello', this.meowSteps(c));
    else if (choice === 'tilt')
      this.run(c, 'tilting her head at you', [tw({ headRot: c.pose.headRot + 14, earNear: 14, pupilW: 2.4 }, 280, out), wait(900), tw({ headRot: c.pose.headRot, earNear: 0, pupilW: 1.5 }, 400)]);
    else this.run(c, 'giving you a slow blink', this.slowBlink());
  }

  /** Flick the yarn along the desk; a cat will usually give chase. */
  kickYarn(vx?: number): void {
    if (this.reduced) return;
    this.played();
    const lane = this.env.lane();
    const dir = vx !== undefined ? Math.sign(vx) : this.yarn.x > (lane.min + lane.max) / 2 ? -1 : 1;
    this.yarn.vx = vx ?? dir * rnd(0.45, 0.75) * lane.scale;
    this.summonChaser();
  }

  dragYarn(x: number): void {
    if (this.reduced) return;
    const lane = this.env.lane();
    this.yarn.dragging = true;
    this.yarn.vx = 0;
    const nx = clamp(x, lane.min, lane.max);
    this.yarn.rot += (nx - this.yarn.x) / (14 * lane.scale);
    this.yarn.x = nx;
    const now = performance.now();
    this.yarn.samples.push({ x: nx, t: now });
    this.yarn.samples = this.yarn.samples.filter((s) => now - s.t < 120);
    this.world.placeYarn(this.yarn.x, this.yarn.rot);
  }

  releaseYarn(): void {
    if (!this.yarn.dragging) return;
    this.yarn.dragging = false;
    const s = this.yarn.samples;
    const v = s.length > 1 ? (s[s.length - 1].x - s[0].x) / Math.max(16, s[s.length - 1].t - s[0].t) : 0;
    this.yarn.samples = [];
    this.kickYarn(clamp(v, -1.6, 1.6) || undefined);
  }

  fillBowl(): void {
    this.bowl = 1;
    this.world.setBowl(1);
    if (this.reduced) return;
    this.played();
    for (const c of this.cats) c.hunger = Math.max(c.hunger, 0.7);
    const eater = this.nearest(this.env.lane().bowl ?? 0, (c) => !c.inside);
    if (eater) {
      this.interrupt(eater);
      if (!eater.awake) this.env.sound('chirp', eater.index);
      this.act(eater, 'eat');
    }
  }

  tapHouse(): void {
    if (this.reduced) return;
    this.played();
    if (this.houseOwner !== null) {
      const c = this.cats[this.houseOwner];
      this.interrupt(c);
      this.run(c, 'coming out of the cat house', this.exitHouseSteps(c));
      return;
    }
    const c = this.nearest(this.env.lane().house ?? 0, (k) => !k.inside);
    if (c) {
      this.interrupt(c);
      this.act(c, 'house');
    }
  }

  tapBox(): void {
    if (this.reduced) return;
    this.played();
    if (this.boxOwner !== null) {
      const c = this.cats[this.boxOwner];
      this.interrupt(c);
      this.run(c, 'hopping out of the box', this.exitBoxSteps(c));
      return;
    }
    const c = this.nearest(this.env.lane().box ?? 0, (k) => !k.inside);
    if (c) {
      this.interrupt(c);
      this.act(c, 'box');
    }
  }

  /** Make a cat do a named behaviour now (tests and the toys use this). */
  perform(i: number, name: string): void {
    const c = this.cats[i];
    if (!c || this.reduced) return;
    this.played();
    if (name === 'social') {
      this.social(performance.now(), true);
      return;
    }
    if (c.inside && name !== 'house' && name !== 'box') {
      this.interrupt(c);
      this.run(c, 'stepping out', c.inside === 'house' ? this.exitHouseSteps(c) : this.exitBoxSteps(c));
      return;
    }
    this.interrupt(c);
    this.act(c, name);
  }

  // ------------------------------------------------------------ the loop

  private frame = (now: number): void => {
    if (!this.running) return;
    // keep real-time pace even when frames are slow (busy or low-power devices)
    const dt = Math.min(100, now - this.last);
    this.last = now;
    if (document.visibilityState === 'visible') {
      const typing = this.isTyping(now);
      if (typing) this.calmDown();
      else {
        if (now > this.socialAt) this.social(now, false);
      }
      if (now > this.meowAt) this.ambientMeow(now, typing);
      if (!typing) this.maybeRead(now);
      this.stepYarn(dt);
      this.stepFish(dt, now);
      for (const c of this.cats) {
        this.advance(c, dt, typing);
        this.render(c, dt);
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private isTyping(now: number): boolean {
    const t = this.env.lastTyped();
    return now - t < TYPING_CALM_MS && t > this.playedAt;
  }

  private played(): void {
    this.playedAt = performance.now();
  }

  private stepYarn(dt: number): void {
    const y = this.yarn;
    if (y.dragging || Math.abs(y.vx) < 0.002) {
      y.vx = y.dragging ? y.vx : 0;
      return;
    }
    const lane = this.env.lane();
    y.x += y.vx * dt;
    if (y.x < lane.min || y.x > lane.max) {
      y.x = clamp(y.x, lane.min, lane.max);
      y.vx = -y.vx * 0.55;
    }
    y.vx *= Math.exp(-dt / 650);
    y.rot += (y.vx * dt) / (14 * lane.scale);
    this.world.placeYarn(y.x, y.rot);
  }

  private advance(c: Cat, dt: number, typing: boolean): void {
    let budget = dt;
    let guard = 0;
    while (budget > 0 && guard++ < 8) {
      if (!c.cur) {
        c.cur = c.steps.shift() ?? null;
        c.t = 0;
        c.from = { ...c.pose };
        c.fromX = c.x;
        if (!c.cur) {
          this.choose(c, typing);
          c.cur = c.steps.shift() ?? null;
          c.from = { ...c.pose };
          c.fromX = c.x;
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
        if (this.walk(c, s, budget)) {
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
      const e = s.kind === 'wait' ? 1 : (s.ease ?? inOut)(dur > 0 ? Math.min(1, c.t / dur) : 1);
      if (s.kind === 'tween' || s.kind === 'slide') c.pose = blend(c.from, s.to, e);
      if (s.kind === 'slide') c.x = c.fromX + (s.toX - c.fromX) * e;
      if (c.t >= dur) {
        c.cur = null;
        c.from = { ...c.pose };
      } else return;
    }
  }

  /** One walking tick; returns true on arrival. */
  private walk(c: Cat, s: Extract<Step, { kind: 'walk' }>, dt: number): boolean {
    const lane = this.env.lane();
    const target = clamp(typeof s.toX === 'function' ? s.toX() : s.toX, lane.min, lane.max);
    const dist = target - c.x;
    const vmax = (s.run ? 0.19 : 0.085) * lane.scale;
    const acc = (s.run ? 0.0009 : 0.0004) * lane.scale;
    if (Math.abs(dist) > 3) c.facing = dist > 0 ? 1 : -1;
    const stop = Math.sqrt(2 * acc * Math.abs(dist));
    c.vx = Math.min(vmax, c.vx + acc * dt, stop);
    const move = Math.min(Math.abs(dist), c.vx * dt);
    c.x += Math.sign(dist) * move;
    // legs follow distance covered, so feet never skate
    const stride = 54 * lane.scale;
    const before = c.walkPhase;
    c.walkPhase += (move / stride) * Math.PI * 2;
    if (Math.floor(before / Math.PI) !== Math.floor(c.walkPhase / Math.PI)) this.world.pawPrint(c.x + c.facing * 26 * lane.scale, c.facing);
    const amp = clamp(c.vx / (0.085 * lane.scale), 0, 1.25);
    const ph = c.walkPhase;
    const A = 23 * amp;
    const lift = (v: number) => Math.max(0, v) * 32 * amp;
    Object.assign(c.pose, POSES.stand, {
      fnS: 4 + A * Math.sin(ph),
      fnE: -4 + lift(-Math.cos(ph)),
      ffS: -5 + A * Math.sin(ph + Math.PI),
      ffE: 3 + lift(Math.cos(ph)),
      hnH: -4 + A * 0.9 * Math.sin(ph + Math.PI),
      hnK: 10 + lift(Math.cos(ph)) * 0.8,
      hfH: 6 + A * 0.9 * Math.sin(ph),
      hfK: 4 + lift(-Math.cos(ph)) * 0.8,
      bodyY: -1.4 * Math.abs(Math.sin(ph)) * amp,
      headY: 1.1 * Math.abs(Math.cos(ph)) * amp,
      headRot: s.run ? -6 : -2,
      tail0: s.run ? -150 : -104,
      tailCurl: s.run ? 4 : 11,
      pupilW: s.run ? 2.4 : 1.4,
      bodyRot: s.run ? 3 : 0,
    });
    const done = s.until ? s.until() : Math.abs(target - c.x) < 0.6 && c.vx < 0.02;
    if (done) c.vx = 0;
    return done;
  }

  /**
   * Springs: the displayed pose chases the target pose (critically damped),
   * then breathing, blinks, tail sway and gaze are layered on top.
   */
  private render(c: Cat, dt: number, snap = false): void {
    if (snap) {
      c.disp = { ...c.pose };
      c.vel = {};
      c.facingVis = c.facing;
    } else if (dt > 0) {
      const walking = c.cur?.kind === 'walk';
      const w = walking ? 34 : 15;
      const n = Math.ceil(dt / 12);
      const h = dt / n / 1000;
      for (let i = 0; i < n; i++) {
        for (const k of POSE_KEYS) {
          const x = c.disp[k];
          const v = c.vel[k] ?? 0;
          const a = w * w * (c.pose[k] - x) - 2 * w * v;
          const nv = v + a * h;
          c.vel[k] = nv;
          c.disp[k] = x + nv * h;
        }
        const fa = 13 * 13 * (c.facing - c.facingVis) - 2 * 13 * c.facingVel;
        c.facingVel += fa * h;
        c.facingVis += c.facingVel * h;
      }
    }
    const p = { ...c.disp };
    c.breathT += dt;
    c.tailT += dt;
    const sleeping = c.posture === 'sleep' && c.pose.eye < 0.2;
    p.bodySX += Math.sin(c.breathT / (sleeping ? 900 : 700)) * (sleeping ? 0.012 : 0.006);
    p.tailWave += (sleeping ? 2.5 : c.posture === 'stand' ? 7 : 4.5) + c.flick;
    p.tailPhase += c.tailT / (sleeping ? 1400 : 900);
    c.flick = Math.max(0, c.flick - dt * 0.012);
    if (!sleeping && p.eye > 0.6 && c.cur?.kind !== 'tween') {
      c.blinkIn -= dt;
      if (c.blinkIn <= 0 && c.blinkT < 0) c.blinkT = 0;
      if (c.blinkT >= 0) {
        c.blinkT += dt;
        const b = c.blinkT / 180;
        p.eye *= b < 1 ? 1 - Math.sin(Math.PI * b) * 0.95 : 1;
        if (b >= 1) {
          c.blinkT = -1;
          c.blinkIn = rnd(2600, 6500);
        }
      }
    }
    // eyes (and a little head turn) follow the quill — or the rolling yarn
    let gx = 0,
      gy = 0,
      gh = 0;
    const q = this.env.quill();
    const h = !sleeping && c.pose.eye > 0.5 ? c.view.headPoint() : null;
    if (h) {
      let target: { x: number; y: number } | null = null;
      if (c.watch !== null) target = this.world.fishPoint(c.watch);
      else if (Math.abs(this.yarn.vx) > 0.03 || this.yarn.dragging) {
        const lane = this.env.lane();
        target = { x: h.x + (this.yarn.x - c.x), y: h.y + 50 * lane.scale };
      } else if (q && q.active) target = q;
      if (target) {
        const dx = (target.x - h.x) * Math.sign(c.facingVis || 1);
        const dy = target.y - h.y;
        const m = Math.hypot(dx, dy) || 1;
        gx = clamp((dx / m) * 1.2, -1, 1);
        gy = clamp((dy / m) * 1.2, -1, 1);
        gh = clamp((dy / m) * 7 - (dx < 0 ? 4 : 0), -7, 7);
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
    c.view.place(c.x, Math.abs(c.facingVis) < 0.12 ? Math.sign(c.facingVis || 1) * 0.12 : c.facingVis);
  }

  // --------------------------------------------------------- behaviour

  private run(c: Cat, action: string, steps: Step[]): void {
    c.action = action;
    c.view.setAction(action, true);
    c.steps.push(...steps);
  }

  private interrupt(c: Cat): void {
    c.steps = [];
    c.cur = null;
    c.vx = 0;
    c.watch = null;
    if (this.chaser === c) this.chaser = null;
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

  private nearest(x: number, ok: (c: Cat) => boolean): Cat | null {
    const list = this.cats.filter(ok).sort((a, b) => Number(b.awake) - Number(a.awake) || Math.abs(a.x - x) - Math.abs(b.x - x));
    return list[0] ?? null;
  }

  /** Posture change, resolved when the step runs (not when it is planned). */
  private go(c: Cat, p: Posture, dur = 700): Step[] {
    return [call(() => c.steps.unshift(...this.goNow(c, p, dur)))];
  }

  private goNow(c: Cat, p: Posture, dur: number): Step[] {
    if (c.posture === p) return [];
    const steps: Step[] = [];
    if (c.posture === 'sleep') steps.push(tw({ eye: 0.6, headRot: 4, headY: 3, headX: 0, earFar: 0, earNear: 0 }, 420));
    if (c.posture === 'stand' && (p === 'loaf' || p === 'sleep' || p === 'sphinx')) steps.push(tw(POSES.sit, 520));
    steps.push(tw({ ...POSES[p], eye: p === 'sleep' ? 0 : 1, y: c.inside === 'box' ? BOX_FLOOR : 0 }, dur), call(() => this.setPosture(c, p)));
    return steps;
  }

  private walkTo(c: Cat, x: number | (() => number), run = false): Step[] {
    return [...this.go(c, 'stand', 450), { kind: 'walk', toX: x, run }];
  }

  private slowBlink(): Step[] {
    return [tw({ eye: 0.12, pupilW: 2 }, 650), wait(420), tw({ eye: 1, pupilW: 1.6 }, 520)];
  }

  private meowSteps(c: Cat): Step[] {
    return [call(() => c.steps.unshift(...this.meowNow(c)))];
  }

  private meowNow(c: Cat): Step[] {
    const r = c.pose.headRot;
    return [
      call(() => this.env.sound('meow', c.index)),
      tw({ headRot: r - 12, mouth: 0.75, eye: 0.7, earNear: 6 }, 200, out),
      wait(260),
      tw({ mouth: 0.25 }, 160),
      tw({ headRot: r, mouth: 0, eye: 1, earNear: 0 }, 320),
    ];
  }

  private batSteps(): Step[] {
    return [
      tw({ pupilW: 2.5, earNear: 8 }, 150),
      tw(key('bat'), 190, out),
      tw({ fnS: -40, fnE: -8 }, 180),
      tw(key('bat', { fnS: -88 }), 170, out),
      tw({ ...POSES.sit, pupilW: 1.6 }, 420),
    ];
  }

  private stretchSteps(): Step[] {
    return [tw(key('bow'), 750), wait(550), tw(POSES.stand, 520), tw(key('hindStretch'), 560), wait(350), tw(POSES.stand, 460)];
  }

  private groomSteps(c: Cat): Step[] {
    const s: Step[] = [...this.go(c, 'sit', 600)];
    for (let i = 0; i < 4; i++) s.push(tw(key('groomLick', { tongue: 1, headY: 8 }), i === 0 ? 450 : 240), tw({ tongue: 0, headY: 5, headRot: 40 }, 220));
    for (let i = 0; i < 2; i++) s.push(tw(key('washFace'), 460), tw(key('groomLick', { tongue: 0, eye: 0.25 }), 400));
    s.push(tw({ ...POSES.sit }, 560));
    return s;
  }

  private kneadSteps(c: Cat): Step[] {
    const s: Step[] = [...this.go(c, 'sphinx', 600), tw({ eye: 0.35, pupilW: 2 }, 400)];
    for (let i = 0; i < 6; i++) s.push(tw({ fnS: -58, fnE: 34, ffS: -84, ffE: 0 }, 260), tw({ fnS: -84, fnE: 0, ffS: -60, ffE: 30 }, 260));
    s.push(tw({ ...POSES.sphinx, eye: 0.5 }, 500));
    return s;
  }

  private yawnSteps(c: Cat): Step[] {
    return [call(() => c.steps.unshift(...this.yawnNow(c)))];
  }

  private yawnNow(c: Cat): Step[] {
    const base = c.posture === 'sit' ? POSES.sit : c.posture === 'stand' ? POSES.stand : POSES.sphinx;
    return [
      tw({ headRot: base.headRot - 12, mouth: 1, eye: 0.08, earFar: -14, earNear: 14, tongue: 0 }, 700),
      wait(650),
      tw({ headRot: base.headRot, mouth: 0, eye: 0.85, earFar: 0, earNear: 0 }, 560),
    ];
  }

  private pounceSteps(c: Cat, onLand?: () => void): Step[] {
    const lane = this.env.lane();
    const up: Extract<Step, { kind: 'slide' }> = { kind: 'slide', toX: 0, dur: 260, to: { ...POSES.stand, y: -26, bodyRot: -12, fnS: -40, ffS: -30, hnH: 30, hfH: 26 }, ease: out };
    const down: Extract<Step, { kind: 'slide' }> = { kind: 'slide', toX: 0, dur: 230, to: { ...POSES.crouch, y: 0 }, ease: inQ };
    const s: Step[] = [...this.go(c, 'stand', 400), tw(POSES.crouch, 520)];
    for (let i = 0; i < 4; i++) s.push(tw({ bodyRot: 8, x: -1.5 }, 110), tw({ bodyRot: 2, x: 1.5 }, 110));
    s.push(
      call(() => {
        const land = clamp(c.x + 34 * c.facing * lane.scale, lane.min, lane.max);
        up.toX = c.x + (land - c.x) * 0.6;
        down.toX = land;
      }),
      up,
      down,
      call(() => onLand?.()),
      tw({ ...POSES.stand }, 380),
      call(() => this.setPosture(c, 'stand')),
    );
    return s;
  }

  // ----------------------------------------------------------- toys

  private yarnSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const reach = 52 * lane.scale;
    const side = () => (this.yarn.x >= c.x ? -1 : 1);
    return [
      ...this.walkTo(c, () => this.yarn.x + side() * reach, Math.abs(this.yarn.x - c.x) > 200 * lane.scale),
      call(() => (c.facing = this.yarn.x >= c.x ? 1 : -1)),
      this.label(c, 'batting the yarn ball'),
      ...this.go(c, 'sit', 380),
      tw({ pupilW: 2.6, earNear: 10, earFar: -6 }, 200),
      tw(key('bat'), 170, out),
      call(() => {
        this.yarn.vx = c.facing * rnd(0.32, 0.6) * lane.scale;
      }),
      tw({ ...POSES.sit, pupilW: 2.2 }, 380),
      wait(500),
      call(() => {
        if (Math.random() < 0.65) {
          c.steps.unshift(...this.chaseSteps(c));
        }
      }),
    ];
  }

  private chaseSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const reach = 46 * lane.scale;
    this.chaser = c;
    return [
      this.label(c, 'chasing the yarn ball'),
      ...this.go(c, 'stand', 300),
      {
        kind: 'walk',
        run: true,
        toX: () => this.yarn.x - (this.yarn.x >= c.x ? 1 : -1) * reach,
        until: () => Math.abs(this.yarn.vx) < 0.03 && Math.abs(Math.abs(this.yarn.x - c.x) - reach) < 6,
      },
      call(() => (c.facing = this.yarn.x >= c.x ? 1 : -1)),
      ...this.pounceSteps(c, () => {
        this.yarn.vx = c.facing * rnd(0.15, 0.35) * lane.scale;
      }),
      call(() => {
        if (this.chaser === c) this.chaser = null;
      }),
      this.label(c, 'proud of her catch'),
      ...this.go(c, 'sit', 500),
      ...this.slowBlink(),
    ];
  }

  private summonChaser(): void {
    if (this.chaser && !this.chaser.inside) return;
    const c = this.nearest(this.yarn.x, (k) => !k.inside && k.awake) ?? this.nearest(this.yarn.x, (k) => !k.inside);
    if (!c) return;
    this.interrupt(c);
    if (!c.awake) this.run(c, 'waking up for the yarn', [tw({ ...POSES.sphinx, eye: 1, pupilW: 2.5 }, 500), call(() => this.setPosture(c, 'sphinx'))]);
    c.steps.push(...this.chaseSteps(c));
  }

  private houseSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    if (lane.house === null || this.houseOwner !== null) return this.go(c, 'loaf');
    const door = lane.house;
    return [
      this.label(c, 'heading to the cat house'),
      ...this.walkTo(c, door),
      call(() => {
        if (this.houseOwner !== null) {
          this.interrupt(c);
          this.run(c, 'waiting her turn for the cat house', this.go(c, 'sit'));
          return;
        }
        this.houseOwner = c.index;
        c.inside = 'house';
        c.view.setHidden(true);
        this.world.setHouse(c.index);
        c.pose = { ...POSES.sleep, eye: 0.6 };
        c.posture = 'loaf';
      }),
      this.label(c, 'peeking out of the cat house'),
      wait(rnd(5000, 9000)),
      call(() => this.setPosture(c, 'sleep')),
      this.label(c, 'napping in the cat house'),
      wait(rnd(12000, 26000)),
      ...this.exitHouseSteps(c),
    ];
  }

  private exitHouseSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const out = clamp((lane.house ?? c.x) + 92 * lane.scale, lane.min, lane.max);
    return [
      call(() => {
        c.pose = { ...POSES.stand };
        c.posture = 'stand';
        c.facing = 1;
        this.render(c, 0, true);
        c.view.setHidden(false);
        this.world.setHouse(null);
        this.houseOwner = null;
        c.inside = null;
      }),
      this.label(c, 'stepping out of the cat house'),
      { kind: 'walk', toX: out },
      ...this.stretchSteps(),
      ...this.go(c, 'sit', 500),
    ];
  }

  private boxSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    if (lane.box === null || this.boxOwner !== null) return this.go(c, 'sit');
    const box = lane.box;
    const side = c.x < box ? -1 : 1;
    const approach = clamp(box + side * 92 * lane.scale, lane.min, lane.max);
    return [
      this.label(c, 'eyeing the cardboard box'),
      ...this.walkTo(c, approach),
      call(() => (c.facing = side > 0 ? -1 : 1)),
      tw({ ...POSES.sit, headRot: 20, pupilW: 2.5 }, 450),
      wait(500),
      tw(POSES.crouch, 400),
      call(() => {
        if (this.boxOwner !== null) {
          this.interrupt(c);
          this.run(c, 'sitting by the box', this.go(c, 'sit'));
          return;
        }
        this.boxOwner = c.index;
      }),
      this.label(c, 'hopping into the box — if it fits, she sits'),
      { kind: 'slide', toX: (approach + box) / 2, dur: 260, to: { ...POSES.stand, y: -40, bodyRot: -10, fnS: -30, ffS: -26, hnH: 24, hfH: 20 }, ease: out },
      { kind: 'slide', toX: box, dur: 260, to: { ...POSES.sit, y: BOX_FLOOR }, ease: inQ },
      call(() => {
        c.inside = 'box';
        this.setPosture(c, 'sit');
      }),
      this.label(c, 'sitting in the box'),
      ...this.slowBlink(),
      wait(rnd(4000, 7000)),
      tw({ ...POSES.loaf, y: BOX_FLOOR + 6, eye: 0.3 }, 900),
      call(() => this.setPosture(c, 'loaf')),
      this.label(c, 'snoozing in the box'),
      wait(rnd(8000, 16000)),
      ...this.exitBoxSteps(c),
    ];
  }

  private exitBoxSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const box = lane.box ?? c.x;
    const dir = box > (lane.min + lane.max) / 2 ? -1 : 1;
    const landX = clamp(box + dir * 96 * lane.scale, lane.min, lane.max);
    return [
      tw({ ...POSES.sit, y: BOX_FLOOR, eye: 1 }, 500),
      call(() => (c.facing = dir > 0 ? 1 : -1)),
      tw({ ...POSES.crouch, y: BOX_FLOOR }, 380),
      { kind: 'slide', toX: (box + landX) / 2, dur: 260, to: { ...POSES.stand, y: -40, bodyRot: -10, fnS: -30, ffS: -26, hnH: 24, hfH: 20 }, ease: out },
      { kind: 'slide', toX: landX, dur: 260, to: { ...POSES.crouch, y: 0 }, ease: inQ },
      call(() => {
        c.inside = null;
        this.boxOwner = null;
        c.posture = 'stand';
      }),
      tw(POSES.stand, 360),
      this.label(c, 'out of the box'),
      ...this.go(c, 'sit', 500),
    ];
  }

  private eatSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    if (lane.bowl === null) return [];
    const bowl = lane.bowl;
    const side = c.x < bowl ? -1 : 1;
    const spot = clamp(bowl + side * 60 * lane.scale, lane.min, lane.max);
    if (this.bowl <= 0.01) {
      return [
        this.label(c, 'checking the food bowl'),
        ...this.walkTo(c, spot),
        call(() => (c.facing = side > 0 ? -1 : 1)),
        tw({ ...POSES.stand, headRot: 34, headY: 12 }, 500),
        wait(700),
        ...this.go(c, 'sit', 500),
        this.label(c, 'asking you for a snack'),
        tw({ pupilW: 2.6, headRot: POSES.sit.headRot - 10 }, 300),
        ...(this.env.meows() ? this.meowSteps(c) : []),
        wait(2500),
      ];
    }
    const s: Step[] = [
      this.label(c, 'trotting to the food bowl'),
      ...this.walkTo(c, spot),
      call(() => (c.facing = side > 0 ? -1 : 1)),
      this.label(c, 'eating her supper'),
      tw({ ...POSES.stand, headRot: 38, headY: 15, headX: 2, eye: 0.6 }, 500),
    ];
    for (let i = 0; i < 6; i++) {
      s.push(
        tw({ headY: 18, mouth: 0.25 }, 200),
        tw({ headY: 14, mouth: 0 }, 200),
        call(() => {
          this.bowl = Math.max(0, this.bowl - 1 / 12);
          this.world.setBowl(this.bowl);
        }),
      );
    }
    s.push(call(() => (c.hunger = 0)), tw({ ...POSES.stand, tongue: 1 }, 260), tw({ tongue: 0 }, 220), tw({ tongue: 1 }, 220), tw({ tongue: 0 }, 220), ...this.groomSteps(c));
    return s;
  }

  // -------------------------------------------------- choosing & calm

  /** While someone writes: no walking, nothing sudden. */
  private calmDown(): void {
    for (const c of this.cats) {
      if (c.inside) continue;
      if (c.busyMoving) {
        this.interrupt(c);
        this.run(c, 'settling down to watch you write', this.go(c, 'sit', 500));
      }
    }
    if (Math.abs(this.yarn.vx) > 0.15) this.yarn.vx *= 0.9;
  }

  private ambientMeow(now: number, typing: boolean): void {
    this.meowAt = now + rnd(22000, 46000);
    if (!this.env.meows() || typing) return;
    const c = this.cats.filter((k) => k.awake && k.inside !== 'house' && !k.busyMoving && k.cur?.kind !== 'tween')[Math.random() < 0.5 ? 0 : 1] ?? this.cats.find((k) => k.awake && !k.busyMoving && k.inside !== 'house');
    if (!c) return;
    c.cur = null;
    const rest = c.steps;
    c.steps = [...this.meowSteps(c), ...rest];
    c.action = 'meowing';
    c.view.setAction('meowing', true);
  }

  private choose(c: Cat, typing: boolean): void {
    const lane = this.env.lane();
    const calmMood = this.env.mood() === 'calm';
    if (c.intent && !typing && !c.inside) {
      const want = c.intent;
      c.intent = null;
      this.act(c, want);
      return;
    }
    if (c.inside === 'house') {
      this.run(c, 'napping in the cat house', [wait(rnd(6000, 12000)), ...(typing ? [] : this.exitHouseSteps(c))]);
      return;
    }
    if (c.inside === 'box') {
      this.run(c, 'snoozing in the box', [wait(rnd(5000, 9000)), ...(typing ? [] : this.exitBoxSteps(c))]);
      return;
    }
    if (typing || calmMood) {
      const calm = pick<string>([
        ['watch', c.awake ? 4 : 0],
        ['blink', c.awake ? 2 : 0],
        ['ear', 2],
        ['flick', 2],
        ['doze', c.awake ? 1 : 6],
        ['knead', c.posture === 'sphinx' || c.posture === 'loaf' ? 1 : 0],
        ['groom', !typing && c.awake ? 1 : 0],
      ]);
      switch (calm) {
        case 'watch':
          this.run(c, 'watching the quill write', [...(c.posture === 'stand' ? this.go(c, 'sit') : []), tw({ pupilW: 2.2, earNear: 6, earFar: -4 }, 400), wait(rnd(3000, 6000))]);
          return;
        case 'blink':
          this.run(c, 'giving a slow blink', [...this.slowBlink(), wait(rnd(1500, 3000))]);
          return;
        case 'ear':
          this.run(c, c.awake ? 'twitching an ear' : 'twitching an ear in her sleep', [tw({ earNear: -18 }, 110), tw({ earNear: 0 }, 170), tw({ earNear: -14 }, 110), tw({ earNear: 0 }, 180), wait(rnd(2000, 4000))]);
          return;
        case 'flick':
          this.run(c, c.awake ? 'flicking her tail' : 'dreaming', [call(() => (c.flick = 14)), wait(rnd(2500, 4500))]);
          return;
        case 'knead':
          this.run(c, 'kneading — making biscuits', this.kneadSteps(c));
          return;
        case 'groom':
          this.run(c, 'licking her paw and washing her face', this.groomSteps(c));
          return;
        default:
          this.run(c, 'dozing', [...this.go(c, 'sleep', 1300), wait(rnd(6000, 12000))]);
          return;
      }
    }

    const home = lane.homes[c.index];
    const far = Math.abs(c.x - home) > 60 * lane.scale;
    const toys = c.awake ? 1 : 0;
    const options: [string, number][] =
      c.posture === 'sleep'
        ? [['sleep', 6], ['wake', 2], ['stretchUp', 1], ['ear', 1], ['flick', 1]]
        : c.posture === 'loaf' || c.posture === 'sphinx'
          ? [['blink', 2], ['knead', 2], ['yawn', 1], ['ear', 1], ['sleep', 2], ['sit', 2], ['stand', 1], ['home', far ? 2 : 0], ['house', lane.house !== null ? 1.2 : 0], ['eat', c.hunger > 0.5 ? 1.5 : 0]]
          : c.posture === 'sit'
            ? [['groom', 3], ['flick', 1], ['bat', 1], ['tilt', 1], ['yawn', 1], ['loaf', 1], ['stand', 1], ['home', far ? 2 : 0], ['yarn', 2 * toys], ['box', lane.box !== null ? 1.2 : 0], ['eat', c.hunger > 0.5 ? 1.5 : 0], ['aquarium', lane.aquarium !== null ? 2.2 : 0]]
            : [['stretch', 2], ['wander', 2], ['sit', 2], ['pounce', 1], ['home', far ? 3 : 0], ['yarn', 2], ['box', lane.box !== null ? 1 : 0], ['aquarium', lane.aquarium !== null ? 2.4 : 0]];
    this.act(c, pick(options));
    c.hunger = Math.min(1, c.hunger + 0.06);
  }

  private act(c: Cat, choice: string): void {
    const lane = this.env.lane();
    const home = lane.homes[c.index];
    switch (choice) {
      case 'sleep':
        this.run(c, 'sleeping, curled up', [...this.go(c, 'sleep', 1500), wait(rnd(9000, 20000))]);
        break;
      case 'wake':
        this.run(c, 'waking up', [...this.go(c, 'sphinx', 800), ...this.yawnSteps(c), wait(rnd(1500, 3000))]);
        break;
      case 'stretchUp':
        this.run(c, 'waking up with a big stretch', [...this.go(c, 'stand', 900), ...this.stretchSteps(), wait(800)]);
        break;
      case 'ear':
        this.run(c, 'twitching an ear', [tw({ earNear: -18 }, 110), tw({ earNear: 0 }, 170), wait(rnd(1500, 3000))]);
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
      case 'meow':
        this.run(c, 'meowing', [...this.go(c, c.posture === 'sleep' ? 'sphinx' : c.posture), ...this.meowSteps(c), wait(1500)]);
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
        this.run(c, 'tilting her head, curious', [...this.go(c, 'sit'), tw({ headRot: POSES.sit.headRot + 14, earNear: 14 }, 320, out), wait(1100), tw({ headRot: POSES.sit.headRot, earNear: 0 }, 420), wait(rnd(1500, 3000))]);
        break;
      case 'stretch':
        this.run(c, 'stretching — a play bow', [...this.go(c, 'stand', 600), ...this.stretchSteps(), wait(rnd(1000, 2000))]);
        break;
      case 'pounce':
        this.run(c, 'wiggling and pouncing', [...this.pounceSteps(c), wait(rnd(1200, 2400))]);
        break;
      case 'wander': {
        const span = 140 * lane.scale;
        const to = clamp(home + rnd(-span, span), lane.min, lane.max);
        this.run(c, 'strolling along the desk', [...this.walkTo(c, to), this.label(c, 'looking around'), tw(POSES.stand, 300), wait(rnd(800, 2000))]);
        break;
      }
      case 'home':
        this.run(c, 'heading back to her spot', [...this.walkTo(c, home), this.label(c, 'back in her spot'), tw(POSES.stand, 300), ...this.go(c, 'sit', 600)]);
        break;
      case 'yarn':
        this.run(c, 'going after the yarn ball', this.yarnSteps(c));
        break;
      case 'chase':
        c.steps.push(...this.chaseSteps(c));
        break;
      case 'house':
        this.run(c, 'heading to the cat house', this.houseSteps(c));
        break;
      case 'box':
        this.run(c, 'eyeing the cardboard box', this.boxSteps(c));
        break;
      case 'eat':
        this.run(c, 'trotting to the food bowl', this.eatSteps(c));
        break;
      case 'aquarium':
        this.run(c, 'going to watch the fish', this.aquariumSteps(c));
        break;
      case 'read':
        this.run(c, 'coming to read what you wrote', this.readSteps(c));
        break;
      case 'comfort':
        this.run(c, 'coming to sit with you', this.comfortSteps(c));
        break;
      default:
        this.run(c, 'resting', [wait(2000)]);
    }
  }

  // ------------------------------------------------------ the aquarium

  /** The writer sprinkles food: the fish rise to it and a cat comes to watch. */
  feedFish(): void {
    this.world.feedFish();
    this.foodUntil = performance.now() + 4800;
    this.foodX = rnd(66, 108);
    if (this.reduced) return;
    this.played();
    const c = this.nearest(this.env.lane().aquarium ?? 0, (k) => !k.inside && k.watch === null);
    if (c) {
      this.interrupt(c);
      if (!c.awake) this.env.sound('chirp', c.index);
      this.act(c, 'aquarium');
    }
  }

  private stepFish(dt: number, now: number): void {
    const T = { x0: 22, x1: 154, y0: 32, y1: 90 };
    const feeding = now < this.foodUntil;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (feeding) {
        const fall = 1 - (this.foodUntil - now) / 4800;
        f.tx = this.foodX + (i - 1) * 9;
        f.ty = 30 + fall * 52;
      } else if (f.wait > 0) {
        f.wait -= dt;
      } else if (Math.hypot(f.tx - f.x, f.ty - f.y) < 6) {
        f.tx = rnd(T.x0 + 6, T.x1 - 6);
        f.ty = rnd(T.y0 + 4, T.y1 - 6);
        f.wait = rnd(0, 900);
      }
      const k = feeding ? 0.000016 : 0.0000065;
      f.vx += (f.tx - f.x) * k * dt - f.vx * 0.0024 * dt;
      f.vy += (f.ty - f.y) * k * dt - f.vy * 0.0032 * dt;
      const sp = Math.hypot(f.vx, f.vy);
      const max = feeding ? 0.06 : 0.035;
      if (sp > max && sp > 0) {
        f.vx *= Math.max(max / sp, 0.97);
        f.vy *= Math.max(max / sp, 0.97);
      }
      f.x = clamp(f.x + f.vx * dt, T.x0, T.x1);
      f.y = clamp(f.y + f.vy * dt, T.y0, T.y1);
      if (Math.abs(f.vx) > 0.004) f.dir += (Math.sign(f.vx) - f.dir) * Math.min(1, dt / 160);
      const tilt = clamp((f.vy / (Math.abs(f.vx) + 0.01)) * 18, -24, 24);
      this.world.placeFish(i, f.x, f.y, f.dir, tilt);
    }
  }

  /** A paw on the glass: fish dart away from that side. */
  private tapGlass(side: 'l' | 'r'): void {
    this.world.rippleGlass(side);
    for (const f of this.fish) {
      const away = side === 'l' ? 1 : -1;
      f.vx += away * rnd(0.09, 0.14);
      f.vy += rnd(-0.05, 0.05);
      f.tx = side === 'l' ? rnd(110, 150) : rnd(26, 66);
      f.wait = 0;
    }
  }

  private aquariumSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    if (lane.aquarium === null) return this.go(c, 'sit');
    const tank = lane.aquarium;
    const side = c.x < tank ? -1 : 1;
    const spot = clamp(tank + side * (lane.aquariumHalf + 62 * lane.scale), lane.min, lane.max);
    const glass: 'l' | 'r' = side < 0 ? 'l' : 'r';
    const s: Step[] = [
      ...this.walkTo(c, spot),
      call(() => {
        c.facing = side < 0 ? 1 : -1;
        c.watch = Math.floor(Math.random() * this.fish.length);
      }),
      this.label(c, 'watching the fish'),
      ...this.go(c, 'sit', 500),
      tw({ ...POSES.sit, pupilW: 2.6, earNear: 10, earFar: -4, headRot: POSES.sit.headRot + 6 }, 400),
    ];
    for (let i = 0; i < 4; i++) {
      const what = pick<string>([['chatter', 2], ['paw', 2], ['flick', 1], ['switch', 1]]);
      s.push(wait(rnd(1200, 2600)));
      if (what === 'chatter')
        s.push(
          this.label(c, 'chattering at the fish'),
          call(() => this.env.sound('chatter', c.index)),
          tw({ mouth: 0.22 }, 70),
          tw({ mouth: 0 }, 70),
          tw({ mouth: 0.22 }, 70),
          tw({ mouth: 0 }, 70),
          tw({ mouth: 0.2 }, 70),
          tw({ mouth: 0 }, 90),
        );
      else if (what === 'paw')
        s.push(
          this.label(c, 'pawing at the fish through the glass'),
          tw(key('bat', { fnS: -96, fnE: -12, pupilW: 2.8 }), 220, out),
          call(() => this.tapGlass(glass)),
          tw({ fnS: -70, fnE: -20 }, 160),
          tw({ ...POSES.sit, pupilW: 2.6, earNear: 10 }, 420),
        );
      else if (what === 'flick') s.push(call(() => (c.flick = 18)));
      else s.push(call(() => (c.watch = ((c.watch ?? 0) + 1) % this.fish.length)));
    }
    s.push(wait(rnd(1500, 3000)), call(() => (c.watch = null)), this.label(c, 'done fish-watching (for now)'), ...this.slowBlink());
    return s;
  }

  // ------------------------------------------------------ the writing

  /** The writer typed, finished a word, a sentence or a paragraph, or erased. */
  react(ev: WritingEvent): void {
    if (this.reduced) return;
    const now = performance.now();
    if (ev.kind === 'typed') {
      this.written += ev.count;
      return;
    }
    const awake = this.cats.filter((c) => c.awake && c.inside !== 'house' && !c.busyMoving);
    const ready = (c: Cat) => now - c.lastReact > 2500;
    const watcher = awake.filter(ready).sort((a, b) => Number(b.action.includes('watch')) - Number(a.action.includes('watch')))[0];
    const now2 = (c: Cat, action: string, steps: Step[]) => {
      // never cut into a walk, a hop or a synchronised greeting
      if (c.busyMoving || c.cur?.kind === 'until') return;
      c.lastReact = now;
      c.reaction = action;
      const resume = c.cur && c.cur.kind !== 'call' ? [c.cur] : [];
      c.cur = null;
      c.from = { ...c.pose };
      c.steps.unshift(this.label(c, action), ...steps, ...resume);
    };
    if (ev.kind === 'sentence') {
      if (watcher && Math.random() < 0.4) now2(watcher, 'approving your sentence with a slow blink', this.slowBlink());
      return;
    }
    if (ev.kind === 'paragraph') {
      if (watcher && Math.random() < 0.5) now2(watcher, 'stretching a paw for the new paragraph', [tw({ earNear: -14 }, 120), tw({ earNear: 0 }, 180), ...(Math.random() < 0.4 ? this.yawnSteps(watcher) : [])]);
      return;
    }
    if (ev.kind === 'erase') {
      if (watcher && ev.count >= 12) now2(watcher, 'tilting her head at the crossing-out', [tw({ headRot: watcher.pose.headRot + 14, earNear: 12 }, 300, out), wait(700), tw({ headRot: watcher.pose.headRot, earNear: 0 }, 400)]);
      return;
    }
    const w = ev.word.toLowerCase().replace(/[^a-z']/g, '').replace(/'s$/, '');
    if (!w) return;
    const name = this.env.name.toLowerCase();
    const heartFrom = (c: Cat) => {
      const h = c.view.headPoint();
      if (h) this.env.heart(h.x, h.y - 16);
    };
    const all = (fn: (c: Cat) => void) => this.cats.filter((c) => c.inside !== 'house' && ready(c)).forEach(fn);
    if (/^(cat|cats|kitty|kitties|kitten|kittens|meow|meows|purr|purrs|purring|paw|paws|whisker|whiskers|tabby|tuxedo|feline|mew)$/.test(w)) {
      all((c) => {
        if (!c.awake) {
          now2(c, 'heard you write about cats (in her sleep)', [tw({ earNear: -16, earFar: 8 }, 120), tw({ earNear: 0, earFar: 0 }, 200)]);
          return;
        }
        now2(c, 'perking up: you wrote about cats', [tw({ earNear: 12, earFar: -8, pupilW: 2.5, headRot: c.pose.headRot + 10 }, 260, out), call(() => heartFrom(c)), wait(600), tw({ earNear: 0, earFar: 0, pupilW: 1.6, headRot: c.pose.headRot }, 420)]);
      });
      const singer = awake[0];
      if (singer && this.env.meows()) singer.steps.push(...this.meowSteps(singer));
      return;
    }
    if (name && w === name) {
      all((c) => now2(c, 'hearing a name she loves', [...(c.awake ? [] : [tw({ eye: 0.6 }, 300)]), call(() => heartFrom(c)), ...this.slowBlink()]));
      return;
    }
    if (/^(love|loved|loving|lovely|heart|hearts|darling|dear|sweetheart|kiss|kisses|hug|hugs|adore|beloved)$/.test(w)) {
      all((c) => now2(c, 'feeling the love in your words', [call(() => heartFrom(c)), ...(c.awake ? this.slowBlink() : [])]));
      return;
    }
    if (/^(fish|fishes|fishy|goldfish|aquarium|tuna|salmon|sushi|sardine|sardines)$/.test(w) && watcher) {
      now2(watcher, 'thinking about fish', [tw({ tongue: 1, pupilW: 2.6 }, 220), tw({ tongue: 0 }, 200), tw({ tongue: 1 }, 200), tw({ tongue: 0, pupilW: 1.8 }, 260)]);
      watcher.intent = 'aquarium';
      return;
    }
    if (/^(food|hungry|dinner|lunch|breakfast|snack|snacks|treat|treats|eat|eating|supper|milk)$/.test(w) && watcher) {
      now2(watcher, 'licking her lips — did you say food?', [tw({ tongue: 1 }, 220), tw({ tongue: 0 }, 220)]);
      watcher.intent = 'eat';
      watcher.hunger = 1;
      return;
    }
    if (/^(play|playing|toy|toys|yarn|ball|game|games|chase)$/.test(w) && watcher) {
      now2(watcher, 'wanting to play', [call(() => (watcher.flick = 20)), tw({ pupilW: 2.7 }, 300), wait(500)]);
      watcher.intent = 'yarn';
      return;
    }
    if (/^(sleep|sleepy|sleeping|tired|nap|naps|night|bed|dream|dreams|dreaming|yawn)$/.test(w) && watcher) {
      now2(watcher, 'yawning along with you', this.yawnSteps(watcher));
      return;
    }
    if (/^(rain|raining|storm|stormy|thunder)$/.test(w)) {
      all((c) => now2(c, 'flattening her ears at the thought of rain', [tw({ earNear: -22, earFar: 14 }, 250), wait(900), tw({ earNear: 0, earFar: 0 }, 400)]));
      return;
    }
    if (/^(sad|cry|cried|crying|tears|lonely|hurt|miss|missed|missing|upset|anxious|worried|scared)$/.test(w)) {
      const c = this.nearest(this.env.lane().pageMid, (k) => !k.inside) ?? null;
      if (c) {
        now2(c, 'sensing you might be sad', [tw({ earNear: -8, earFar: 6, eye: 0.7 }, 300), wait(500), tw({ earNear: 0, earFar: 0, eye: 1 }, 400)]);
        c.intent = 'comfort';
      }
    }
  }

  /** After a good stretch of writing and a pause, a cat comes to read it. */
  private maybeRead(now: number): void {
    if (this.written < 60 || now - this.env.lastTyped() < 4500 || now - this.lastRead < 20000 || this.env.mood() === 'calm') return;
    const c = this.nearest(this.env.lane().pageMid, (k) => !k.inside && !k.busyMoving && !k.intent && k.awake);
    if (!c) return;
    this.written = 0;
    this.lastRead = now;
    this.interrupt(c);
    this.act(c, 'read');
  }

  private readSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const spot = clamp(lane.pageMid + (c.x < lane.pageMid ? -1 : 1) * 40 * lane.scale, lane.min, lane.max);
    return [
      ...this.walkTo(c, spot),
      ...this.go(c, 'sit', 500),
      this.label(c, 'reading what you wrote'),
      tw({ ...POSES.sit, headRot: POSES.sit.headRot - 20, pupilY: -1, pupilW: 1.8, earNear: 6 }, 600),
      tw({ headRot: POSES.sit.headRot - 26 }, 1200),
      tw({ headRot: POSES.sit.headRot - 14 }, 1200),
      wait(600),
      ...this.slowBlink(),
      this.label(c, 'signing your page with her paw'),
      tw({ ...POSES.sit, fnS: -160, fnE: -20, headRot: POSES.sit.headRot - 18 }, 420, out),
      call(() => {
        if (this.env.stamp()) {
          const h = c.view.headPoint();
          if (h) this.env.heart(h.x, h.y - 18);
        }
      }),
      wait(260),
      tw({ ...POSES.sit }, 480),
      this.label(c, 'pleased with her signature'),
      wait(rnd(2500, 4000)),
    ];
  }

  private comfortSteps(c: Cat): Step[] {
    const lane = this.env.lane();
    const spot = clamp(lane.pageMid, lane.min, lane.max);
    return [
      ...this.walkTo(c, spot),
      ...this.go(c, 'sit', 500),
      this.label(c, 'sitting close to keep you company'),
      call(() => this.env.sound('purr', c.index)),
      tw({ ...POSES.sit, headRot: POSES.sit.headRot - 12, pupilW: 2 }, 500),
      ...this.slowBlink(),
      call(() => {
        const h = c.view.headPoint();
        if (h) this.env.heart(h.x, h.y - 16);
      }),
      wait(2500),
      ...this.slowBlink(),
      tw({ ...POSES.loaf, eye: 0.6 }, 900),
      call(() => this.setPosture(c, 'loaf')),
      this.label(c, 'keeping you company'),
      wait(rnd(8000, 12000)),
    ];
  }

  private leave(c: Cat): void {
    if (c.inside === 'house') {
      this.world.setHouse(null);
      this.houseOwner = null;
    }
    if (c.inside === 'box') this.boxOwner = null;
    c.inside = null;
    c.view.setHidden(false);
    c.pose.y = 0;
  }

  /** One cat walks over to the other to say hello; sometimes they nap together. */
  private social(now: number, forced: boolean): void {
    this.socialAt = now + rnd(30000, 52000);
    if (this.env.mood() === 'calm' && !forced) return;
    const [a, b] = Math.random() < 0.5 ? this.cats : [this.cats[1], this.cats[0]];
    if (a.inside || b.inside === 'house' || a.busyMoving || b.busyMoving || this.chaser) return;
    // don't interrupt a cat who is reading, comforting, or about to do something she wants to
    if (this.cats.some((c) => c.intent || /read|company|signature|fish/.test(c.action))) return;
    const lane = this.env.lane();
    const gap = 168 * lane.scale;
    const side = a.x < b.x ? -1 : 1;
    const target = clamp(b.x + side * gap, lane.min, lane.max);
    if (Math.abs(target - a.x) < 10) return;
    let arrived = false;
    this.interrupt(a);
    this.interrupt(b);
    const faceB = -side as 1 | -1;
    const together = Math.random() < 0.4 && !b.inside;
    this.run(a, 'walking over to say hello', [
      ...this.walkTo(a, target),
      call(() => {
        a.facing = faceB;
        arrived = true;
      }),
      this.label(a, 'nuzzling her friend'),
      tw(POSES.stand, 300),
      tw(key('nuzzle'), 520),
      call(() => {
        const h = a.view.headPoint();
        if (h) this.env.heart(h.x + 12 * faceB, h.y - 14);
      }),
      wait(700),
      tw(POSES.stand, 420),
      ...(Math.random() < 0.5
        ? [this.label(a, 'grooming her friend'), tw({ ...key('nuzzle'), tongue: 1, headY: 3 }, 240), tw({ tongue: 0, headY: 0 }, 220), tw({ tongue: 1, headY: 3 }, 240), tw({ ...POSES.stand }, 320)]
        : []),
      ...(together
        ? [this.label(a, 'curling up next to her friend'), tw(POSES.sit, 520), tw({ ...POSES.loaf }, 760), call(() => this.setPosture(a, 'loaf')), wait(2500), tw({ ...POSES.sleep }, 1600), call(() => this.setPosture(a, 'sleep')), wait(rnd(14000, 22000))]
        : [wait(600)]),
    ]);
    this.run(b, 'greeting her friend', [
      ...(b.inside ? [] : this.go(b, b.posture === 'sleep' ? 'sphinx' : b.posture, 600)),
      call(() => (b.facing = side as 1 | -1)),
      { kind: 'until', test: () => arrived, max: 15000 },
      tw({ headRot: b.pose.headRot - 10, headX: 4, eye: 0.2 }, 500),
      wait(900),
      tw({ eye: 1, headX: 0, headRot: b.pose.headRot }, 420),
      ...(together ? [tw({ ...POSES.sleep }, 1600), call(() => this.setPosture(b, 'sleep')), wait(rnd(14000, 22000))] : [wait(1200)]),
    ]);
  }
}
