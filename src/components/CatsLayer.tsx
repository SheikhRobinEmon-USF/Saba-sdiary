import { useEffect, useRef, useState } from 'react';
import CatCompanion, { type CatHandle } from './CatCompanion';
import { BowlArt, BoxBackArt, BoxFrontArt, HouseArt, TOY_SIZES, YarnArt } from './CatToys';
import { CatDirector, type CatView, type DirectorEnv, type Lane, type WorldView } from '../cats/catDirector';
import { journalConfig } from '../config/journalConfig';

interface Props {
  reducedMotion: boolean;
  mood: 'lively' | 'calm';
  meows(): boolean;
  lastTyped(): number;
  quill(): { x: number; y: number; active: boolean } | null;
  onSound(kind: 'purr' | 'chirp' | 'meow', cat: number): void;
}

const FEET_X = 110;
const FEET_Y = 140;
/** toys are drawn a little smaller than the cats' own scale */
const TOY = 0.82;

type ToyName = 'house' | 'boxBack' | 'boxFront' | 'bowl' | 'yarn';

/**
 * The cats' corner of the desk: two cats, a cat house, a cardboard box, a
 * food bowl and a ball of yarn, all standing on one "lane" along the front
 * edge of the desk. Only painted shapes take pointer input, so the paper
 * stays fully writable; while someone types, the cats keep still.
 */
export default function CatsLayer({ reducedMotion, mood, meows, lastTyped, quill, onSound }: Props) {
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
  };
  const yarnBallRef = useRef<HTMLDivElement>(null);
  const director = useRef<CatDirector | null>(null);
  const lane = useRef<Lane>({ y: 0, min: 0, max: 0, homes: [0, 0], scale: 1, house: null, box: null, bowl: null, yarnHome: 0 });
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [houseCat, setHouseCat] = useState<number | null>(null);
  const [food, setFood] = useState(1);
  const propsRef = useRef({ lastTyped, quill, onSound, mood, meows });
  propsRef.current = { lastTyped, quill, onSound, mood, meows };
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
      const s = lane.current.scale * TOY;
      el.style.transform = `translate3d(${(x - (size.w * s) / 2).toFixed(1)}px, ${(lane.current.y - size.h * s + 2 * s).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    };

    const measure = () => {
      const L = layer.getBoundingClientRect();
      const tb = document.querySelector('.toolbar')?.getBoundingClientRect();
      const sheet = document.querySelector('.sheet')?.getBoundingClientRect();
      if (!tb || !sheet || L.width === 0) return;
      const sl = sheet.left - L.left;
      const sr = sheet.right - L.left;
      if (L.width < 900) {
        const scale = Math.max(0.5, Math.min(0.68, L.width / 640));
        const t = scale * TOY;
        const left = sl + 4;
        const right = sr - 8 - (L.width < 560 ? 62 : 84); // keep clear of the wax seal
        const house = left + (TOY_SIZES.house.w * t) / 2;
        const showBox = L.width >= 600;
        const box = showBox ? right - (TOY_SIZES.box.w * t) / 2 : null;
        const bowlX = (box !== null ? box - (TOY_SIZES.box.w * t) / 2 : right) - (TOY_SIZES.bowl.w * t) / 2 - 4;
        const cat0 = house + (TOY_SIZES.house.w * t) / 2 + 52 * scale;
        lane.current = {
          y: tb.top - L.top + 3,
          scale,
          min: left + 40 * scale,
          max: right - 30 * scale,
          homes: [cat0, Math.min(bowlX - 70 * scale, cat0 + 120 * scale)],
          house,
          box,
          bowl: bowlX,
          yarnHome: cat0 + 66 * scale,
        };
      } else {
        const gutter = sl;
        const scale = Math.max(0.78, Math.min(1.32, gutter / 196));
        const t = scale * TOY;
        const houseW = TOY_SIZES.house.w * t;
        const boxW = TOY_SIZES.box.w * t;
        const house = 10 + houseW / 2;
        const box = L.width - 10 - boxW / 2;
        lane.current = {
          y: tb.top - L.top + 4,
          scale,
          min: 50 * scale,
          max: L.width - 50 * scale,
          homes: [house + houseW / 2 + 70 * scale, box - boxW / 2 - 72 * scale],
          house,
          box,
          bowl: Math.max(sl + 120 * scale, sr - 260 * scale),
          yarnHome: house + houseW / 2 + 160 * scale,
        };
      }
      const l = lane.current;
      placeToy('house', l.house);
      placeToy('boxBack', l.box);
      placeToy('boxFront', l.box);
      placeToy('bowl', l.bowl);
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
        const s = lane.current.scale * TOY;
        el.style.transform = `translate3d(${(x - (TOY_SIZES.yarn.w * s) / 2).toFixed(1)}px, ${(lane.current.y - TOY_SIZES.yarn.h * s + 2 * s).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        ball.style.transform = `rotate(${((rot * 180) / Math.PI).toFixed(1)}deg)`;
      },
      setBowl: (f) => setFood(f),
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
}
