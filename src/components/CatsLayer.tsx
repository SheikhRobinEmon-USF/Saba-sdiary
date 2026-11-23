import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import CatCompanion, { type CatHandle } from './CatCompanion';
import { AquariumArt, BowlArt, BoxBackArt, BoxFrontArt, HouseArt, TOY_SIZES, YarnArt } from './CatToys';
import { CatDirector, type CatView, type DirectorEnv, type Lane, type WorldView, type WritingEvent } from '../cats/catDirector';
import { journalConfig } from '../config/journalConfig';

interface Props {
  reducedMotion: boolean;
  mood: 'lively' | 'calm';
  meows(): boolean;
  lastTyped(): number;
  quill(): { x: number; y: number; active: boolean } | null;
  onSound(kind: 'purr' | 'chirp' | 'meow' | 'chatter', cat: number): void;
  /** press a paw print beside the latest words; false if there is nothing to sign */
  onStamp(): boolean;
}

export interface CatsLayerHandle {
  react(ev: WritingEvent): void;
}

const FEET_X = 110;
const FEET_Y = 140;
/** toys are drawn relative to the cats' original size */
const TOY = 0.82 * 1.25;

type ToyName = 'house' | 'boxBack' | 'boxFront' | 'bowl' | 'yarn' | 'aquarium';

/**
 * The cats' corner of the desk: two cats, a cat house, a cardboard box, a
 * food bowl and a ball of yarn, all standing on one "lane" along the front
 * edge of the desk. Only painted shapes take pointer input, so the paper
 * stays fully writable; while someone types, the cats keep still.
 */
