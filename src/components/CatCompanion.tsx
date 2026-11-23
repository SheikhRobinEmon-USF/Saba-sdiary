import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { applyPose, POSES, type Pose, type RigParts } from '../cats/catRig';

export type Coat = 'tabby' | 'tuxedo';

const COATS = {
  tabby: {
    fur: '#efe0c6', shade: '#d9c19b', line: '#50372d', stripe: '#8f6c52', paw: '#f4e8d2', chest: '#f7eedd',
    ribbon: '#c88f9d', ribbonDark: '#794454', iris: '#b69a69', innerEar: '#f4dce1', nose: '#c88f9d', bell: null as string | null,
  },
  tuxedo: {
    fur: '#5c4940', shade: '#47372f', line: '#2a1e18', stripe: null as string | null, paw: '#f6eee0', chest: '#f6eee0',
    ribbon: '#794454', ribbonDark: '#4d2531', iris: '#b5b66a', innerEar: '#d9a6b2', nose: '#c88f9d', bell: '#c9a85c',
  },
};

export interface CatHandle {
  apply(p: Pose): void;
  svg(): SVGSVGElement | null;
  headElement(): SVGGElement | null;
}

interface Props {
  coat: Coat;
  id: string;
  label: string;
  action: string;
  onTap(): void;
}

/**
 * One articulated sepia line-art cat (side view, facing right). The parent
 * director animates it through `apply(pose)`; the button gives keyboard and
 * screen-reader users the same "say hello" interaction as a tap.
 */
