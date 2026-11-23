import type { Pose, PoseName } from './catRig';

/** Key poses of each action, as overrides on top of a base posture. */
export const GALLERY: Record<string, { base: PoseName; pose: Partial<Pose> }> = {
  groomLick: { base: 'sit', pose: { fnS: -122, fnE: -108, headRot: 44, headX: -6, headY: 8, tongue: 1, eye: 0.3 } },
  washFace: { base: 'sit', pose: { fnS: -150, fnE: -100, headRot: 12, earNear: -14, eye: 0.15 } },
  knead: { base: 'sphinx', pose: { fnS: -58, fnE: 34, eye: 0.35 } },
  yawn: { base: 'sit', pose: { headRot: -4, mouth: 1, eye: 0.08, earFar: -14, earNear: 14 } },
  bow: {
    base: 'stand',
    pose: { bodyRot: 14, bodyY: 12, fnS: -78, fnE: 4, fnL: 1.1, ffS: -74, ffE: 4, ffL: 1.1, hnH: -14, hfH: -8, headRot: -16, tail0: -96, eye: 0.15, mouth: 0.6 },
  },
  hindStretch: { base: 'stand', pose: { bodyRot: -4, hnH: 52, hnK: -26, headRot: -4 } },
  walkA: { base: 'stand', pose: { fnS: 22, fnE: 0, ffS: -18, ffE: 28, hnH: -20, hnK: 16, hfH: 18, hfK: 30 } },
  bat: { base: 'sit', pose: { fnS: -78, fnE: -30, headRot: 16, pupilW: 2.4 } },
  nuzzle: { base: 'stand', pose: { headRot: -14, headX: 6, eye: 0.15 } },
  tilt: { base: 'sit', pose: { headRot: 10, earNear: 12 } },
  slowBlink: { base: 'loaf', pose: { eye: 0.1 } },
};
