import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { applyPose, type Pose, type RigParts } from '../cats/catRig';

export type Coat = 'tabby' | 'tuxedo';

const COATS = {
  tabby: {
    fur: '#f1e2c8', shade: '#d6bb92', deep: '#b8986c', line: '#4d342a', stripe: '#9a7556', paw: '#f6ebd7', chest: '#fbf3e4', muzzle: '#fbf4e8',
    ribbon: '#d49aa8', ribbonDark: '#8a4f60', ribbonLight: '#f2cfd7', irisIn: '#f3d28a', irisOut: '#b98a3c', innerEar: '#f0c9d1', nose: '#cf8d9c',
    whisker: '#5b4034', sheen: '#fffaf0', bell: null as string | null,
  },
  tuxedo: {
    fur: '#5a463d', shade: '#3f3029', deep: '#2f231e', line: '#22180f', stripe: null as string | null, paw: '#f7f0e3', chest: '#f8f1e4', muzzle: '#f8f1e4',
    ribbon: '#8a4a5c', ribbonDark: '#4d2531', ribbonLight: '#c4808f', irisIn: '#dfe39a', irisOut: '#8b9443', innerEar: '#d9a6b2', nose: '#d08e9d',
    whisker: '#f3ece0', sheen: '#8a7468', bell: '#d1ad5f',
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

/** short engraved fur strokes following a curve, for texture */
function furTicks(pts: [number, number, number][], len: number): string {
  // each entry: x, y, angle (deg) of the stroke
  return pts
    .map(([x, y, a]) => {
      const r = (a * Math.PI) / 180;
      return `M${x} ${y}l${(Math.cos(r) * len).toFixed(1)} ${(Math.sin(r) * len).toFixed(1)}`;
    })
    .join('');
}

const BACK_FUR = furTicks(
  [
    [66, 72, 120], [74, 68, 118], [82, 66, 115], [90, 64.5, 112], [98, 64, 110], [106, 64, 108], [114, 64.5, 106], [122, 65.5, 104], [130, 67, 100], [138, 69, 98],
    [56, 79, 140], [52, 86, 160], [50, 94, 175], [52, 102, 195], [58, 109, 220],
    [80, 113, 260], [92, 112, 265], [104, 112, 270], [116, 113, 275],
  ],
  4.2,
);
const CHEST_RUFF = 'M153 86 l4 2 l-3 2 l4 3 l-4 2 l4 3 l-4 2 l3 3 l-4 1';

/**
 * One articulated, finely drawn sepia cat (side view, facing right). The
 * parent director animates it through `apply(pose)`; the button gives
 * keyboard and screen-reader users the same "say hello" interaction as a tap.
 */
const CatCompanion = forwardRef<CatHandle, Props>(function CatCompanion({ coat, id, label, action, onTap }, ref) {
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
        tail: { shape: g.tailShape as SVGPathElement, fur: (g.tailFur as SVGPathElement) ?? null, rings: (g.tailRings as SVGPathElement) ?? null },
      };
      applyPose(parts, p);
    },
    svg: () => svgRef.current,
    headElement: () => (r.current.head as SVGGElement | undefined) ?? null,
  }));

  const S = { stroke: c.line, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const T = { stroke: c.line, strokeWidth: 0.7, strokeLinecap: 'round' as const, fill: 'none', opacity: coat === 'tuxedo' ? 0.55 : 0.42 };
  const fur = `url(#${id}-fur)`;
  // the tuxedo wears white socks — on her front legs they reach right up to the bib
  const legFill = (far: boolean, lower: boolean, front = false) => (far ? `url(#${id}-far)` : coat === 'tuxedo' && (lower || front) ? c.paw : fur);

  const paw = (far: boolean, front: boolean): ReactNode => (
    <g>
      <path
        d={front ? 'M-6.8 -1.5 C-8 4 -4.5 7 2 7 C8.5 7 11 4.4 9.6 0.6 C8.6 -2 6.2 -2.6 5 -2' : 'M-5.8 -1.5 C-7 4 -3.5 7 3 7 C9.5 7 11.5 4.4 10 0.6 C9 -2 6.5 -2.6 4.8 -2'}
        fill={far ? `url(#${id}-far)` : c.paw}
        {...S}
      />
      {!far && (
        <>
          <path d={front ? 'M1.8 2.6 L2.3 6.3 M5.4 2 L6 6.2' : 'M2.8 2.6 L3.3 6.3 M6.4 2 L7 6.2'} fill="none" {...S} strokeWidth={0.8} />
          <ellipse cx={front ? 4 : 5} cy="6.6" rx="3.2" ry="1" fill="#e6a3b1" opacity=".75" />
        </>
      )}
    </g>
  );

  const frontLeg = (k: 'fn' | 'ff', far: boolean): ReactNode => (
    <g ref={set(`${k}Top`)}>
      <g ref={set(`${k}Upper`)}>
        <path d="M-7 -7 L7 -7 L6.4 16.5 L-6.4 16.5 Z" fill={legFill(far, false, true)} />
        <path d="M-7 -2 C-7.4 6 -6.8 12 -6.4 16.5 M7 -2 C7.2 6 6.8 12 6.4 16.5" fill="none" {...S} />
        {!far && <path d="M5 2 l2 2 M5.4 7 l2 2 M5.4 12 l2 2" {...T} />}
      </g>
      <g ref={set(`${k}Lower`)}>
        <g ref={set(`${k}LowerShape`)}>
          <path d="M-6.4 -1 L6.4 -1 L5.8 16 L-5.8 16 Z" fill={legFill(far, true)} />
          <path d="M-6.4 0 L-5.8 16 M6.4 0 L5.8 16" fill="none" {...S} />
          {!far && <path d="M4.4 4 l2 1.6 M4.2 9 l2 1.6" {...T} />}
        </g>
        {paw(far, true)}
      </g>
    </g>
  );

  const hindLeg = (k: 'hn' | 'hf', far: boolean): ReactNode => (
    <g ref={set(`${k}Top`)}>
      <g ref={set(`${k}Upper`)}>
        <path d="M-16 -2 C-17 -15 -4 -21 6 -17 C17 -13 18 4 13 14 C9 22 -2 23 -8.5 17 C-14 12 -16 6 -16 -2 Z" fill={far ? `url(#${id}-far)` : fur} />
        <path d="M6 -17 C17 -13 18 4 13 14 C9 22 -2 23 -8.5 17" fill="none" {...S} />
        {!far && (
          <>
            <path d="M-6 -6 C0 -9 8 -6 11 2" {...T} strokeWidth={0.9} />
            {c.stripe && <path d="M-10 -8 C-4 -12 4 -12 8 -9 C2 -9 -4 -7 -10 -4 Z M-12 2 C-5 -2 4 -1 9 3 C3 2 -4 3 -11 6 Z" fill={c.stripe} opacity=".55" />}
          </>
        )}
      </g>
      <g ref={set(`${k}Lower`)}>
        <g ref={set(`${k}LowerShape`)}>
          <path d="M-5.4 -3 L5.4 -3 L4.8 16 L-4.8 16 Z" fill={legFill(far, true)} />
          <path d="M-5.4 0 L-4.8 16 M5.4 0 L4.8 16" fill="none" {...S} />
        </g>
        {paw(far, false)}
      </g>
    </g>
  );

  return (
    <button type="button" className={`cat cat-${coat}`} data-action={action} aria-label={label} onClick={onTap}>
      <svg ref={svgRef} viewBox="0 0 220 150" width="220" height="150" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-fur`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.shade} />
            <stop offset=".28" stopColor={c.fur} />
            <stop offset=".75" stopColor={c.fur} />
            <stop offset="1" stopColor={c.shade} />
          </linearGradient>
          <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.shade} />
            <stop offset="1" stopColor={c.deep} />
          </linearGradient>
          <radialGradient id={`${id}-belly`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor={c.chest} stopOpacity=".95" />
            <stop offset=".7" stopColor={c.chest} stopOpacity=".55" />
            <stop offset="1" stopColor={c.chest} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-iris`} cx=".45" cy=".42" r=".6">
            <stop offset="0" stopColor={c.irisIn} />
            <stop offset=".75" stopColor={c.irisIn} />
            <stop offset="1" stopColor={c.irisOut} />
          </radialGradient>
          <radialGradient id={`${id}-blush`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#d98a9c" stopOpacity=".55" />
            <stop offset="1" stopColor="#d98a9c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-shadow`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#392a24" stopOpacity=".34" />
            <stop offset="1" stopColor="#392a24" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-bell`} cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#fff3c6" />
            <stop offset=".45" stopColor={c.bell ?? '#d1ad5f'} />
            <stop offset="1" stopColor="#7a5a26" />
          </radialGradient>
        </defs>
        <g ref={set('root')}>
          <ellipse className="cat-shadow" cx="104" cy="142" rx="74" ry="7" fill={`url(#${id}-shadow)`} />
          <g ref={set('body')}>
            {hindLeg('hf', true)}
            {frontLeg('ff', true)}
            {/* body */}
            <path
              d="M62 75 C82 62 122 62 140 68 C153 73 160 87 157 101 C153 113 137 116 121 114 C103 112 86 116 70 114 C54 112 45 98 49 86 C51 80 56 76 62 75 Z"
              fill={fur}
              {...S}
              strokeWidth={1.7}
            />
            {coat !== 'tuxedo' && <ellipse cx="112" cy="104" rx="38" ry="10" fill={`url(#${id}-belly)`} />}
            {coat === 'tuxedo' && (
              <>
                <path d="M135 90 C142 84 153 87 156 98 C154 109 143 114 127 113 C122 105 127 95 135 90 Z" fill={c.chest} />
                <path d="M128 113 l3 -3 l2 3 l3 -3 l2 3 l3 -3 l2 3" fill="none" stroke={c.chest} strokeWidth="1.6" />
                <path d="M72 70 C90 64 116 63 134 67" fill="none" stroke={c.sheen} strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
              </>
            )}
            {c.stripe && (
              <g fill={c.stripe} opacity=".62">
                <path d="M76 67 C73 73 75 80 80 85 C78 79 78 73 80 66 Z" />
                <path d="M89 64.5 C86 71 88 79 94 84 C91 77 91 71 93 64 Z" />
                <path d="M103 63.5 C100 70 102 78 108 83 C105 76 105 70 107 63.5 Z" />
                <path d="M117 64 C114 70 116 78 122 82 C119 76 119 70 121 64.5 Z" />
                <path d="M130 66.5 C128 71 129 76 133 79 C131 75 131 71 134 67 Z" />
                <path d="M58 80 C62 84 63 90 60 96 C60 90 58 86 55 82 Z" />
              </g>
            )}
            <path d={BACK_FUR} {...T} />
            <path d="M136 72 C142 78 144 86 140 94" {...T} strokeWidth={0.9} />
            <path d={CHEST_RUFF} fill="none" stroke={coat === 'tuxedo' ? c.chest : c.line} strokeWidth=".9" opacity=".7" strokeLinejoin="round" />
            {hindLeg('hn', false)}
            {frontLeg('fn', false)}
            {/* tail: tapered and fluffy */}
            <path ref={set('tailShape')} fill={fur} {...S} strokeWidth={1.4} />
            {c.stripe && <path ref={set('tailRings')} fill="none" stroke={c.stripe} strokeWidth="3" strokeLinecap="round" opacity=".6" />}
            <path ref={set('tailFur')} {...T} opacity={0.55} />
            {/* head */}
            <g ref={set('head')}>
              <g ref={set('earFar')}>
                <path d="M-1 -23 L1.5 -49.5 C2 -51.5 4.5 -52 6 -50.5 L19 -34 Z" fill={`url(#${id}-far)`} {...S} />
                <path d="M3 -31 L4.5 -45 L13 -35" fill={c.innerEar} opacity=".7" />
              </g>
              <g ref={set('earNear')}>
                <path d="M23 -36 L38 -52 C39.5 -53.6 42 -53 42 -50.6 L43 -23 Z" fill={fur} {...S} />
                <path d="M28.5 -35 L38.5 -46.5 L38.8 -30" fill={c.innerEar} />
                <path d="M31 -33 l3 -5 M33.5 -31 l3.4 -5.4 M36 -30 l2.6 -6" stroke={coat === 'tuxedo' ? '#f3ece0' : '#fffaf2'} strokeWidth=".7" strokeLinecap="round" opacity=".9" />
                <path d="M40.4 -52 l1 -3.4" stroke={c.line} strokeWidth=".9" strokeLinecap="round" />
              </g>
              {/* fluffy head with cheek ruff */}
              <path
                d="M-6 -7 C-8 -25 6 -38 20 -38 C35 -38 47 -26 45.5 -11 L48 -7 L44 -4.5 L46.5 0 L41 1.5 L42 6 L36 6 L33.5 10 L27 9 L22 12 L17 9.6 L11 11 L8.5 7 L2 7.5 L2.5 3 L-3.5 2 L-1.5 -2 Z"
                fill={fur}
                {...S}
                strokeWidth={1.7}
              />
              <path d="M2 -24 C6 -30 12 -33 18 -34" fill="none" stroke={c.sheen} strokeWidth="1.6" strokeLinecap="round" opacity={coat === 'tuxedo' ? 0.6 : 0.8} />
              {coat === 'tuxedo' && (
                <path d="M21 -28 C17 -19 13 -13 11.5 -6 C11 4 16 9 21.5 9 C27 9 32.5 4 32 -6 C31 -13 26 -19 21 -28 Z" fill={c.chest} />
              )}
              {c.stripe && (
                <g fill="none" stroke={c.stripe} strokeLinecap="round" strokeLinejoin="round" opacity=".8">
                  <path d="M13 -30 L15 -33.5 L17.6 -31 L20.5 -35.5 L23.4 -31 L26 -33.5 L28 -30" strokeWidth="1.2" opacity=".7" />
                  <path d="M-3 -16 C0 -14 3 -14 5 -15 M-4 -11 C-1 -9 2 -9 4 -10 M44 -16 C41.5 -14.5 39 -14.5 37 -15.5" strokeWidth="1.5" />
                </g>
              )}
              <path d="M-1 -12 l-3 -1 M0 -7 l-3.5 0 M44 -12 l3 -1.4" {...T} />
              {/* blush */}
              <ellipse cx="6" cy="-4" rx="7" ry="4" fill={`url(#${id}-blush)`} />
              <ellipse cx="38" cy="-4" rx="7" ry="4" fill={`url(#${id}-blush)`} />
              {/* muzzle */}
              <ellipse cx="18.5" cy="-3.4" rx="4.6" ry="3.4" fill={c.muzzle} stroke={c.line} strokeWidth=".6" strokeOpacity=".5" />
              <ellipse cx="25.5" cy="-3.4" rx="4.6" ry="3.4" fill={c.muzzle} stroke={c.line} strokeWidth=".6" strokeOpacity=".5" />
              <g fill={c.line} opacity=".45">
                <circle cx="16" cy="-4" r=".45" /><circle cx="17.6" cy="-2.6" r=".45" /><circle cx="15.8" cy="-2" r=".45" />
                <circle cx="28" cy="-4" r=".45" /><circle cx="26.4" cy="-2.6" r=".45" /><circle cx="28.2" cy="-2" r=".45" />
              </g>
              {/* eyes */}
              {[0, 1].map((i) => (
                <g key={i} ref={set(`eye${i}`)}>
                  <path d="M-6.4 0 C-5.4 -6 5.4 -6 6.4 0 C5.4 5 -5.4 5 -6.4 0 Z" fill={`url(#${id}-iris)`} />
                  <ellipse ref={set(`pupil${i}`)} cx="0" cy="0.2" rx="1.5" ry="4.2" fill="#160d0a" />
                  <circle cx="2.1" cy="-2.1" r="1.5" fill="#fff" />
                  <circle cx="-2" cy="1.8" r=".65" fill="#fff" opacity=".85" />
                  <path d="M-6.4 0 C-5.4 -6 5.4 -6 6.4 0 C5.4 5 -5.4 5 -6.4 0 Z" fill="none" stroke={c.line} strokeWidth="1" />
                  <path d={i === 0 ? 'M6.4 0 C5.4 -6 -5.4 -6 -6.4 0 L-7.8 -1.6' : 'M-6.4 0 C-5.4 -6 5.4 -6 6.4 0 L7.8 -1.6'} fill="none" stroke={c.line} strokeWidth="1.45" strokeLinecap="round" />
                </g>
              ))}
              <g ref={set('eyesClosed')} stroke={c.line} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0">
                <path d="M6.2 -16 Q12 -11.6 18 -16.4 M23 -16.4 Q29 -11.6 35 -16" />
                <path d="M18 -16.4 l1.4 -1.4 M35 -16 l1.4 -1.4" strokeWidth="1.2" />
              </g>
              {/* brow whiskers */}
              <path d="M10 -24 C8 -28 6 -30 3 -31 M14 -25 C13 -29 12 -31 10 -33 M28 -25 C29 -29 31 -31 33 -32" stroke={c.whisker} strokeWidth=".55" fill="none" strokeLinecap="round" opacity=".8" />
              {/* nose and mouth */}
              <path d="M19 -8.4 C19 -9.6 25 -9.6 25 -8.4 C25 -7 23 -5.4 22 -5 C21 -5.4 19 -7 19 -8.4 Z" fill={c.nose} stroke={coat === 'tuxedo' ? '#8a4f60' : c.line} strokeWidth=".8" />
              <path d="M20.6 -8.6 C21.4 -9 22.6 -9 23.2 -8.7" stroke="#fff" strokeWidth=".6" opacity=".8" fill="none" strokeLinecap="round" />
              <path ref={set('mouthClosed')} d="M22 -5 L22 -3.2 C22 -1 19.5 0 17 -1.2 M22 -3.2 C22 -1 24.5 0 27 -1.2" fill="none" stroke={c.line} strokeWidth="1.05" strokeLinecap="round" />
              <g ref={set('mouthOpen')} opacity="0">
                <ellipse cx="0" cy="2.5" rx="4.8" ry="6.2" fill="#5e2232" stroke={c.line} strokeWidth="1" />
                <ellipse cx="0" cy="5.8" rx="3.1" ry="2.5" fill="#e0909f" />
                <path d="M-2.8 -1.6 L-2.1 0.8 M2.8 -1.6 L2.1 0.8" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
              </g>
              <g ref={set('tongue')} opacity="0">
                <path d="M-2.8 0 C-2.8 4.2 -1.7 6.8 0 6.8 C1.7 6.8 2.8 4.2 2.8 0 Z" fill="#ea9fad" stroke="#8a4f60" strokeWidth=".6" />
                <path d="M0 1 L0 5" stroke="#c97a8a" strokeWidth=".5" />
              </g>
              {/* whiskers */}
              <g stroke={c.whisker} strokeWidth=".6" fill="none" strokeLinecap="round" opacity=".85">
                <path d="M14 -4 Q2 -8 -14 -8 M14 -2.4 Q0 -2 -15 1 M14.5 -0.8 Q2 3 -11 9" />
                <path d="M30 -4 Q42 -8 58 -8 M30 -2.4 Q44 -2 59 1 M29.5 -0.8 Q42 3 55 9" />
              </g>
              {/* ribbon collar with folds */}
              <path d="M1 3.5 C10 12.5 31 12.5 40 3.5" fill="none" stroke={c.ribbon} strokeWidth="4.6" strokeLinecap="round" />
              <path d="M2 2.6 C11 10.6 30 10.6 39 2.6" fill="none" stroke={c.ribbonLight} strokeWidth="1" strokeLinecap="round" opacity=".8" />
              <path d="M1 3.5 C10 12.5 31 12.5 40 3.5" fill="none" stroke={c.ribbonDark} strokeWidth=".7" opacity=".55" />
              <g transform="translate(21 11.4)">
                {c.bell ? (
                  <>
                    <path d="M-1.4 -1 L1.4 -1 L1 1.4 L-1 1.4 Z" fill={c.ribbonDark} />
                    <circle cy="4.4" r="4.2" fill={`url(#${id}-bell)`} stroke="#6b5530" strokeWidth=".8" />
                    <path d="M-2.4 5.6 L2.4 5.6" stroke="#5a4520" strokeWidth=".9" strokeLinecap="round" />
                    <circle cx="0" cy="6.8" r=".8" fill="#5a4520" />
                  </>
                ) : (
                  <>
                    <path d="M0 0 C-5 -8 -15 -7 -14 1 C-12 7 -4 4 0 0 Z" fill={c.ribbon} stroke={c.ribbonDark} strokeWidth=".9" />
                    <path d="M0 0 C5 -8 15 -7 14 1 C12 7 4 4 0 0 Z" fill={c.ribbon} stroke={c.ribbonDark} strokeWidth=".9" />
                    <path d="M-3 -1.5 C-6 -4 -10 -4 -11 -1 M3 -1.5 C6 -4 10 -4 11 -1" fill="none" stroke={c.ribbonLight} strokeWidth=".9" strokeLinecap="round" />
                    <path d="M-1 1 L-5.4 10.6 L-3.4 9.4 L-2.6 11.4 Z M1 1 L6.4 9.8 L4.2 9 L3.8 11 Z" fill={c.ribbon} stroke={c.ribbonDark} strokeWidth=".7" strokeLinejoin="round" />
                    <ellipse rx="2.6" ry="2.2" fill={c.ribbonLight} stroke={c.ribbonDark} strokeWidth=".8" />
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
