interface Props {
  onOpen(): void;
}

/** Burgundy heart-shaped wax seal with a dusty-rose ribbon. Opens the hidden note. */
export default function WaxSeal({ onOpen }: Props) {
  return (
    <button type="button" className="wax-seal" onClick={onOpen} aria-label="Wax seal — open the sealed note">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="waxBody" cx=".38" cy=".32" r=".75">
            <stop offset="0" stopColor="#a35a6d" />
            <stop offset=".45" stopColor="#794454" />
            <stop offset="1" stopColor="#4d2531" />
          </radialGradient>
          <radialGradient id="waxInner" cx=".6" cy=".7" r=".7">
            <stop offset="0" stopColor="#8a4d5e" />
            <stop offset="1" stopColor="#5e2f3d" />
          </radialGradient>
          <filter id="waxDrip" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11" />
            <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        {/* ribbon tails */}
        <path d="M44 70 L20 112 L30 108 L34 118 L54 76 Z" fill="#c88f9d" stroke="#794454" strokeWidth="1" opacity=".95" />
        <path d="M76 70 L102 110 L91 107 L88 118 L66 76 Z" fill="#d8a5b1" stroke="#794454" strokeWidth="1" opacity=".95" />
        <path d="M26 108 L46 74 M96 106 L72 74" stroke="#794454" strokeWidth=".6" opacity=".5" />
        {/* wax pool */}
        <path
          d="M60 104 C40 90 14 74 14 48 C14 30 28 18 42 18 C51 18 57 23 60 30 C63 23 69 18 78 18 C92 18 106 30 106 48 C106 74 80 90 60 104 Z"
          fill="url(#waxBody)"
          filter="url(#waxDrip)"
        />
        {/* pressed heart */}
        <path
          d="M60 86 C46 76 30 66 30 50 C30 40 37 33 45 33 C51 33 56 36 60 42 C64 36 69 33 75 33 C83 33 90 40 90 50 C90 66 74 76 60 86 Z"
          fill="url(#waxInner)"
          stroke="#3e1b26"
          strokeWidth="1.2"
          opacity=".95"
        />
        <path d="M60 86 C46 76 30 66 30 50 C30 40 37 33 45 33" fill="none" stroke="#c07d8f" strokeWidth="1.2" opacity=".7" />
        {/* tiny rose emboss */}
        <g transform="translate(60 56)" fill="none" stroke="#3e1b26" strokeWidth="1.1" opacity=".75" strokeLinecap="round">
          <path d="M0 -8 C6 -8 8 -2 6 2 C4 6 -3 7 -6 3 C-9 -1 -6 -6 -1 -5 C3 -4 3 1 0 2" />
          <path d="M-2 9 C-1 13 0 16 0 18 M0 14 C3 12 6 12 8 13 M0 15 C-3 13 -6 13 -8 14" />
        </g>
        {/* gloss */}
        <path d="M30 34 C36 26 46 24 52 28" fill="none" stroke="#f4dce1" strokeWidth="3" strokeLinecap="round" opacity=".45" />
      </svg>
    </button>
  );
}
