import { useEffect, useRef, useState } from 'react';
import CatCompanion, { type CatHandle } from './CatCompanion';
import { CatDirector, type CatView, type DirectorEnv } from '../cats/catDirector';
import { journalConfig } from '../config/journalConfig';

interface Props {
  reducedMotion: boolean;
  lastTyped(): number;
  quill(): { x: number; y: number; active: boolean } | null;
  onSound(kind: 'purr' | 'chirp'): void;
}

interface Lane {
  y: number;
  min: number;
  max: number;
  homes: [number, number];
  scale: number;
}

const W = 220;
const FEET_X = 110;
const FEET_Y = 140;

/**
 * Two cats living on the desk. They are drawn above the paper but never take
 * pointer input except on their own painted shapes, and they keep still
 * while someone is writing.
 */
export default function CatsLayer({ reducedMotion, lastTyped, quill, onSound }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const wrapRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const catRefs = [useRef<CatHandle>(null), useRef<CatHandle>(null)];
  const director = useRef<CatDirector | null>(null);
  const lane = useRef<Lane>({ y: 0, min: 0, max: 0, homes: [0, 0], scale: 0.8 });
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const propsRef = useRef({ lastTyped, quill, onSound });
  propsRef.current = { lastTyped, quill, onSound };
  const cats = journalConfig.cats;

  useEffect(() => {
    const layer = layerRef.current!;
    const measure = () => {
      const L = layer.getBoundingClientRect();
      const tb = document.querySelector('.toolbar')?.getBoundingClientRect();
      const sheet = document.querySelector('.sheet')?.getBoundingClientRect();
      const scene = document.querySelector('.scene')?.getBoundingClientRect();
      if (!tb || !sheet || !scene || L.width === 0) return;
      const narrow = L.width < 900;
      if (narrow) {
        const scale = Math.max(0.36, Math.min(0.5, L.width / 860));
        const half = (W / 2) * scale;
        const left = sheet.left - L.left;
        lane.current = {
          y: tb.top - L.top + 3,
          scale,
          min: left + half,
          max: Math.max(left + half + 10, sheet.right - L.left - 70 - half),
          homes: [left + half + 4, left + half * 3 + 2],
        };
      } else {
        const gutter = sheet.left - scene.left;
        const scale = Math.max(0.6, Math.min(1, gutter / 250));
        const half = (W / 2) * scale;
        lane.current = {
          y: tb.top - L.top + 4,
          scale,
          min: half + 8,
          max: L.width - half - 8,
          homes: [Math.max(half + 8, sheet.left - L.left - gutter / 2 + 12), Math.min(L.width - half - 8, sheet.right - L.left + gutter / 2 - 6)],
        };
      }
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
      headPoint: () => {
        const head = catRefs[i].current?.headElement();
        if (!head) return null;
        const r = head.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
      },
    }));

    const env: DirectorEnv = {
      lastTyped: () => propsRef.current.lastTyped(),
      quill: () => propsRef.current.quill(),
      sound: (k) => propsRef.current.onSound(k),
      heart: (x, y) => {
        const L = layer.getBoundingClientRect();
        const id = performance.now() + Math.random();
        setHearts((h) => [...h, { id, x: x - L.left, y: y - L.top }]);
        window.setTimeout(() => setHearts((h) => h.filter((v) => v.id !== id)), 1900);
      },
      lane: () => lane.current,
    };

    const d = new CatDirector(views as [CatView, CatView], env, reducedMotion);
    director.current = d;
    d.start();
    (window as unknown as { __cats?: object }).__cats = { info: () => d.info(), tap: (i: number) => d.tap(i), perform: (i: number, name: string) => d.perform(i, name) };

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
    // the director is created once; reduced-motion changes are pushed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => director.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  return (
    <div className="cats-layer" ref={layerRef}>
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
