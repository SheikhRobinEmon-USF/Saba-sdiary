#!/usr/bin/env node
/**
 * Builds the handwriting assets from the single-line EMS Allure SVG font
 * (SIL OFL 1.1, see vendor/ems-allure/OFL.txt):
 *
 *  1. src/handwriting/glyphs.generated.json — pen strokes for every glyph,
 *     smoothed into cubic Béziers, in natural writing direction, in em units
 *     (y grows downward, origin at the pen position on the baseline).
 *  2. src/assets/fonts/scribe-hand.otf — a companion OpenType font whose
 *     advance widths are identical to the stroke data and whose outlines are
 *     the same strokes swept by the same calligraphic nib. The editor uses it
 *     for layout (so the browser's own line breaking defines where ink goes),
 *     for IME provisional text, and for printing / PDF export.
 *
 * Run with `npm run gen:font`. Output is committed, so the app build does not
 * depend on this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'vendor/ems-allure/EMSAllure.svg');
const OUT_JSON = path.join(root, 'src/handwriting/glyphs.generated.json');
const OUT_FONT = path.join(root, 'src/assets/fonts/scribe-hand.woff2');

const UPM = 1000;
const ASCENDER = 800;
const DESCENDER = 200;
/** Pen model (em units). Shared with the runtime renderer via the JSON. */
const PEN = {
  width: 0.026, // round pen diameter
  nibHalf: 0.021, // half-length of the broad-edge nib
  nibAngleDeg: 25, // nib edge angle above horizontal (screen space)
};

// ---------------------------------------------------------------- parsing
const unescapeXml = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function parseSvgFont(src) {
  const glyphs = new Map();
  const re = /<glyph unicode="([^"]*)" glyph-name="([^"]*)" horiz-adv-x="([^"]*)"(?: d="([^"]*)")?/g;
  for (const m of src.matchAll(re)) {
    const ch = unescapeXml(m[1]);
    const adv = parseFloat(m[3]);
    const strokes = (m[4] || '')
      .split(/(?=M)/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
        return pts;
      })
      .filter((p) => p.length >= 2);
    glyphs.set(ch, { adv, strokes });
  }
  return glyphs;
}