const CatsLayer = forwardRef<CatsLayerHandle, Props>(function CatsLayer({ reducedMotion, mood, meows, lastTyped, quill, onSound, onStamp }, ref) {
  const layerRef = useRef<HTMLDivElement>(null);
  const printsRef = useRef<HTMLDivElement>(null);
  const wrapRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const catRefs = [useRef<CatHandle>(null), useRef<CatHandle>(null)];
  const toyRefs = {
    house: useRef<HTMLButtonElement>(null),
    boxBack: useRef<HTMLDivElement>(null),
    boxFront: useRef<HTMLButtonElement>(null),
    bowl: useRef<HTMLButtonElement>(null),
    yarn: useRef<HTMLButtonElement>(null),
    aquarium: useRef<HTMLButtonElement>(null),
  };
  const fishRefs = useRef<(SVGGElement | null)[]>([]);
  const toyScale = useRef(1);
  const [feeds, setFeeds] = useState(0);
  const yarnBallRef = useRef<HTMLDivElement>(null);
  const director = useRef<CatDirector | null>(null);
  const lane = useRef<Lane>({ y: 0, min: 0, max: 0, homes: [0, 0], scale: 1, house: null, box: null, bowl: null, aquarium: null, aquariumHalf: 0, yarnHome: 0, pageMid: 0 });
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [houseCat, setHouseCat] = useState<number | null>(null);
  const [food, setFood] = useState(1);
  const propsRef = useRef({ lastTyped, quill, onSound, mood, meows, onStamp });
  propsRef.current = { lastTyped, quill, onSound, mood, meows, onStamp };

  useImperativeHandle(ref, () => ({ react: (ev) => director.current?.react(ev) }), []);
  const cats = journalConfig.cats;

  useEffect(() => {
    const layer = layerRef.current!;

    const placeToy = (name: ToyName, x: number | null) => {
      const el = toyRefs[name].current;
      if (!el) return;
      const size = TOY_SIZES[name === 'boxBack' || name === 'boxFront' ? 'box' : name];
      if (x === null) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      const s = toyScale.current;
      el.style.transform = `translate3d(${(x - (size.w * s) / 2).toFixed(1)}px, ${(lane.current.y - size.h * s + 2 * s).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    };

    const setZone = (px: number) => document.documentElement.style.setProperty('--cat-zone', `${Math.round(px)}px`);
    const measure = () => {
      const L = layer.getBoundingClientRect();
      const tb = document.querySelector('.toolbar')?.getBoundingClientRect();
      const sheet = document.querySelector('.sheet')?.getBoundingClientRect();
      if (!tb || !sheet || L.width === 0) {
        setZone(0);
        return;
      }
      const sl = sheet.left - L.left;
      const sr = sheet.right - L.left;
      const size = journalConfig.catSize;
      const w = (k: keyof typeof TOY_SIZES, t: number) => TOY_SIZES[k].w * t;
      let next: Lane;
      if (L.width < 900) {
        const base = Math.max(0.5, Math.min(0.68, L.width / 640));
        const scale = base * size;
        const t = base * TOY;
        toyScale.current = t;
        const left = sl + 4;
        const right = sr - 6;
        const showHouse = L.width >= 600;
        const showBox = L.width >= 720;
        const aquarium = right - w('aquarium', t) / 2;
        const house = showHouse ? left + w('house', t) / 2 : null;
        const box = showBox ? left + w('house', t) + 8 + w('box', t) / 2 : null;
        const groupEnd = box !== null ? box + w('box', t) / 2 : house !== null ? house + w('house', t) / 2 : left;
        const bowl = groupEnd + 6 + w('bowl', t) / 2;
        const midL = bowl + w('bowl', t) / 2;
        const midR = aquarium - w('aquarium', t) / 2;
        next = {
          y: tb.top - L.top + 3,
          scale,
          min: left + 64 * scale,
          max: right - 64 * scale,
          homes: [Math.max(left + 64 * scale, midL + (midR - midL) * 0.18), Math.min(right - 64 * scale, midL + (midR - midL) * 0.8)],
          house,
          box,
          bowl,
          aquarium,
          aquariumHalf: w('aquarium', t) / 2,
          yarnHome: midL + (midR - midL) * 0.48,
          pageMid: (sl + sr) / 2,
        };
      } else {
        const base = Math.max(0.78, Math.min(1.32, sl / 196));
        const scale = base * size;
        const t = base * TOY;
        toyScale.current = t;
        const house = 10 + w('house', t) / 2;
        const box = 10 + w('house', t) + 10 + w('box', t) / 2;
        const aquarium = L.width - 10 - w('aquarium', t) / 2;
        const bowl = box + w('box', t) / 2 + 10 + w('bowl', t) / 2;
        const midL = bowl + w('bowl', t) / 2;
        const midR = aquarium - w('aquarium', t) / 2;
        next = {
          y: tb.top - L.top + 4,
          scale,
          min: 66 * scale,
          max: L.width - 66 * scale,
          homes: [midL + (midR - midL) * 0.1, midL + (midR - midL) * 0.9],
          house,
          box,
          bowl,
          aquarium,
          aquariumHalf: w('aquarium', t) / 2,
          yarnHome: midL + (midR - midL) * 0.42,
          pageMid: (sl + sr) / 2,
        };
      }
      lane.current = next;
      // keep the writing above the cats: the page's scroll area stops at their heads
      setZone(Math.max(0, sheet.bottom - L.top - (next.y - 100 * next.scale)));
      placeToy('house', next.house);
      placeToy('boxBack', next.box);
      placeToy('boxFront', next.box);
      placeToy('bowl', next.bowl);
      placeToy('aquarium', next.aquarium);
    };
    measure();

    const views: CatView[] = [0, 1].map((i) => ({
      apply: (p) => catRefs[i].current?.apply(p),
      place: (x, facing) => {
        const el = wrapRefs[i].current;
        if (!el) return;
        const { y, scale } = lane.current;
        el.style.transform = `translate3d(${(x - FEET_X).toFixed(1)}px, ${(y - FEET_Y).toFixed(1)}px, 0) scale(${(facing * scale).toFixed(3)}, ${scale.toFixed(3)})`;
      },
      setAction: (name, awake) => {
        const el = wrapRefs[i].current?.querySelector('button');
        if (!el) return;
        el.dataset.action = name;
        el.dataset.awake = awake ? 'true' : 'false';
        el.setAttribute('aria-label', `${cats[i].label} is ${name}. Tap to say hello.`);
      },
      setHidden: (hidden) => {
        wrapRefs[i].current?.classList.toggle('is-hidden', hidden);
      },
      headPoint: () => {
        const head = catRefs[i].current?.headElement();
        if (!head) return null;
        const r = head.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
      },
    }));

    const world: WorldView = {
      placeYarn: (x, rot) => {
        const el = toyRefs.yarn.current;
        const ball = yarnBallRef.current;
        if (!el || !ball) return;
        const s = toyScale.current;
        el.style.transform = `translate3d(${(x - (TOY_SIZES.yarn.w * s) / 2).toFixed(1)}px, ${(lane.current.y - TOY_SIZES.yarn.h * s + 2 * s).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        ball.style.transform = `rotate(${((rot * 180) / Math.PI).toFixed(1)}deg)`;
      },
      setBowl: (f) => setFood(f),
      placeFish: (i, x, y, dir, tilt) => {
        const g = fishRefs.current[i];
        if (!g) return;
        const d = Math.abs(dir) < 0.15 ? Math.sign(dir || 1) * 0.15 : dir;
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${d.toFixed(2)} 1) rotate(${(tilt * Math.sign(d)).toFixed(1)})`);
      },
      feedFish: () => setFeeds((n) => n + 1),
      rippleGlass: (side) => {
        const el = toyRefs.aquarium.current;
        if (!el) return;
        el.dataset.ripple = '';
        void el.offsetWidth;
        el.dataset.ripple = side;
      },
      fishPoint: (i) => {
        const el = toyRefs.aquarium.current;
        const g = fishRefs.current[i];
        if (!el || !g) return null;
        const r = g.getBoundingClientRect();
        return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      },
      setHouse: (occ) => setHouseCat(occ),
      pawPrint: (x, facing) => {
        const host = printsRef.current;
        if (!host || host.childElementCount > 26) return;
        const s = lane.current.scale;
        const p = document.createElement('span');
        p.className = 'paw-print';
        p.style.transform = `translate3d(${(x - 6 * s).toFixed(1)}px, ${(lane.current.y - 7 * s).toFixed(1)}px, 0) rotate(${facing > 0 ? 90 : -90}deg) scale(${(s * 0.8).toFixed(2)})`;
        host.append(p);
        window.setTimeout(() => p.remove(), 4200);
      },
    };

    const env: DirectorEnv = {
      lastTyped: () => propsRef.current.lastTyped(),
      quill: () => propsRef.current.quill(),
      sound: (k, i) => propsRef.current.onSound(k, i),
      meows: () => propsRef.current.meows(),
      stamp: () => propsRef.current.onStamp(),
      name: journalConfig.recipientName,
      mood: () => propsRef.current.mood,
      heart: (x, y) => {
        const L = layer.getBoundingClientRect();
        const id = performance.now() + Math.random();
        setHearts((h) => [...h, { id, x: x - L.left, y: y - L.top }]);
        window.setTimeout(() => setHearts((h) => h.filter((v) => v.id !== id)), 1900);
      },
      lane: () => lane.current,
    };

    const d = new CatDirector(views as [CatView, CatView], world, env, reducedMotion);
    director.current = d;
    d.start();
    (window as unknown as { __cats?: object }).__cats = {
      info: () => d.info(),
      world: () => d.world_info(),
      tap: (i: number) => d.tap(i),
      perform: (i: number, name: string) => d.perform(i, name),
    };

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measure();
        d.relayout();
      });
    });
    ro.observe(layer);
    const tb = document.querySelector('.toolbar');
    if (tb) ro.observe(tb);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      d.stop();
      director.current = null;
      setZone(0);
    };
    // the director is created once; preference changes are read through propsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => director.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  // --- yarn: tap to flick it, or drag and let go to throw it
  const drag = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const layerX = (clientX: number) => clientX - (layerRef.current?.getBoundingClientRect().left ?? 0);

  return (
    <div className="cats-layer" ref={layerRef}>
      <div className="paw-prints" ref={printsRef} aria-hidden="true" />
      <div className="toy toy-box-back" ref={toyRefs.boxBack} aria-hidden="true">
        <BoxBackArt />
      </div>
      {cats.map((cat, i) => (
        <div key={i} className="cat-wrap" ref={wrapRefs[i]}>
          <CatCompanion
            ref={catRefs[i]}
            coat={cat.coat}
            id={`cat${i}`}
            label={`${cat.label} is resting. Tap to say hello.`}
            action="resting"
            onTap={() => director.current?.tap(i)}
          />
        </div>
      ))}
      <button
        type="button"
        className="toy toy-house"
        ref={toyRefs.house}
        aria-label={houseCat === null ? 'Cat house — invite a cat in for a nap' : 'Cat house — a cat is napping inside; tap to wake her'}
        onClick={() => director.current?.tapHouse()}
      >
        <HouseArt occupant={houseCat === null ? null : cats[houseCat].coat} />
      </button>
      <button
        type="button"
        className="toy toy-box"
        ref={toyRefs.boxFront}
        aria-label="Cardboard box — a cat will hop in (or out)"
        onClick={() => director.current?.tapBox()}
      >
        <BoxFrontArt />
      </button>
      <button
        type="button"
        className="toy toy-bowl"
        ref={toyRefs.bowl}
        aria-label={food > 0.05 ? 'Food bowl with fishy treats' : 'Empty food bowl — tap to fill it'}
        onClick={() => director.current?.fillBowl()}
      >
        <BowlArt food={food} />
      </button>
      <button
        type="button"
        className="toy toy-aquarium"
        ref={toyRefs.aquarium}
        aria-label="Aquarium with three goldfish — tap to sprinkle fish food"
        onClick={() => director.current?.feedFish()}
      >
        <AquariumArt fishRef={(i) => (el) => (fishRefs.current[i] = el)} feeds={feeds} />
      </button>
      <button
        type="button"
        className="toy toy-yarn"
        ref={toyRefs.yarn}
        aria-label="Ball of yarn — tap to roll it, or drag and let go to throw it"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            director.current?.kickYarn((e.key === 'ArrowLeft' ? -0.7 : 0.7) * lane.current.scale);
          }
        }}
        onClick={(e) => {
          // keyboard activation (detail 0) — pointer taps are handled on pointerup
          if (e.detail === 0) director.current?.kickYarn();
        }}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, startX: e.clientX, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const dr = drag.current;
          if (!dr || dr.id !== e.pointerId) return;
          if (Math.abs(e.clientX - dr.startX) > 4) dr.moved = true;
          if (dr.moved) director.current?.dragYarn(layerX(e.clientX));
        }}
        onPointerUp={(e) => {
          const dr = drag.current;
          drag.current = null;
          if (!dr || dr.id !== e.pointerId) return;
          if (dr.moved) director.current?.releaseYarn();
          else director.current?.kickYarn();
        }}
        onPointerCancel={() => {
          drag.current = null;
          director.current?.releaseYarn();
        }}
      >
        <div className="yarn-spin" ref={yarnBallRef}>
          <YarnArt />
        </div>
      </button>
      {hearts.map((h) => (
        <span key={h.id} className="cat-heart" style={{ left: h.x, top: h.y }} aria-hidden="true">
          <svg viewBox="0 0 20 18" width="18" height="16">
            <path d="M10 17 C4 12 1 9 1 5.5 C1 3 3 1 5.5 1 C7.5 1 9 2.3 10 4 C11 2.3 12.5 1 14.5 1 C17 1 19 3 19 5.5 C19 9 16 12 10 17 Z" fill="#c88f9d" />
          </svg>
        </span>
      ))}
    </div>
  );
});

export default CatsLayer;
