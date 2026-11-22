#!/usr/bin/env node
/**
 * Procedural "engraving" artwork for Saba's Personal Diary.
 *
 * Every asset is drawn from code with a seeded random generator, so the art is
 * original, reproducible and licence-clean. Style: fine sepia line work,
 * cross-hatching and soft watercolour washes, after the supplied reference.
 *
 *   node scripts/art/generate-art.mjs   → src/assets/art/*.svg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/assets/art');
fs.mkdirSync(OUT, { recursive: true });

// palette
const SEPIA = '#50372d';
const WALNUT = '#392a24';
const PARCH = '#f3e7d3';
const IVORY = '#e8d6b8';
const ROSE = '#c88f9d';
const BLUSH = '#f4dce1';
const BURG = '#794454';
const GOLD = '#b69a69';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => (Math.round(n * 10) / 10).toString();
const pts = (arr) => arr.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
const write = (name, svg) => {
  fs.writeFileSync(path.join(OUT, name), svg.replace(/\n\s+/g, '\n'));
  console.log(`${name}: ${(svg.length / 1024).toFixed(1)} KB`);
};

/** Smooth path through points (Catmull–Rom → cubic). */
function spline(points, closed = false) {
  const p = points;
  const n = p.length;
  if (n < 2) return '';
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  const get = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/** Parallel hatching lines clipped by the caller's clipPath. */
function hatch(x0, y0, x1, y1, spacing, angleDeg, r, jitter = 0.6) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
  let d = '';
  for (let s = -R; s <= R; s += spacing * (0.85 + r() * 0.3)) {
    const ox = cx - dy * s, oy = cy + dx * s;
    const j = (r() - 0.5) * jitter;
    d += `M${f(ox - dx * R + j)} ${f(oy - dy * R)}L${f(ox + dx * R)} ${f(oy + dy * R + j)}`;
  }
  return d;
}

const watercolorFilter = (id, seed, scale = 6, freq = 0.035) => `
  <filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.6"/>
  </filter>`;