// ------------------------------------------------------------- corrections
const key = (pts) => pts.map((p) => p.join(',')).join(' ');
function dedupe(strokes) {
  const seen = new Set();
  return strokes.filter((s) => {
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Plotter order → natural pen order. Verified visually on a contact sheet. */
function correct(ch, g) {
  let strokes = dedupe(g.strokes.map((s) => s.slice()));
  const base = ch.normalize('NFD')[0];
  if (base === 'a' && strokes[0]) strokes[0] = strokes[0].slice().reverse();
  if (ch === 'ç' || ch === 'Ç') {
    // cedilla is stored first; write the letter first, then the cedilla
    strokes = [...strokes.slice(1), strokes[0]];
  }
  // drop zero-length strokes
  strokes = strokes.filter((s) => s.some((p) => p[0] !== s[0][0] || p[1] !== s[0][1]));
  return { adv: g.adv, strokes };
}

// ------------------------------------------------------------ synthesis
const translate = (strokes, dx, dy) => strokes.map((s) => s.map(([x, y]) => [x + dx, y + dy]));
const bbox = (strokes) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

function synthesize(glyphs) {
  const get = (c) => glyphs.get(c);
  const out = new Map();
  // Curly single quotes (iOS/macOS "smart punctuation" produces these).
  const rdq = get('”').strokes[0];
  const ldq = get('“').strokes[0];
  out.set('’', { adv: 200, strokes: translate([rdq], -40, 0) });
  out.set('‘', { adv: 200, strokes: translate([ldq], -60, 0) });
  out.set('‚', { adv: 200, strokes: translate([rdq], -40, -560) });
  out.set('„', { adv: 366, strokes: translate(get('”').strokes, 0, -560) });
  // Ellipsis
  const dot = get('.').strokes[0];
  out.set('…', { adv: 600, strokes: [dot, ...translate([dot], 150, 0), ...translate([dot], 300, 0)] });
  // Bullet — a small inked loop
  const bullet = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    bullet.push([180 + Math.cos(a) * 45, 230 + Math.sin(a) * 45]);
  }
  out.set('•', { adv: 360, strokes: [bullet] });
  // Non-breaking space and other spaces share the space advance
  for (const sp of [' ', ' ', ' ', ' ', ' ']) out.set(sp, { adv: get(' ').adv, strokes: [] });
  // Hyphen variants
  out.set('‐', get('-'));
  out.set('‑', get('-'));
  out.set('−', get('-'));

  // Combining marks taken from existing composed glyphs, normalised so that
  // their own bbox centre sits at (0,0).
  const markFrom = (composed, base) => {
    const c = get(composed).strokes;
    const b = new Set(get(base).strokes.map(key));
    const marks = c.filter((s) => !b.has(key(s)));
    const bb = bbox(marks);
    return { strokes: translate(marks, -bb.cx, -bb.cy), h: bb.y1 - bb.y0 };
  };
  const acute = markFrom('é', 'e');
  const grave = markFrom('è', 'e');
  const circ = markFrom('ê', 'e');
  const tilde = markFrom('ñ', 'n');
  const diaer = markFrom('ë', 'e');
  const ring = markFrom('å', 'a');
  const caron = { strokes: circ.strokes.map((s) => s.map(([x, y]) => [x, -y])), h: circ.h };
  const dotAbove = (() => {
    const s = diaer.strokes[0];
    const bb = bbox([s]);
    return { strokes: translate([s], -bb.cx, -bb.cy), h: bb.y1 - bb.y0 };
  })();
  const macron = { strokes: [[[-75, 0], [75, 4]]], h: 4 };
  const doubleAcute = { strokes: [...translate(acute.strokes, -55, 0), ...translate(acute.strokes, 55, 0)], h: acute.h };
  const marks = { '́': acute, '̀': grave, '̂': circ, '̃': tilde, '̈': diaer,
    '̊': ring, '̌': caron, '̇': dotAbove, '̄': macron, '̋': doubleAcute };

  // Reference placement from é (lowercase) and É (uppercase): the mark's
  // centre relative to the base's top-centre.
  const placement = (composed, base, mark) => {
    const bb = bbox(get(base).strokes);
    const mk = bbox(get(composed).strokes.filter((s) => !new Set(get(base).strokes.map(key)).has(key(s))));
    void mark;
    return { dx: mk.cx - topCentre(get(base).strokes), dy: mk.cy - bb.y1 };
  };
  const topCentre = (strokes) => {
    const bb = bbox(strokes);
    const pts = strokes.flat().filter(([, y]) => y >= bb.y1 - (bb.y1 - bb.y0) * 0.25);
    return pts.reduce((a, [x]) => a + x, 0) / pts.length;
  };
  const lowerPlace = placement('é', 'e');
  const upperPlace = placement('É', 'E');

  const dotless = { adv: get('i').adv, strokes: [get('i').strokes[0]] };
  out.set('ı', dotless);

  const candidates = [];
  for (let cp = 0x100; cp <= 0x17f; cp++) candidates.push(String.fromCodePoint(cp));
  candidates.push(...'ǎǐǒǔẞẽỳỹ'.split(''));
  for (const ch of candidates) {
    if (glyphs.has(ch) || out.has(ch)) continue;
    const nfd = ch.normalize('NFD');
    if (nfd.length !== 2) continue;
    let base = nfd[0];
    const mark = marks[nfd[1]];
    if (!mark) continue;
    if (base === 'i' || base === 'j') base = base === 'i' ? 'ı' : 'j';
    const bg = out.get(base) || get(base);
    if (!bg) continue;
    const isUpper = base !== base.toLowerCase() || /[bdfhklt]/.test(base);
    const pl = isUpper ? upperPlace : lowerPlace;
    const bb = bbox(bg.strokes);
    const tc = topCentre(bg.strokes);
    const markStrokes = translate(mark.strokes, tc + pl.dx, bb.y1 + pl.dy);
    out.set(ch, { adv: bg.adv, strokes: [...bg.strokes, ...markStrokes] });
  }
  // Ł / ł — stroked bar
  out.set('ł', { adv: get('l').adv, strokes: [...get('l').strokes, [[40, 230], [230, 330]]] });
  out.set('Ł', { adv: get('L').adv, strokes: [...get('L').strokes, [[150, 260], [420, 400]]] });
  return out;
}

// --------------------------------------------------------- smoothing
/**
 * Centripetal Catmull–Rom through the polyline, keeping sharp corners (cusps
 * and retraces in the script) as corners. Returns a list of cubic segments.
 */
function smooth(pts) {
  const n = pts.length;
  if (n === 2) return [[pts[0], lerp(pts[0], pts[1], 1 / 3), lerp(pts[0], pts[1], 2 / 3), pts[1]]];
  const corner = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) {
    const a = sub(pts[i], pts[i - 1]);
    const b = sub(pts[i + 1], pts[i]);
    const la = len(a), lb = len(b);
    if (la < 1e-6 || lb < 1e-6) { corner[i] = true; continue; }
    const cos = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
    corner[i] = cos < Math.cos((72 * Math.PI) / 180);
  }
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const p0 = i === 0 || corner[i] ? reflect(p2, p1) : pts[i - 1];
    const p3 = i + 2 >= n || corner[i + 1] ? reflect(p1, p2) : pts[i + 2];
    const d01 = Math.pow(Math.max(len(sub(p1, p0)), 1e-6), 0.5);
    const d12 = Math.pow(Math.max(len(sub(p2, p1)), 1e-6), 0.5);
    const d23 = Math.pow(Math.max(len(sub(p3, p2)), 1e-6), 0.5);
    // tangents (Barry–Goldman form converted to Bézier)
    const m1 = scale(add(sub(scale(sub(p1, p0), 1 / d01), scale(sub(p2, p0), 1 / (d01 + d12))), scale(sub(p2, p1), 1 / d12)), d12);
    const m2 = scale(add(sub(scale(sub(p2, p1), 1 / d12), scale(sub(p3, p1), 1 / (d12 + d23))), scale(sub(p3, p2), 1 / d23)), d12);
    segs.push([p1, add(p1, scale(m1, 1 / 3)), sub(p2, scale(m2, 1 / 3)), p2]);
  }
  return segs;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const reflect = (p, about) => [2 * about[0] - p[0], 2 * about[1] - p[1]];
const bez = (s, t) => {
  const u = 1 - t;
  return [
    u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
    u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
  ];
};
function flatten(segs, steps = 8) {
  const out = [segs[0][0]];
  for (const s of segs) for (let i = 1; i <= steps; i++) out.push(bez(s, i / steps));
  return out;
}
const polyLen = (p) => p.slice(1).reduce((a, q, i) => a + len(sub(q, p[i])), 0);

// ------------------------------------------------------ outline building
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts.at(-1)];
  const ab = sub(b, a);
  const L = len(ab);
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ap = sub(pts[i], a);
    const d = L < 1e-9 ? len(ap) : Math.abs(ab[0] * ap[1] - ab[1] * ap[0]) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
}
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1)); // counter-clockwise (y up)
}