const CatCompanion = forwardRef<CatHandle, Props>(function CatCompanion({ coat, id, label, action, onTap }, ref) {
  void POSES;
  const c = COATS[coat];
  const r = useRef<Partial<Record<string, SVGElement | null>>>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const set = (k: string) => (el: SVGElement | null) => {
    r.current[k] = el;
  };

  useImperativeHandle(ref, () => ({
    apply(p: Pose) {
      const g = r.current as Record<string, SVGElement>;
      if (!g.root) return;
      const legs = (k: string) => ({
        top: g[`${k}Top`] as SVGGElement,
        upper: g[`${k}Upper`],
        lower: g[`${k}Lower`] as SVGGElement,
        lowerShape: g[`${k}LowerShape`],
      });
      const parts: RigParts = {
        root: g.root as SVGGElement,
        body: g.body as SVGGElement,
        head: g.head as SVGGElement,
        earFar: g.earFar as SVGGElement,
        earNear: g.earNear as SVGGElement,
        eyes: [g.eye0 as SVGGElement, g.eye1 as SVGGElement],
        pupils: [g.pupil0, g.pupil1],
        eyesClosed: g.eyesClosed as SVGGElement,
        mouthOpen: g.mouthOpen as SVGGElement,
        mouthClosed: g.mouthClosed,
        tongue: g.tongue as SVGGElement,
        legs: { fn: legs('fn'), ff: legs('ff'), hn: legs('hn'), hf: legs('hf') },
        tail: [g.tailOutline, g.tailFill, g.tailStripe].filter(Boolean) as SVGPathElement[],
      };
      applyPose(parts, p);
    },
    svg: () => svgRef.current,
    headElement: () => (r.current.head as SVGGElement | undefined) ?? null,
  }));

  const S = { stroke: c.line, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const grad = `${id}-fur`;

  const frontLeg = (k: 'fn' | 'ff', far: boolean): ReactNode => (
    <g ref={set(`${k}Top`)}>
      <g ref={set(`${k}Upper`)}>
        <path d="M-6.5 -6 L6.5 -6 L6 16.5 L-6 16.5 Z" fill={far ? c.shade : `url(#${grad})`} />
        <path d="M-6.5 -2 L-6 16.5 M6.5 -2 L6 16.5" fill="none" {...S} />
      </g>
      <g ref={set(`${k}Lower`)}>
        <g ref={set(`${k}LowerShape`)}>
          <path d="M-6 -1 L6 -1 L5.5 16 L-5.5 16 Z" fill={far ? c.shade : coat === 'tuxedo' ? c.paw : `url(#${grad})`} />
          <path d="M-6 0 L-5.5 16 M6 0 L5.5 16" fill="none" {...S} />
        </g>
        <g>
          <path d="M-6.5 -1 C-7.5 4 -4 6.5 2 6.5 C8 6.5 10.5 4 9 0.5 C8 -2 6 -2.5 5 -2" fill={far ? c.shade : c.paw} {...S} />
          <path d="M2 2.5 L2.5 6 M5.5 2 L6 6" fill="none" {...S} strokeWidth={0.9} />
        </g>
      </g>
    </g>
  );

  const hindLeg = (k: 'hn' | 'hf', far: boolean): ReactNode => (
    <g ref={set(`${k}Top`)}>
      <g ref={set(`${k}Upper`)}>
        <path d="M-15 -2 C-16 -14 -4 -20 6 -16 C16 -12 17 4 12 14 C8 21 -2 22 -8 16 C-13 11 -15 6 -15 -2 Z" fill={far ? c.shade : `url(#${grad})`} />
        <path d="M6 -16 C16 -12 17 4 12 14 C8 21 -2 22 -8 16" fill="none" {...S} />
      </g>
      <g ref={set(`${k}Lower`)} >
        <g ref={set(`${k}LowerShape`)}>
          <path d="M-5 -3 L5 -3 L4.5 16 L-4.5 16 Z" fill={far ? c.shade : coat === 'tuxedo' ? c.paw : `url(#${grad})`} />
          <path d="M-5 0 L-4.5 16 M5 0 L4.5 16" fill="none" {...S} />
        </g>
        <g>
          <path d="M-5.5 -1 C-6.5 4 -3 6.5 3 6.5 C9 6.5 11 4 9.5 0.5 C8.5 -2 6 -2.5 4.5 -2" fill={far ? c.shade : c.paw} {...S} />
          <path d="M3 2.5 L3.5 6 M6.5 2 L7 6" fill="none" {...S} strokeWidth={0.9} />
        </g>
      </g>
    </g>
  );

  return (
    <button type="button" className={`cat cat-${coat}`} data-action={action} aria-label={label} onClick={onTap}>
      <svg ref={svgRef} viewBox="0 0 220 150" width="220" height="150" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.fur} />
            <stop offset="1" stopColor={c.shade} />
          </linearGradient>
          <radialGradient id={`${id}-shadow`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#392a24" stopOpacity=".32" />
            <stop offset="1" stopColor="#392a24" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={set('root')}>
          <ellipse className="cat-shadow" cx="104" cy="142" rx="72" ry="7" fill={`url(#${id}-shadow)`} />
          <g ref={set('body')}>
            {hindLeg('hf', true)}
            {frontLeg('ff', true)}
            {/* body */}
            <path
              className="cat-hit"
              d="M62 76 C82 63 122 63 140 69 C153 74 160 88 156 102 C152 113 136 116 120 114 C102 112 86 116 70 114 C54 112 45 98 49 86 C51 80 56 77 62 76 Z"
              fill={`url(#${grad})`}
              {...S}
              strokeWidth={1.8}
            />
            {coat === 'tuxedo' && (
              <path d="M136 92 C142 86 152 88 155 98 C153 108 142 113 128 113 C124 106 128 96 136 92 Z" fill={c.chest} />
            )}
            {c.stripe && (
              <g stroke={c.stripe} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity=".7">
                <path d="M78 67 C76 74 78 80 82 84 M92 65 C90 72 92 79 96 83 M106 64 C104 71 106 78 110 82 M120 66 C118 72 120 79 124 83" />
              </g>
            )}
            <g stroke={c.line} strokeWidth="1" opacity=".5" fill="none" strokeLinecap="round">
              <path d="M70 70 l-2 5 M86 66 l-2 5 M100 65 l-2 5 M114 65 l-2 5 M128 67 l-2 5 M56 80 l-3 4 M52 92 l-3 3" />
            </g>
            {hindLeg('hn', false)}
            {frontLeg('fn', false)}
            {/* tail */}
            <path ref={set('tailOutline')} fill="none" stroke={c.line} strokeWidth="11" strokeLinecap="round" />
            <path ref={set('tailFill')} fill="none" stroke={c.fur} strokeWidth="7.6" strokeLinecap="round" />
            {c.stripe && <path ref={set('tailStripe')} fill="none" stroke={c.stripe} strokeWidth="7.6" strokeDasharray="3 7" opacity=".6" />}
            {/* head */}
            <g ref={set('head')}>
              <g ref={set('earFar')}>
                <path d="M-1 -24 L2 -49 C2.5 -51 4.5 -51.5 6 -50 L18 -34 Z" fill={`url(#${grad})`} {...S} />
                <path d="M3 -31 L4.5 -44 L12 -35" fill={c.innerEar} opacity=".85" />
              </g>
              <g ref={set('earNear')}>
                <path d="M24 -36 L38 -51 C39.5 -52.5 41.5 -52 41.5 -50 L42 -24 Z" fill={`url(#${grad})`} {...S} />
                <path d="M29 -35 L38.5 -45.5 L38.5 -31" fill={c.innerEar} opacity=".85" />
              </g>
              <path
                className="cat-hit"
                d="M-6 -6 C-8 -24 6 -37 20 -37 C35 -37 46 -25 45 -9 C44 4 33 11 19 11 C5 11 -4 5 -6 -6 Z"
                fill={`url(#${grad})`}
                {...S}
                strokeWidth={1.8}
              />
              {coat === 'tuxedo' && (
                <path d="M21 -26 C17 -18 14 -12 13 -6 C13 3 18 8 22 8 C27 8 32 3 31 -6 C30 -12 26 -18 21 -26 Z" fill={c.chest} />
              )}
              {c.stripe && (
                <path d="M20 -35 L20 -27 M13 -33 L15 -26 M27 -33 L25 -26" stroke={c.stripe} strokeWidth="2" strokeLinecap="round" opacity=".75" />
              )}
              <ellipse cx="6" cy="-3" rx="5.5" ry="2.6" fill="#c88f9d" opacity=".3" />
              <ellipse cx="37" cy="-3" rx="5.5" ry="2.6" fill="#c88f9d" opacity=".3" />
              {/* eyes */}
              {[0, 1].map((i) => (
                <g key={i} ref={set(`eye${i}`)}>
                  <path d="M-5.2 0 Q0 -5.4 5.2 0 Q0 4.2 -5.2 0 Z" fill={c.iris} stroke={c.line} strokeWidth="1.3" />
                  <ellipse ref={set(`pupil${i}`)} cx="0" cy="0" rx="1.3" ry="3.4" fill="#1d1310" />
                  <circle cx="1.6" cy="-1.8" r="1" fill="#fff" />
                </g>
              ))}
              <g ref={set('eyesClosed')} stroke={c.line} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0">
                <path d="M7 -16 Q12 -12 17 -16 M24 -16 Q29 -12 34 -16" />
              </g>
              {/* nose and mouth */}
              <path d="M19.4 -8 L24.6 -8 L22 -5 Z" fill={c.nose} stroke={coat === 'tuxedo' ? '#794454' : c.line} strokeWidth=".8" strokeLinejoin="round" />
              <path ref={set('mouthClosed')} d="M22 -5 C22 -2.5 19.5 -1 17 -2 M22 -5 C22 -2.5 24.5 -1 27 -2" fill="none" stroke={c.line} strokeWidth="1.1" strokeLinecap="round" />
              <g ref={set('mouthOpen')} opacity="0">
                <ellipse cx="0" cy="2.5" rx="4.6" ry="6" fill="#5e2232" stroke={c.line} strokeWidth="1" />
                <ellipse cx="0" cy="5.6" rx="3" ry="2.4" fill="#d98a9a" />
                <path d="M-2.6 -1.5 L-2 0.6 M2.6 -1.5 L2 0.6" stroke="#fff" strokeWidth=".9" />
              </g>
              <g ref={set('tongue')} opacity="0">
                <path d="M-2.6 0 C-2.6 4 -1.6 6.5 0 6.5 C1.6 6.5 2.6 4 2.6 0 Z" fill="#e79aa8" stroke="#794454" strokeWidth=".6" />
              </g>
              {/* whiskers */}
              <g stroke={coat === 'tuxedo' ? '#efe6d6' : c.line} strokeWidth=".7" opacity=".75" strokeLinecap="round">
                <path d="M12 -4 L-12 -9 M12 -2 L-13 -1 M13 0 L-10 6 M32 -4 L56 -9 M32 -2 L57 -1 M31 0 L54 6" />
              </g>
              {/* ribbon collar */}
              <path d="M2 4 C10 12 30 12 39 4" fill="none" stroke={c.ribbon} strokeWidth="4.2" strokeLinecap="round" />
              <path d="M2 4 C10 12 30 12 39 4" fill="none" stroke={c.ribbonDark} strokeWidth=".7" opacity=".55" />
              <g transform="translate(21 11)">
                {c.bell ? (
                  <>
                    <circle cy="3" r="3.6" fill={c.bell} stroke="#6b5530" strokeWidth=".8" />
                    <path d="M-2 4 L2 4" stroke="#6b5530" strokeWidth=".8" />
                  </>
                ) : (
                  <>
                    <path d="M0 0 C-5 -7 -14 -6 -13 1 C-11 6 -4 4 0 0 Z" fill={c.ribbon} stroke={c.ribbonDark} strokeWidth=".9" />
                    <path d="M0 0 C5 -7 14 -6 13 1 C11 6 4 4 0 0 Z" fill={c.ribbon} stroke={c.ribbonDark} strokeWidth=".9" />
                    <path d="M-1 1 L-5 10 M1 1 L6 9" stroke={c.ribbon} strokeWidth="2.4" strokeLinecap="round" />
                    <circle r="2.2" fill="#f4dce1" stroke={c.ribbonDark} strokeWidth=".8" />
                  </>
                )}
              </g>
            </g>
          </g>
        </g>
      </svg>
    </button>
  );
});

export default CatCompanion;
export { POSES };