// =====================================================================
// QUILL — tip at (TIP_X, TIP_Y) in the SVG's own pixel space.
// =====================================================================
function quill() {
  const r = rng(7);
  const L = 430; // tip → end of feather
  const lean = 33; // degrees, clockwise from vertical
  // Local frame: tip at origin, shaft towards -y.
  // the shaft curves gently, most strongly towards the tip of the feather
  const shaft = (t) => [-0.00042 * Math.max(0, t - 60) ** 2 + 0.0000004 * Math.max(0, t - 60) ** 3, -t];
  const parts = [];
  const vaneStart = 118, vaneEnd = L, downEnd = 160;
  const widthBroad = (t) => {
    const u = (t - vaneStart) / (vaneEnd - vaneStart);
    if (u < 0 || u > 1) return 0;
    return 78 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05) ** 0.75), 0.9) * (1 - 0.25 * u);
  };
  const widthNarrow = (t) => {
    const u = (t - vaneStart - 12) / (vaneEnd - vaneStart - 12);
    if (u < 0 || u > 1) return 0;
    return 38 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04) ** 0.8), 0.9);
  };
  // vane silhouettes
  const outline = (side, wf) => {
    const a = [];
    for (let t = vaneStart; t <= vaneEnd; t += 6) {
      const [sx, sy] = shaft(t);
      const w = wf(t) + (r() - 0.5) * 1.6;
      a.push([sx + side * w * 0.96, sy - w * 0.55]);
    }
    return a;
  };
  const broad = outline(1, widthBroad);
  const narrow = outline(-1, widthNarrow);
  const shaftPts = [];
  for (let t = vaneStart; t <= vaneEnd; t += 6) shaftPts.push(shaft(t));
  const vaneShape = (o) => spline([shaft(vaneStart), ...o, shaft(vaneEnd + 6)]) + 'L' + shaftPts.slice().reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';

  // washes
  parts.push(`<path d="${vaneShape(broad)}" fill="url(#qwash)" filter="url(#qwc)" opacity=".95"/>`);
  parts.push(`<path d="${vaneShape(narrow)}" fill="url(#qwash2)" filter="url(#qwc)" opacity=".9"/>`);

  // barbs
  const barbs = (side, wf, count, splits) => {
    let d = '', dLight = '';
    let shift = 0;
    for (let i = 0; i < count; i++) {
      const t = vaneStart + ((vaneEnd - vaneStart) * i) / count + r() * 1.5;
      const w = wf(t);
      if (w < 1.5) continue;
      const split = splits.find((s) => Math.abs(t - s.at) < s.w);
      shift = split ? split.dy : shift * 0.7;
      const [sx, sy] = shaft(t);
      const ang = 0.52 + r() * 0.05 + (t / L) * 0.12;
      const ex = sx + side * w;
      const ey = sy - w * ang - shift + (r() - 0.5) * 1.2;
      const mx = sx + side * w * 0.5;
      const my = sy - w * ang * 0.35 - shift * 0.5;
      const seg = `M${f(sx)} ${f(sy)}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`;
      if (r() < 0.62) d += seg;
      else dLight += seg;
    }
    return `<path d="${d}" stroke="${SEPIA}" stroke-width=".7" opacity=".78" fill="none"/><path d="${dLight}" stroke="${SEPIA}" stroke-width=".55" opacity=".45" fill="none"/>`;
  };
  parts.push(barbs(1, widthBroad, 270, [{ at: 210, w: 5, dy: 7 }, { at: 300, w: 4, dy: 6 }, { at: 360, w: 3, dy: 5 }]));
  parts.push(barbs(-1, widthNarrow, 210, [{ at: 250, w: 4, dy: 5 }, { at: 330, w: 3, dy: 4 }]));

  // darker hatching near the rachis on the broad side (engraved shading)
  let hd = '';
  for (let t = vaneStart + 10; t < vaneEnd - 10; t += 3.2) {
    const [sx, sy] = shaft(t);
    const w = widthBroad(t) * (0.28 + r() * 0.12);
    hd += `M${f(sx + 1.5)} ${f(sy)}L${f(sx + w)} ${f(sy - w * 0.5)}`;
  }
  parts.push(`<path d="${hd}" stroke="${WALNUT}" stroke-width=".8" opacity=".5" fill="none"/>`);
  // engraved tonal bands: a dark band along the broad vane's edge and a light
  // sheen beside the shaft
  let band = '';
  for (let t = vaneStart + 14; t < vaneEnd - 14; t += 2.6) {
    const [sx, sy] = shaft(t);
    const w = widthBroad(t);
    const a0 = 0.72 + r() * 0.08;
    band += `M${f(sx + w * a0)} ${f(sy - w * a0 * 0.55)}L${f(sx + w * 0.97)} ${f(sy - w * 0.55)}`;
  }
  parts.push(`<path d="${band}" stroke="${WALNUT}" stroke-width=".7" opacity=".42" fill="none"/>`);
  let sheen = '';
  for (let t = vaneStart + 20; t < vaneEnd - 30; t += 9) {
    const [sx, sy] = shaft(t);
    sheen += `M${f(sx - 2)} ${f(sy)}L${f(sx - widthNarrow(t) * 0.35)} ${f(sy - widthNarrow(t) * 0.25)}`;
  }
  parts.push(`<path d="${sheen}" stroke="#fffaf0" stroke-width="1.6" opacity=".55" fill="none"/>`);
  // vane edges
  parts.push(`<path d="${spline(broad)}" stroke="${SEPIA}" stroke-width=".8" fill="none" opacity=".7"/>`);
  parts.push(`<path d="${spline(narrow)}" stroke="${SEPIA}" stroke-width=".8" fill="none" opacity=".6"/>`);

  // downy afterfeather near the base
  let down = '';
  for (let i = 0; i < 70; i++) {
    const t = 92 + r() * (downEnd - 92);
    const [sx, sy] = shaft(t);
    const side = r() < 0.5 ? -1 : 1;
    const len = 14 + r() * 34;
    const p1 = [sx + side * len * 0.4, sy - len * (0.15 + r() * 0.3)];
    const p2 = [sx + side * len * (0.8 + r() * 0.3), sy - len * (0.2 + r() * 0.6) + (r() - 0.5) * 12];
    const p3 = [p2[0] + side * (r() * 8), p2[1] + (r() - 0.6) * 14];
    down += `M${f(sx)} ${f(sy)}C${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(p3[0])} ${f(p3[1])}`;
  }
  parts.push(`<path d="${down}" stroke="${SEPIA}" stroke-width=".55" opacity=".55" fill="none"/>`);

  // rachis (shaft) – tapered: draw as filled shape
  const rach = [];
  const rachBack = [];
  for (let t = 30; t <= L + 4; t += 5) {
    const [sx, sy] = shaft(t);
    const w = t < 100 ? 4.6 : Math.max(0.5, 4.6 - ((t - 100) / (L - 100)) * 4.1);
    rach.push([sx - w / 2, sy]);
    rachBack.push([sx + w / 2, sy]);
  }
  parts.push(`<path d="${spline(rach)}L${rachBack.slice().reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z" fill="#fbf4e6" stroke="${SEPIA}" stroke-width=".9"/>`);
  parts.push(`<path d="${spline(rachBack.slice(14))}" stroke="${WALNUT}" stroke-width=".9" opacity=".6" fill="none"/>`);

  // calamus (barrel) and nib
  const barrelTop = 100;
  const bw = 4.8;
  const nibCut = 30;
  const nibPath = `M0 0 C1.2 -8 ${f(bw * 0.9)} -${nibCut - 8} ${f(bw)} -${nibCut} L${f(bw)} -${barrelTop} L${f(-bw)} -${barrelTop} L${f(-bw)} -${nibCut + 6} C${f(-bw * 0.9)} -${nibCut - 6} -1.4 -9 0 0Z`;
  parts.push(`<path d="${nibPath}" fill="url(#barrel)" stroke="${WALNUT}" stroke-width=".9"/>`);
  // scoop of the cut
  parts.push(`<path d="M${f(-bw * 0.85)} -${nibCut + 4} C${f(-bw * 0.3)} -${nibCut - 8} ${f(bw * 0.2)} -${nibCut - 2} ${f(bw * 0.95)} -${nibCut}" stroke="${WALNUT}" stroke-width=".8" fill="none"/>`);
  // slit and ink stain
  parts.push(`<path d="M0 -1 L-.2 -13" stroke="${WALNUT}" stroke-width=".7"/>`);
  parts.push(`<path d="M0 0 C1 -6 2.6 -12 3.4 -17 L-2.6 -15 C-2 -10 -1 -5 0 0Z" fill="${WALNUT}" opacity=".85"/>`);
  // barrel shading
  let bh = '';
  for (let y = -nibCut - 2; y > -barrelTop + 2; y -= 2.4) bh += `M${f(bw * 0.25)} ${f(y)}L${f(bw * 0.95)} ${f(y - 1.2)}`;
  parts.push(`<path d="${bh}" stroke="${SEPIA}" stroke-width=".45" opacity=".55"/>`);
  parts.push(`<path d="M${f(-bw * 0.45)} -${nibCut + 8} L${f(-bw * 0.45)} -${barrelTop - 4}" stroke="#fff" stroke-width="1.1" opacity=".7"/>`);

  // rotate the local drawing so it leans right, then compute the viewBox
  const a = (lean * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const corners = [[-60, 6], [86, 6], [-60, -L - 20], [86, -L - 20]].map(rot);
  const minX = Math.min(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  const maxY = Math.max(...corners.map((c) => c[1]));
  const W = Math.ceil(maxX - minX), H = Math.ceil(maxY - minY);
  const tip = [-minX, -minY];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="qwash" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${IVORY}"/><stop offset=".55" stop-color="#f7eedd"/><stop offset="1" stop-color="#d9c3a0"/>
    </linearGradient>
    <linearGradient id="qwash2" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#e3cdaa"/><stop offset="1" stop-color="#f6ecda"/>
    </linearGradient>
    <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#ead9bb"/><stop offset="1" stop-color="#c7ad86"/>
    </linearGradient>
    ${watercolorFilter('qwc', 3, 3, 0.06)}
  </defs>
  <g transform="translate(${f(tip[0])} ${f(tip[1])}) rotate(${lean})" stroke-linecap="round" stroke-linejoin="round">
    ${parts.join('\n')}
  </g>
</svg>`;
  write('quill.svg', svg);
  return { W, H, tip };
}

// =====================================================================
// INKPOT — squat glass jar seen from slightly above.
// =====================================================================
function inkpot() {
  const r = rng(21);
  const W = 170, H = 170;
  const cx = 85;
  // geometry
  const bodyTop = 64, bodyBot = 150, bodyRx = 64;
  const neckRx = 30, rimY = 40, neckBot = 60;
  const body = `M${cx - bodyRx} ${bodyTop + 10} C${cx - bodyRx} ${bodyTop - 2} ${cx - neckRx - 10} ${neckBot} ${cx - neckRx} ${neckBot}
    L${cx + neckRx} ${neckBot} C${cx + neckRx + 10} ${neckBot} ${cx + bodyRx} ${bodyTop - 2} ${cx + bodyRx} ${bodyTop + 10}
    L${cx + bodyRx - 1} ${bodyBot - 10} C${cx + bodyRx - 2} ${bodyBot + 6} ${cx - bodyRx + 2} ${bodyBot + 6} ${cx - bodyRx + 1} ${bodyBot - 10}Z`;
  const neck = `M${cx - neckRx} ${rimY + 6} L${cx - neckRx} ${neckBot + 2} L${cx + neckRx} ${neckBot + 2} L${cx + neckRx} ${rimY + 6}Z`;
  let hatchR = hatch(cx + 10, bodyTop, cx + bodyRx, bodyBot + 4, 3.1, 62, r);
  let hatchX = hatch(cx + 30, bodyTop + 20, cx + bodyRx, bodyBot + 4, 3.4, -50, r);
  let hatchL = hatch(cx - bodyRx, bodyTop + 30, cx - 30, bodyBot, 3.6, 70, r);
  const back = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="ink" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4a3128"/><stop offset=".6" stop-color="#2a1a14"/><stop offset="1" stop-color="#140c09"/></radialGradient>
    <linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#d8c6a6" stop-opacity=".28"/><stop offset=".3" stop-color="#fff8ea" stop-opacity=".16"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#8d7356" stop-opacity=".3"/></linearGradient>
    <radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${WALNUT}" stop-opacity=".45"/><stop offset="1" stop-color="${WALNUT}" stop-opacity="0"/></radialGradient>
    <clipPath id="bodyClip"><path d="${body}"/></clipPath>
    <clipPath id="labelClip"><path d="M${cx - 44} ${bodyTop + 40} Q${cx} ${bodyTop + 47} ${cx + 44} ${bodyTop + 40} L${cx + 44} ${bodyTop + 72} Q${cx} ${bodyTop + 79} ${cx - 44} ${bodyTop + 72} Z"/></clipPath>
    ${watercolorFilter('iwc', 9, 4, 0.05)}
  </defs>
  <ellipse cx="${cx + 14}" cy="${bodyBot + 2}" rx="${bodyRx + 18}" ry="14" fill="url(#shadow)"/>
  <path d="${body}" fill="url(#ink)"/>
  <path d="${body}" fill="url(#glass)" filter="url(#iwc)"/>
  <g clip-path="url(#bodyClip)" stroke="${WALNUT}" fill="none" stroke-linecap="round">
    <path d="${hatchR}" stroke-width=".7" opacity=".55"/>
    <path d="${hatchX}" stroke-width=".6" opacity=".4"/>
    <path d="${hatchL}" stroke-width=".5" opacity=".25"/>
    <path d="M${cx - bodyRx + 10} ${bodyTop + 22} C${cx - bodyRx + 6} ${bodyTop + 50} ${cx - bodyRx + 8} ${bodyBot - 30} ${cx - bodyRx + 14} ${bodyBot - 10}" stroke="#fffaf0" stroke-width="5" opacity=".55"/>
    <path d="M${cx - bodyRx + 24} ${bodyTop + 18} C${cx - bodyRx + 21} ${bodyTop + 38} ${cx - bodyRx + 22} ${bodyTop + 56} ${cx - bodyRx + 25} ${bodyTop + 70}" stroke="#fffaf0" stroke-width="1.6" opacity=".55"/>
  </g>
  <path d="${body}" fill="none" stroke="${WALNUT}" stroke-width="1.4"/>
  <g>
    <path d="M${cx - 44} ${bodyTop + 40} Q${cx} ${bodyTop + 47} ${cx + 44} ${bodyTop + 40} L${cx + 44} ${bodyTop + 72} Q${cx} ${bodyTop + 79} ${cx - 44} ${bodyTop + 72} Z" fill="#efe2c8" stroke="${WALNUT}" stroke-width="1"/>
    <path d="M${cx - 40} ${bodyTop + 45} Q${cx} ${bodyTop + 51.5} ${cx + 40} ${bodyTop + 45} L${cx + 40} ${bodyTop + 68} Q${cx} ${bodyTop + 74.5} ${cx - 40} ${bodyTop + 68} Z" fill="none" stroke="${SEPIA}" stroke-width=".6" opacity=".7"/>
    <path d="M${cx} ${bodyTop + 66} C${cx - 9} ${bodyTop + 60} ${cx - 12} ${bodyTop + 55} ${cx - 8} ${bodyTop + 51.5} C${cx - 5} ${bodyTop + 49} ${cx - 1} ${bodyTop + 50.5} ${cx} ${bodyTop + 53} C${cx + 1} ${bodyTop + 50.5} ${cx + 5} ${bodyTop + 49} ${cx + 8} ${bodyTop + 51.5} C${cx + 12} ${bodyTop + 55} ${cx + 9} ${bodyTop + 60} ${cx} ${bodyTop + 66} Z" fill="${BURG}"/>
    <path d="M${cx - 34} ${bodyTop + 58} C${cx - 28} ${bodyTop + 53} ${cx - 22} ${bodyTop + 63} ${cx - 15} ${bodyTop + 58} M${cx + 34} ${bodyTop + 58} C${cx + 28} ${bodyTop + 53} ${cx + 22} ${bodyTop + 63} ${cx + 15} ${bodyTop + 58}" stroke="${SEPIA}" stroke-width=".9" fill="none"/>
    <path d="${hatch(cx + 18, bodyTop + 40, cx + 44, bodyTop + 76, 2.6, 75, r)}" stroke="${SEPIA}" stroke-width=".4" opacity=".35" clip-path="url(#labelClip)"/>
  </g>
  <path d="${neck}" fill="url(#ink)" stroke="${WALNUT}" stroke-width="1.2"/>
  <path d="${neck}" fill="url(#glass)"/>
  <ellipse cx="${cx}" cy="${rimY + 6}" rx="${neckRx + 4}" ry="9" fill="#eadbc0" stroke="${WALNUT}" stroke-width="1.3"/>
  <ellipse cx="${cx}" cy="${rimY + 6}" rx="${neckRx - 1}" ry="6.2" fill="#120a07"/>
  <ellipse cx="${cx - 6}" cy="${rimY + 4.5}" rx="${neckRx - 12}" ry="2.2" fill="#5b3c2f" opacity=".7"/>
  <path d="M${cx - neckRx + 2} ${rimY + 10} L${cx - neckRx + 2} ${neckBot}" stroke="#fffaf0" stroke-width="2" opacity=".5"/>
  <path d="M${cx + neckRx - 4} ${rimY + 12} L${cx + neckRx - 4} ${neckBot}" stroke="${WALNUT}" stroke-width="1" opacity=".5"/>
</svg>`;
  write('inkpot.svg', back);
  // Front: the near half of the rim and the neck, drawn above the
  // quill while it dips so the nib disappears into the ink.
  const front = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="ink" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4a3128"/><stop offset=".6" stop-color="#2a1a14"/><stop offset="1" stop-color="#140c09"/></radialGradient>
    <linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#d8c6a6" stop-opacity=".28"/><stop offset=".3" stop-color="#fff8ea" stop-opacity=".16"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#8d7356" stop-opacity=".3"/></linearGradient>
  </defs>
  <path d="M${cx - neckRx - 4} ${rimY + 6} A${neckRx + 4} 9 0 0 0 ${cx + neckRx + 4} ${rimY + 6} L${cx + neckRx} ${rimY + 10} L${cx + neckRx} ${neckBot + 2} L${cx - neckRx} ${neckBot + 2} L${cx - neckRx} ${rimY + 10}Z" fill="url(#ink)"/>
  <path d="M${cx - neckRx - 4} ${rimY + 6} A${neckRx + 4} 9 0 0 0 ${cx + neckRx + 4} ${rimY + 6} L${cx + neckRx} ${rimY + 10} L${cx + neckRx} ${neckBot + 2} L${cx - neckRx} ${neckBot + 2} L${cx - neckRx} ${rimY + 10}Z" fill="url(#glass)"/>
  <path d="M${cx - neckRx - 4} ${rimY + 6} A${neckRx + 4} 9 0 0 0 ${cx + neckRx + 4} ${rimY + 6}" fill="none" stroke="${WALNUT}" stroke-width="1.3"/>
  <path d="M${cx - neckRx - 4} ${rimY + 6} A${neckRx + 4} 9 0 0 0 ${cx + neckRx + 4} ${rimY + 6} A${neckRx - 1} 6.2 0 0 1 ${cx - neckRx - 4} ${rimY + 6}Z" fill="#eadbc0" stroke="${WALNUT}" stroke-width=".8"/>
</svg>`;
  write('inkpot-front.svg', front);
  return { mouth: [cx, rimY + 6], W, H };
}

// =====================================================================
// DESK & LIBRARY BACKDROP
// =====================================================================
function desk() {
  const r = rng(101);
  const W = 1600, H = 1000;
  const wallBottom = 190; // where the far edge of the desk meets the room
  const parts = [];
  // wood planks running horizontally with engraved grain
  const planks = [];
  for (let y = wallBottom + 26; y < H; y += 92 + r() * 30) planks.push(y);
  let grain = '', grainLight = '', seams = '', highlights = '';
  const tones = [];
  for (let i = 0; i < planks.length; i++) {
    const y0 = planks[i];
    const y1 = planks[i + 1] ?? H + 40;
    tones.push(`<rect x="0" y="${f(y0)}" width="${W}" height="${f(y1 - y0)}" fill="${i % 2 ? WALNUT : '#fff3dc'}" opacity="${f(i % 2 ? 0.05 + r() * 0.05 : 0.06 + r() * 0.06)}"/>`);
    highlights += `M0 ${f(y0 + 2.5)}L${W} ${f(y0 + 2.5)}`;
    seams += `M0 ${f(y0)}C400 ${f(y0 + (r() - 0.5) * 6)} 1200 ${f(y0 + (r() - 0.5) * 6)} ${W} ${f(y0 + (r() - 0.5) * 4)}`;
    // butt joints
    const jx = 200 + r() * 1200;
    seams += `M${f(jx)} ${f(y0)}L${f(jx + (r() - 0.5) * 3)} ${f(y1)}`;
    const knots = [[200 + r() * 1200, y0 + (y1 - y0) * (0.3 + r() * 0.4)]];
    for (let y = y0 + 4; y < y1 - 2; y += 3.4 + r() * 2.4) {
      const linePts = [];
      for (let x = -20; x <= W + 20; x += 80) {
        let yy = y + Math.sin(x / (140 + r() * 30) + i) * 2.2 + (r() - 0.5) * 1.2;
        for (const [kx, ky] of knots) {
          const dx = x - kx, dy = y - ky;
          const d = Math.hypot(dx / 3.2, dy);
          if (d < 46) yy += (dy >= 0 ? 1 : -1) * (46 - d) * 0.5;
        }
        linePts.push([x, yy]);
      }
      const d = spline(linePts);
      if (r() < 0.55) grain += d;
      else grainLight += d;
    }
    for (const [kx, ky] of knots) {
      for (let k = 1; k < 6; k++) parts.push(`<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(k * 7.5)}" ry="${f(k * 2.6)}" fill="none" stroke="${SEPIA}" stroke-width=".7" opacity="${f(0.32 - k * 0.04)}"/>`);
    }
  }
  // library: bookshelves on the wall
  let books = '', bookHatch = '', shelf = '';
  const shelfYs = [40, 128];
  for (const sy of shelfYs) {
    shelf += `M0 ${sy + 70}L${W} ${sy + 70}M0 ${sy + 78}L${W} ${sy + 78}`;
    let x = -10;
    while (x < W) {
      if (r() < 0.07) { x += 30 + r() * 60; continue; }
      const w = 12 + r() * 20;
      const h = 44 + r() * 26;
      const lean = r() < 0.06 ? (r() - 0.5) * 18 : 0;
      const y = sy + 70 - h;
      books += `M${f(x)} ${f(sy + 70)}L${f(x + lean)} ${f(y)}L${f(x + w + lean)} ${f(y)}L${f(x + w)} ${f(sy + 70)}`;
      // bands on spines
      const bandY = y + 6 + r() * 8;
      books += `M${f(x + lean * 0.9)} ${f(bandY)}L${f(x + w + lean * 0.9)} ${f(bandY)}`;
      if (r() < 0.6) books += `M${f(x)} ${f(sy + 62)}L${f(x + w)} ${f(sy + 62)}`;
      for (let hx = x + w * 0.55; hx < x + w - 1; hx += 2.2) bookHatch += `M${f(hx)} ${f(y + 2)}L${f(hx)} ${f(sy + 69)}`;
      x += w + 1.5;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice">
  <defs>
    <linearGradient id="deskTone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9ab84"/><stop offset=".22" stop-color="#d6bc96"/><stop offset=".6" stop-color="#cfb28a"/><stop offset="1" stop-color="#b9976d"/>
    </linearGradient>
    <linearGradient id="wallTone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cdb594"/><stop offset="1" stop-color="#e2cfb0"/>
    </linearGradient>
    <linearGradient id="libFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".75" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="libMask"><rect width="${W}" height="${wallBottom}" fill="url(#libFade)"/></mask>
    <radialGradient id="vignette" cx=".5" cy=".55" r=".75">
      <stop offset=".55" stop-color="${WALNUT}" stop-opacity="0"/><stop offset="1" stop-color="${WALNUT}" stop-opacity=".42"/>
    </radialGradient>
    <radialGradient id="light" cx=".5" cy=".42" r=".55">
      <stop offset="0" stop-color="#fff6e4" stop-opacity=".55"/><stop offset="1" stop-color="#fff6e4" stop-opacity="0"/>
    </radialGradient>
    <filter id="wash" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="4" seed="4"/>
      <feColorMatrix values="0 0 0 0 0.31  0 0 0 0 0.22  0 0 0 0 0.17  0 0 0 -1.1 0.62"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#deskTone)"/>
  <rect width="${W}" height="${wallBottom}" fill="url(#wallTone)"/>
  <g mask="url(#libMask)" fill="none" stroke="${SEPIA}" stroke-linecap="round">
    <path d="${books}" stroke-width="1" opacity=".55"/>
    <path d="${bookHatch}" stroke-width=".5" opacity=".35"/>
    <path d="${shelf}" stroke-width="1.4" opacity=".6"/>
    <path d="${hatch(0, 0, W, 30, 4, 90, r)}" stroke-width=".5" opacity=".25"/>
  </g>
  <path d="M0 ${wallBottom}L${W} ${wallBottom}" stroke="${WALNUT}" stroke-width="2.2" opacity=".55"/>
  <path d="M0 ${wallBottom + 8}L${W} ${wallBottom + 8}" stroke="${WALNUT}" stroke-width=".8" opacity=".4"/>
  <path d="${hatch(0, wallBottom, W, wallBottom + 26, 3, 90, r)}" stroke="${WALNUT}" stroke-width=".6" opacity=".22"/>
  ${tones.join('')}
  <g fill="none" stroke="${SEPIA}" stroke-linecap="round">
    <path d="${highlights}" stroke="#fff6e4" stroke-width="1.4" opacity=".35"/>
    <path d="${grain}" stroke-width=".75" opacity=".28"/>
    <path d="${grainLight}" stroke-width=".6" opacity=".15"/>
    <path d="${seams}" stroke="${WALNUT}" stroke-width="1.6" opacity=".4"/>
  </g>
  ${parts.join('\n')}
  <rect width="${W}" height="${H}" filter="url(#wash)" opacity=".55"/>
  <rect width="${W}" height="${H}" fill="url(#light)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
  write('desk.svg', svg);
}

// =====================================================================
// BOTANICAL CORNER — engraved leafy sprig with a rosebud
// =====================================================================
function leaf(cx, cy, len, ang, r, opts = {}) {
  const a = (ang * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const nx = -uy, ny = ux;
  const w = len * (opts.width ?? 0.36);
  const P = (t, s) => [cx + ux * len * t + nx * s, cy + uy * len * t + ny * s];
  const outline = [P(0, 0), P(0.2, w * 0.7), P(0.5, w), P(0.8, w * 0.6), P(1, 0), P(0.8, -w * 0.55), P(0.5, -w * 0.95), P(0.2, -w * 0.65)];
  let d = `<path d="${spline(outline, true)}" fill="${opts.fill ?? 'none'}" fill-opacity="${opts.fillOpacity ?? 0.35}" stroke="${SEPIA}" stroke-width=".9"/>`;
  d += `<path d="M${f(P(0, 0)[0])} ${f(P(0, 0)[1])}Q${f(P(0.5, w * 0.08)[0])} ${f(P(0.5, w * 0.08)[1])} ${f(P(0.97, 0)[0])} ${f(P(0.97, 0)[1])}" stroke="${SEPIA}" stroke-width=".7" fill="none"/>`;
  let veins = '';
  for (let t = 0.12; t < 0.9; t += 0.1) {
    const side = 1;
    const s = P(t, 0), e = P(t + 0.12, side * w * 0.82 * Math.sin(Math.PI * (t + 0.05)));
    const e2 = P(t + 0.12, -w * 0.78 * Math.sin(Math.PI * (t + 0.05)));
    veins += `M${f(s[0])} ${f(s[1])}L${f(e[0])} ${f(e[1])}M${f(s[0])} ${f(s[1])}L${f(e2[0])} ${f(e2[1])}`;
  }
  d += `<path d="${veins}" stroke="${SEPIA}" stroke-width=".45" opacity=".7"/>`;
  // hatching on one half
  let h = '';
  for (let t = 0.1; t < 0.95; t += 0.035) {
    const wt = w * Math.sin(Math.PI * t) * 0.9;
    const s = P(t, -wt * 0.15), e = P(t + 0.03, -wt);
    h += `M${f(s[0])} ${f(s[1])}L${f(e[0])} ${f(e[1])}`;
  }
  d += `<path d="${h}" stroke="${SEPIA}" stroke-width=".35" opacity=".55"/>`;
  void r;
  return d;
}

function rosebud(x, y, s, ang) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${ang}) scale(${s})">
    <path d="M0 0 C-12 -6 -14 -26 -4 -36 C2 -40 10 -38 13 -30 C18 -18 12 -6 0 0Z" fill="${ROSE}" fill-opacity=".55" stroke="${SEPIA}" stroke-width=".9"/>
    <path d="M-4 -36 C0 -28 2 -16 0 0 M13 -30 C6 -26 2 -18 1 -8 M-9 -20 C-4 -18 -2 -12 -1 -4" stroke="${BURG}" stroke-width=".7" fill="none"/>
    <path d="M0 0 C-10 2 -16 -6 -18 -14 C-10 -10 -4 -8 0 0Z M0 0 C10 2 18 -4 20 -12 C12 -8 5 -6 0 0Z" fill="#a9a074" fill-opacity=".45" stroke="${SEPIA}" stroke-width=".8"/>
  </g>`;
}

function botanical() {
  const r = rng(55);
  const W = 260, H = 260;
  const stem = [[6, 250], [40, 200], [70, 150], [118, 104], [170, 62], [236, 18]];
  let g = `<path d="${spline(stem)}" stroke="${SEPIA}" stroke-width="1.3" fill="none"/>`;
  const stem2 = [[60, 162], [44, 120], [40, 78], [52, 30]];
  g += `<path d="${spline(stem2)}" stroke="${SEPIA}" stroke-width="1" fill="none"/>`;
  const leaves = [
    [40, 200, 46, -150], [52, 184, 40, -40], [86, 136, 44, -120], [100, 124, 38, -10], [140, 88, 40, -100], [150, 80, 34, 10],
    [190, 50, 30, -80], [46, 118, 32, -170], [42, 92, 30, -20], [46, 60, 26, -150],
  ];
  for (const [x, y, l, a] of leaves) g += leaf(x, y, l, a, r, { fill: '#a39a6c', fillOpacity: 0.28 });
  g += rosebud(236, 18, 0.9, 50);
  g += rosebud(52, 30, 0.75, -20);
  // tiny berries / dots
  for (let i = 0; i < 6; i++) g += `<circle cx="${f(110 + r() * 60)}" cy="${f(40 + r() * 50)}" r="${f(1.6 + r() * 1.4)}" fill="${ROSE}" fill-opacity=".6" stroke="${SEPIA}" stroke-width=".6"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <g stroke-linecap="round" stroke-linejoin="round">${g}</g>
</svg>`;
  write('botanical-corner.svg', svg);
}

// =====================================================================
// ROSE (pressed, lying on the desk) and loose petals
// =====================================================================
function rose() {
  const r = rng(77);
  const W = 300, H = 220;
  let g = '';
  // stem with thorns, running down-left
  const stem = [[150, 92], [120, 120], [86, 150], [40, 190], [6, 214]];
  g += `<path d="${spline(stem)}" stroke="${SEPIA}" stroke-width="2.4" fill="none"/>`;
  g += `<path d="${spline(stem.map(([x, y]) => [x + 1.5, y + 1.5]))}" stroke="#7b8a5a" stroke-width="1.4" fill="none" opacity=".55"/>`;
  for (const [x, y] of [[104, 134], [64, 170], [28, 198]]) g += `<path d="M${x} ${y} l6 5 l-8 1z" fill="${SEPIA}"/>`;
  g += leaf(92, 146, 52, -95, r, { fill: '#8f9a63', fillOpacity: 0.35 });
  g += leaf(60, 174, 44, 140, r, { fill: '#8f9a63', fillOpacity: 0.35 });
  // rose head: concentric petal arcs
  const cx = 178, cy = 72;
  const petals = [];
  for (let i = 0; i < 9; i++) {
    const rad = 46 - i * 4.6;
    const start = r() * Math.PI * 2;
    const span = Math.PI * (1.05 + r() * 0.5);
    const p = [];
    for (let k = 0; k <= 8; k++) {
      const a = start + (span * k) / 8;
      const wob = 1 + (r() - 0.5) * 0.12;
      p.push([cx + Math.cos(a) * rad * wob, cy + Math.sin(a) * rad * 0.8 * wob]);
    }
    petals.push(p);
  }
  g += `<ellipse cx="${cx}" cy="${cy}" rx="50" ry="42" fill="${ROSE}" fill-opacity=".5" filter="url(#rwc)"/>`;
  g += `<ellipse cx="${cx - 6}" cy="${cy - 4}" rx="26" ry="20" fill="${BURG}" fill-opacity=".25" filter="url(#rwc)"/>`;
  for (const p of petals) g += `<path d="${spline(p)}" stroke="${BURG}" stroke-width="1.1" fill="none"/>`;
  // outer petal silhouette
  const outer = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const rr = 50 + (k % 2 ? -5 : 3) + (r() - 0.5) * 4;
    outer.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.84]);
  }
  g += `<path d="${spline(outer, true)}" stroke="${SEPIA}" stroke-width="1.2" fill="none"/>`;
  g += `<path d="${hatch(cx, cy - 10, cx + 52, cy + 44, 3, 60, r)}" stroke="${BURG}" stroke-width=".5" opacity=".45" clip-path="url(#roseClip)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${watercolorFilter('rwc', 12, 7, 0.05)}<clipPath id="roseClip"><path d="${spline(outer, true)}"/></clipPath></defs>
  <g stroke-linecap="round" stroke-linejoin="round">${g}</g>
</svg>`;
  write('rose.svg', svg);

  // loose petals
  const pr = rng(91);
  let pg = '';
  const placements = [[40, 40, 0.9, 20], [110, 26, 0.7, -40], [86, 92, 0.8, 110], [150, 70, 0.6, 200]];
  for (const [x, y, s, a] of placements) {
    const w = 34, h = 26;
    const outline = [[0, -h * 0.1], [w * 0.4, -h * 0.55], [w * 0.9, -h * 0.4], [w, 0], [w * 0.85, h * 0.45], [w * 0.4, h * 0.5]];
    pg += `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">
      <path d="${spline(outline, true)}" fill="${BLUSH}" stroke="${ROSE}" stroke-width="1"/>
      <path d="${spline(outline, true)}" fill="${ROSE}" fill-opacity=".45" filter="url(#pwc)"/>
      <path d="M2 0 Q16 ${f((pr() - 0.5) * 6)} ${w - 4} 0 M8 0 Q18 -8 26 -12 M8 0 Q18 8 26 12" stroke="${BURG}" stroke-width=".55" fill="none" opacity=".6"/>
    </g>`;
  }
  write('petals.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 130" width="190" height="130"><defs>${watercolorFilter('pwc', 5, 5, 0.06)}</defs>${pg}</svg>`);
}

// =====================================================================
const q = quill();
const pot = inkpot();
desk();
botanical();
rose();
fs.writeFileSync(
  path.join(OUT, 'artMeta.json'),
  JSON.stringify({ quill: { width: q.W, height: q.H, tipX: Math.round(q.tip[0] * 10) / 10, tipY: Math.round(q.tip[1] * 10) / 10 }, inkpot: { width: pot.W, height: pot.H, mouthX: pot.mouth[0], mouthY: pot.mouth[1] } }, null, 2),
);
void PARCH; void GOLD;