/** Sweep the nib (a short segment plus a round pen) along the polyline. */
function nibOutline(poly) {
  const r = (PEN.width / 2) * UPM;
  const a = (PEN.nibAngleDeg * Math.PI) / 180;
  const n = [Math.cos(a) * PEN.nibHalf * UPM, Math.sin(a) * PEN.nibHalf * UPM]; // y-up font space
  const disk = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    disk.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  const shapeAt = (p) => {
    const pts = [];
    for (const s of [-1, 1]) for (const d of disk) pts.push([p[0] + s * n[0] + d[0], p[1] + s * n[1] + d[1]]);
    return pts;
  };
  const contours = [];
  const simplified = rdp(poly, 2.5);
  for (let i = 0; i < simplified.length - 1; i++) {
    contours.push(convexHull([...shapeAt(simplified[i]), ...shapeAt(simplified[i + 1])]));
  }
  return contours;
}

/**
 * The font's dots (i, j, period, diaeresis…) are 2-point ticks that read as
 * specks at body sizes. Turn very short strokes into a tiny closed loop so
 * they look like a nib pressed into the paper.
 */
function plumpDot(pts) {
  const L = polyLen(pts);
  if (pts.length > 3 || L > 70) return pts;
  const a = pts[0], b = pts.at(-1);
  const d = sub(b, a);
  const n = len(d) || 1;
  const nx = -d[1] / n, ny = d[0] / n;
  const w = 11;
  const mid = lerp(a, b, 0.5);
  return [a, [mid[0] + nx * w, mid[1] + ny * w], b, [mid[0] - nx * w * 0.8, mid[1] - ny * w * 0.8], lerp(a, b, 0.15)];
}

