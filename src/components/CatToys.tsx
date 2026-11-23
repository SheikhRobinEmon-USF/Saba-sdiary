/**
 * Engraved-style toys and furniture for the cats' desk: a little wooden cat
 * house with a heart-shaped door, a cardboard box (back and front, so a cat
 * can sit inside), a food bowl and a ball of rose-coloured yarn.
 * Every piece stands on its own ground line at the bottom of its viewBox.
 */
const LINE = '#50372d';
const DARK = '#392a24';

export const TOY_SIZES = {
  house: { w: 132, h: 124 },
  box: { w: 124, h: 84 },
  bowl: { w: 76, h: 36 },
  yarn: { w: 44, h: 38 },
} as const;

export function HouseArt({ occupant }: { occupant: 'tabby' | 'tuxedo' | null }) {
  const iris = occupant === 'tuxedo' ? '#c9cf7a' : '#e0b96a';
  return (
    <svg viewBox="0 0 132 124" width="132" height="124" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="houseWood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8a27a" />
          <stop offset="1" stopColor="#a98159" />
        </linearGradient>
        <linearGradient id="houseRoof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e5b4d" />
          <stop offset="1" stopColor="#6e3f3a" />
        </linearGradient>
        <clipPath id="houseWalls">
          <path d="M14 52 L118 52 L118 120 L14 120 Z" />
        </clipPath>
      </defs>
      <ellipse cx="66" cy="120" rx="62" ry="5" fill="#392a24" opacity=".22" />
      {/* walls with planks */}
      <path d="M14 52 L118 52 L118 120 L14 120 Z" fill="url(#houseWood)" stroke={LINE} strokeWidth="1.6" />
      <g clipPath="url(#houseWalls)" stroke={LINE} strokeWidth=".8" opacity=".55">
        <path d="M14 66 H118 M14 80 H118 M14 94 H118 M14 108 H118" />
        <path d="M44 52 V66 M84 66 V80 M34 80 V94 M98 94 V108 M56 108 V120" />
        <path d="M96 52 L118 74 M100 52 L118 70 M104 52 L118 66" opacity=".6" />
      </g>
      {/* heart-shaped door */}
      <path
        d="M66 116 C50 104 38 94 38 80 C38 70 45 64 53 64 C59 64 63 67 66 72 C69 67 73 64 79 64 C87 64 94 70 94 80 C94 94 82 104 66 116 Z"
        fill="#24170f"
        stroke={LINE}
        strokeWidth="1.8"
      />
      <path d="M48 112 C56 108 76 108 84 112 L84 116 L48 116 Z" fill="#c88f9d" opacity=".85" />
      {occupant && (
        <g className="house-eyes">
          <ellipse cx="57" cy="88" rx="4.2" ry="3.4" fill={iris} />
          <ellipse cx="75" cy="88" rx="4.2" ry="3.4" fill={iris} />
          <ellipse cx="57" cy="88" rx="1.2" ry="3" fill="#120a07" />
          <ellipse cx="75" cy="88" rx="1.2" ry="3" fill="#120a07" />
          <circle cx="58.4" cy="86.6" r=".9" fill="#fff" />
          <circle cx="76.4" cy="86.6" r=".9" fill="#fff" />
        </g>
      )}
      {/* roof with shingles */}
      <path d="M4 56 L66 8 L128 56 L118 60 L66 20 L14 60 Z" fill="url(#houseRoof)" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
      <g stroke={DARK} strokeWidth=".7" opacity=".55" fill="none">
        <path d="M20 46 L36 34 M36 34 L52 22 M28 51 L44 39 M44 39 L60 27 M112 46 L96 34 M96 34 L80 22 M104 51 L88 39 M88 39 L72 27" />
      </g>
      {/* little sign with a paw */}
      <path d="M56 40 L76 40 L76 50 L56 50 Z" fill="#efe2c8" stroke={LINE} strokeWidth="1" />
      <g fill="#794454" transform="translate(66 45.5) scale(.22)">
        <ellipse cx="0" cy="6" rx="9" ry="7.5" />
        <ellipse cx="-11" cy="-5" rx="3.6" ry="4.6" />
        <ellipse cx="-4" cy="-10.5" rx="3.6" ry="4.8" />
        <ellipse cx="4" cy="-10.5" rx="3.6" ry="4.8" />
        <ellipse cx="11" cy="-5" rx="3.6" ry="4.6" />
      </g>
    </svg>
  );
}

