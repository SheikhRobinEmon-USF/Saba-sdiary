/**
 * A small 2-D puppet rig for the side-view cats. The artwork (see
 * CatCompanion.tsx) is split into parts nested at their joints; a Pose is a
 * flat set of numbers, so poses can be blended and keyframed cheaply and
 * applied straight to SVG attributes without React re-renders.
 *
 * Geometry is in SVG user units of a 220 × 150 box. The cat faces right,
 * stands on the ground line y = 140, and the hip pivot is (70, 100).
 */

export interface Pose {
  /** whole-cat offset (walking, hops) */
  x: number;
  y: number;
  bodyRot: number;
  bodyY: number;
  bodySX: number;
  headRot: number;
  headX: number;
  headY: number;
  earFar: number;
  earNear: number;
  /** 0 = closed … 1 = open */
  eye: number;
  pupilX: number;
  pupilY: number;
  /** pupil width: 1 = slit, 2.2 = round and soft */
  pupilW: number;
  mouth: number;
  tongue: number;
  /** front near / far leg: shoulder, elbow, length scale */
  fnS: number;
  fnE: number;
  fnL: number;
  ffS: number;
  ffE: number;
  ffL: number;
  /** hind near / far leg: hip, knee */
  hnH: number;
  hnK: number;
  hfH: number;
  hfK: number;
  /** tail: base direction (deg, 0 = right, -90 = up), curl per segment, wave */
  tail0: number;
  tailCurl: number;
  tailWave: number;
  tailPhase: number;
}

export type PoseKey = keyof Pose;
export const POSE_KEYS: PoseKey[] = [
  'x', 'y', 'bodyRot', 'bodyY', 'bodySX', 'headRot', 'headX', 'headY', 'earFar', 'earNear', 'eye', 'pupilX', 'pupilY', 'pupilW',
  'mouth', 'tongue', 'fnS', 'fnE', 'fnL', 'ffS', 'ffE', 'ffL', 'hnH', 'hnK', 'hfH', 'hfK', 'tail0', 'tailCurl', 'tailWave', 'tailPhase',
];

export const HIP = { x: 70, y: 100 };
export const NECK = { x: 142, y: 80 };
export const FRONT_NEAR = { x: 136, y: 100 };
export const FRONT_FAR = { x: 126, y: 98 };
export const HIND_NEAR = { x: 74, y: 98 };
export const HIND_FAR = { x: 66, y: 96 };
export const TAIL_BASE = { x: 52, y: 86 };
export const UPPER = 16;
export const LOWER = 16;
export const TAIL_SEGMENTS = 9;
export const TAIL_SEG_LEN = 8.5;

const base: Pose = {
  x: 0, y: 0, bodyRot: 0, bodyY: 0, bodySX: 1, headRot: 0, headX: 0, headY: 0, earFar: 0, earNear: 0,
  eye: 1, pupilX: 0, pupilY: 0, pupilW: 1.4, mouth: 0, tongue: 0,
  fnS: 4, fnE: -4, fnL: 1, ffS: -5, ffE: 3, ffL: 1, hnH: -4, hnK: 10, hfH: 6, hfK: 4,
  tail0: -118, tailCurl: 9, tailWave: 0, tailPhase: 0,
};

const loaf: Pose = {
  ...base, bodyY: 25, headY: 3, headRot: 4,
  fnS: -82, fnE: 0, fnL: 0.62, ffS: -80, ffE: 0, ffL: 0.58,
  hnH: -78, hnK: 50, hfH: -74, hfK: 50,
  tail0: 150, tailCurl: -30, pupilW: 1.8,
};

export const POSES = {
  stand: base,
  sit: {
    ...base, bodyRot: -30, bodyY: 14, headRot: 26, headX: -2,
    fnS: 30, fnE: 0, fnL: 1.42, ffS: 32, ffE: -2, ffL: 1.4,
    hnH: -62, hnK: 108, hfH: -58, hfK: 104,
    tail0: 112, tailCurl: -15, pupilW: 1.5,
  } as Pose,
  loaf,
  sphinx: { ...loaf, fnL: 1, ffL: 0.95, fnS: -84, ffS: -82, headRot: -4, headY: -2 } as Pose,
  sleep: {
    ...loaf, headRot: 26, headY: 13, headX: -4, eye: 0, earFar: -10, earNear: 10,
    tail0: 156, tailCurl: -29, pupilW: 2,
  } as Pose,
  crouch: { ...base, bodyY: 10, bodyRot: 5, fnS: -18, fnE: 20, fnL: 0.85, ffS: -14, ffE: 18, ffL: 0.85, hnH: -26, hnK: 44, hfH: -22, hfK: 40, headRot: -6, tail0: 158, tailCurl: -10, pupilW: 2.4 } as Pose,
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

export function blend(a: Pose, b: Partial<Pose>, t: number): Pose {
  const out = { ...a };
  for (const k of POSE_KEYS) {
    const v = b[k];
    if (v !== undefined) out[k] = a[k] + (v - a[k]) * t;
  }
  return out;
}

/** Tail centre-line points in body coordinates. */
export function tailPoints(p: Pose): [number, number][] {
  const pts: [number, number][] = [[TAIL_BASE.x, TAIL_BASE.y]];
  let a = p.tail0;
  let x = TAIL_BASE.x;
  let y = TAIL_BASE.y;
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    a += (i === 0 ? 0 : p.tailCurl) + p.tailWave * Math.sin(p.tailPhase + i * 0.75) * (i / TAIL_SEGMENTS);
    const r = (a * Math.PI) / 180;
    x += Math.cos(r) * TAIL_SEG_LEN;
    y += Math.sin(r) * TAIL_SEG_LEN;
    pts.push([x, y]);
  }
  return pts;
}