// ------------------------------------------------------------------ main
const src = fs.readFileSync(SRC, 'utf8');
const raw = parseSvgFont(src);
const corrected = new Map([...raw].map(([ch, g]) => [ch, correct(ch, g)]));
for (const [ch, g] of synthesize(corrected)) corrected.set(ch, g);

const round = (v) => Math.round(v * 1000) / 1000;
const toEm = ([x, y]) => [Math.round(x), Math.round(-y)]; // font units, y down
const fmt = (p) => `${p[0]} ${p[1]}`;

const json = {
  source: 'EMS Allure (SIL OFL 1.1) — single-line derivative of Allura; strokes re-ordered and smoothed for Saba\'s Personal Diary',
  unitsPerEm: UPM,
  ascender: ASCENDER / UPM,
  descender: DESCENDER / UPM,
  pen: PEN,
  glyphs: {},
};

const otGlyphs = [
  new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 378, path: new opentype.Path() }),
];
const usedNames = new Set(['.notdef']);

const chars = [...corrected.keys()].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
for (const ch of chars) {
  const g = corrected.get(ch);
  const strokesOut = [];
  const otPath = new opentype.Path();
  for (const raw of g.strokes) {
    const pts = plumpDot(raw);
    const segs = smooth(pts);
    const emSegs = segs.map((s) => s.map(toEm));
    const d = `M${fmt(emSegs[0][0])}` + emSegs.map((s) => `C${fmt(s[1])} ${fmt(s[2])} ${fmt(s[3])}`).join('');
    const flat = flatten(segs);
    strokesOut.push({ d, l: Math.round(polyLen(flat)) });
    for (const contour of nibOutline(flat)) {
      contour.forEach(([x, y], i) => (i === 0 ? otPath.moveTo(Math.round(x), Math.round(y)) : otPath.lineTo(Math.round(x), Math.round(y))));
      otPath.close();
    }
  }
  json.glyphs[ch] = { w: Math.round(g.adv), s: strokesOut };
  if (ch === '\n' || ch === '\t') continue;
  let name = `uni${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  otGlyphs.push(new opentype.Glyph({ name, unicode: ch.codePointAt(0), advanceWidth: Math.round(g.adv), path: otPath }));
}

const font = new opentype.Font({
  familyName: 'Scribe Hand',
  styleName: 'Regular',
  unitsPerEm: UPM,
  ascender: ASCENDER,
  descender: -DESCENDER,
  designer: 'Sheldon B. Michaels (EMS Allure), after Rob Leuschke (Allura)',
  manufacturer: "Saba's Personal Diary",
  license: 'SIL Open Font License 1.1',
  licenseURL: 'https://openfontlicense.org',
  copyright: 'Copyright 2010 The Allura Project Authors; single-line EMS Allure by Sheldon B. Michaels',
  version: '1.000',
  glyphs: otGlyphs,
});
// Make every platform use the same vertical metrics, so the browser's line
// box and our baseline formula agree everywhere.
font.tables.os2 = Object.assign(font.tables.os2 || {}, {
  sTypoAscender: ASCENDER,
  sTypoDescender: -DESCENDER,
  sTypoLineGap: 0,
  usWinAscent: ASCENDER,
  usWinDescent: DESCENDER,
  fsSelection: 0x40 | 0x80, // REGULAR | USE_TYPO_METRICS
});
font.tables.hhea = Object.assign(font.tables.hhea || {}, { ascender: ASCENDER, descender: -DESCENDER, lineGap: 0 });

fs.mkdirSync(path.dirname(OUT_FONT), { recursive: true });
const otf = Buffer.from(font.toArrayBuffer());
fs.writeFileSync(OUT_FONT, Buffer.from(await wawoff2.compress(otf)));
fs.writeFileSync(OUT_JSON, JSON.stringify(json));
console.log(`glyphs: ${Object.keys(json.glyphs).length}; json ${(fs.statSync(OUT_JSON).size / 1024).toFixed(0)} KB; font ${(fs.statSync(OUT_FONT).size / 1024).toFixed(0)} KB`);