export function BoxBackArt() {
  return (
    <svg viewBox="0 0 124 84" width="124" height="84" aria-hidden="true" focusable="false">
      <ellipse cx="62" cy="80" rx="58" ry="5" fill="#392a24" opacity=".22" />
      {/* back flap and inside */}
      <path d="M16 34 L30 6 L96 6 L108 34 Z" fill="#b48f62" stroke={LINE} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 34 L112 34 L112 80 L12 80 Z" fill="#6e5236" />
    </svg>
  );
}

export function BoxFrontArt() {
  return (
    <svg viewBox="0 0 124 84" width="124" height="84" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="boxFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4b083" />
          <stop offset="1" stopColor="#bf9767" />
        </linearGradient>
      </defs>
      {/* front flaps folded outwards */}
      <path d="M8 40 L-2 24 L44 24 L54 40 Z" fill="#c9a374" stroke={LINE} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M116 40 L126 24 L80 24 L70 40 Z" fill="#c9a374" stroke={LINE} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 40 L116 40 L114 80 L10 80 Z" fill="url(#boxFront)" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
      <g stroke={LINE} strokeWidth=".7" opacity=".45">
        <path d="M18 48 L22 72 M30 46 L33 74 M92 46 L89 74 M104 48 L101 72" />
        <path d="M44 40 L44 50 M80 40 L80 50" strokeWidth="1.2" />
      </g>
      {/* a doodled heart and paw on the cardboard */}
      <path d="M62 70 C55 65 50 61 50 56 C50 53 52.5 51 55 51 C57.5 51 59.5 52.5 62 55 C64.5 52.5 66.5 51 69 51 C71.5 51 74 53 74 56 C74 61 69 65 62 70 Z" fill="none" stroke="#794454" strokeWidth="1.5" />
    </svg>
  );
}

export function BowlArt({ food }: { food: number }) {
  const bits = Math.round(food * 7);
  const pos = [
    [26, 13], [36, 11], [46, 13], [31, 9], [41, 8], [21, 15], [51, 15],
  ];
  return (
    <svg viewBox="0 0 76 36" width="76" height="36" aria-hidden="true" focusable="false">
      <ellipse cx="38" cy="33" rx="34" ry="3.4" fill="#392a24" opacity=".22" />
      {pos.slice(0, bits).map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${i * 37})`}>
          <path d="M-5 0 C-3 -3 2 -3 4 0 C2 3 -3 3 -5 0 Z M4 0 L7 -2.5 L7 2.5 Z" fill="#c88f9d" stroke="#794454" strokeWidth=".7" />
        </g>
      ))}
      <path d="M6 14 C8 28 20 33 38 33 C56 33 68 28 70 14 Z" fill="#f1e6d2" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 20 C20 23 56 23 67 20" fill="none" stroke="#794454" strokeWidth="2.6" opacity=".85" />
      <ellipse cx="38" cy="14" rx="32" ry="4.2" fill={bits ? 'none' : '#d9c7a8'} stroke={LINE} strokeWidth="1.4" />
      <path d="M16 26 C22 30 30 31 38 31" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".6" />
    </svg>
  );
}

export function YarnArt() {
  // the ball is centred in its box so it can spin in place; the shadow is CSS
  return (
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="14" fill="#d79aa8" stroke={LINE} strokeWidth="1.5" />
      <g fill="none" stroke="#9c5a6c" strokeWidth="1.1" strokeLinecap="round">
        <path d="M10 15 C16 21 18 29 16 35 M14 11 C20 17 24 27 22 35.5 M20 8.4 C26 15 30 25 29 35" />
        <path d="M33 12 C26 17 18 21 9 22 M35.5 17 C28 22 20 26 9.6 28" opacity=".85" />
      </g>
      <path d="M15 14 C18 11 22 10 25 10.5" stroke="#f6dbe1" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
      <path d="M35 24 C40 26 42 30 44 34" stroke="#c0788a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function YarnThread() {
  return (
    <svg className="yarn-thread" viewBox="0 0 60 20" width="60" height="20" aria-hidden="true" focusable="false">
      <path d="M2 16 C14 4 22 20 34 12 C42 7 50 15 58 10" fill="none" stroke="#c0788a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
