export type InkName = 'sepia' | 'black' | 'rose';
export type MotionPref = 'auto' | 'animated' | 'instant';
export type CatMood = 'lively' | 'calm' | 'hidden';

export interface Preferences {
  ink: InkName;
  sound: boolean;
  motion: MotionPref;
  ambience: boolean;
  /** Music-box lullaby and the cats' occasional meows (only while sound is on). */
  music: boolean;
  cats: CatMood;
}

export const DEFAULT_PREFERENCES: Preferences = {
  ink: 'sepia',
  sound: false,
  motion: 'auto',
  ambience: true,
  music: true,
  cats: 'lively',
};

export const INKS: Record<InkName, { label: string; dry: string; wet: string }> = {
  sepia: { label: 'Sepia', dry: '#50372d', wet: '#2e1b12' },
  black: { label: 'Iron-gall black', dry: '#231c19', wet: '#0b0706' },
  rose: { label: 'Burgundy rose', dry: '#7a3a4e', wet: '#56182c' },
};

export const INK_NAMES = Object.keys(INKS) as InkName[];

export function sanitizePreferences(raw: unknown): Preferences {
  const p = { ...DEFAULT_PREFERENCES };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.ink === 'string' && (INK_NAMES as string[]).includes(r.ink)) p.ink = r.ink as InkName;
    if (typeof r.sound === 'boolean') p.sound = r.sound;
    if (r.motion === 'auto' || r.motion === 'animated' || r.motion === 'instant') p.motion = r.motion;
    if (typeof r.ambience === 'boolean') p.ambience = r.ambience;
    if (typeof r.music === 'boolean') p.music = r.music;
    if (r.cats === 'lively' || r.cats === 'calm' || r.cats === 'hidden') p.cats = r.cats;
  }
  return p;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function isInstant(p: Preferences): boolean {
  return p.motion === 'instant' || (p.motion === 'auto' && prefersReducedMotion());
}