export function smoothPath(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export interface RigParts {
  root: SVGGElement;
  body: SVGGElement;
  head: SVGGElement;
  earFar: SVGGElement;
  earNear: SVGGElement;
  eyes: SVGGElement[];
  pupils: SVGElement[];
  eyesClosed: SVGGElement;
  mouthOpen: SVGGElement;
  mouthClosed: SVGElement;
  tongue: SVGGElement;
  legs: Record<'fn' | 'ff' | 'hn' | 'hf', { top: SVGGElement; upper: SVGElement; lower: SVGGElement; lowerShape: SVGElement }>;
  tail: SVGPathElement[];
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Write a pose into the rig's SVG attributes. */
export function applyPose(parts: RigParts, p: Pose): void {
  parts.root.setAttribute('transform', `translate(${f(p.x)} ${f(p.y)})`);
  parts.body.setAttribute(
    'transform',
    `translate(0 ${f(p.bodyY)}) rotate(${f(p.bodyRot)} ${HIP.x} ${HIP.y}) translate(${HIP.x} ${HIP.y}) scale(${f(p.bodySX)} 1) translate(${-HIP.x} ${-HIP.y})`,
  );
  parts.head.setAttribute('transform', `translate(${f(NECK.x + p.headX)} ${f(NECK.y + p.headY)}) rotate(${f(p.headRot)})`);
  parts.earFar.setAttribute('transform', `rotate(${f(p.earFar)} 8 -30)`);
  parts.earNear.setAttribute('transform', `rotate(${f(p.earNear)} 33 -30)`);
  const eye = Math.max(0.04, Math.min(1, p.eye));
  parts.eyes.forEach((e, i) => e.setAttribute('transform', `translate(${i === 0 ? 12 : 29} -16) scale(1 ${f(eye)})`));
  parts.pupils.forEach((pu) => pu.setAttribute('transform', `translate(${f(p.pupilX * 1.6)} ${f(p.pupilY * 1.2)}) scale(${f(p.pupilW)} 1)`));
  const shut = Math.max(0, Math.min(1, (0.3 - p.eye) / 0.25));
  parts.eyesClosed.setAttribute('opacity', f(shut));
  parts.eyes.forEach((e) => e.setAttribute('opacity', f(1 - shut)));
  const m = Math.max(0, Math.min(1, p.mouth));
  parts.mouthOpen.setAttribute('transform', `translate(22 -2) scale(1 ${f(Math.max(0.01, m))})`);
  parts.mouthOpen.setAttribute('opacity', m > 0.04 ? '1' : '0');
  parts.mouthClosed.setAttribute('opacity', m > 0.25 ? '0' : '1');
  const t = Math.max(0, Math.min(1, p.tongue));
  parts.tongue.setAttribute('transform', `translate(25 -1) rotate(20) scale(${f(0.2 + t * 0.8)})`);
  parts.tongue.setAttribute('opacity', t > 0.05 ? '1' : '0');

  const leg = (k: 'fn' | 'ff' | 'hn' | 'hf', px: number, py: number, s: number, e: number, l: number) => {
    const L = parts.legs[k];
    L.top.setAttribute('transform', `translate(${px} ${py}) rotate(${f(s)})`);
    L.upper.setAttribute('transform', `scale(1 ${f(l)})`);
    L.lower.setAttribute('transform', `translate(0 ${f(UPPER * l)}) rotate(${f(e)})`);
    L.lowerShape.setAttribute('transform', `scale(1 ${f(l)})`);
    const paw = L.lower.lastElementChild;
    paw?.setAttribute('transform', `translate(0 ${f(LOWER * l)})`);
  };
  leg('fn', FRONT_NEAR.x, FRONT_NEAR.y, p.fnS, p.fnE, p.fnL);
  leg('ff', FRONT_FAR.x, FRONT_FAR.y, p.ffS, p.ffE, p.ffL);
  leg('hn', HIND_NEAR.x, HIND_NEAR.y, p.hnH, p.hnK, 1);
  leg('hf', HIND_FAR.x, HIND_FAR.y, p.hfH, p.hfK, 1);

  const d = smoothPath(tailPoints(p));
  for (const path of parts.tail) path.setAttribute('d', d);
}
