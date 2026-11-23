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
        {/* a little cat face pressed into the wax */}
        <g transform="translate(60 58)" fill="none" stroke="#3e1b26" strokeWidth="1.3" opacity=".78" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-12 -6 L-11 -17 L-4 -10 C-1.5 -11 1.5 -11 4 -10 L11 -17 L12 -6 C13.5 2 8 8 0 8 C-8 8 -13.5 2 -12 -6 Z" />
          <path d="M-6 -2 Q-4 0 -2 -2 M2 -2 Q4 0 6 -2" />
          <path d="M-1.4 2 L1.4 2 L0 3.6 Z" fill="#3e1b26" />
          <path d="M-5 4 L-14 3 M-5 5.5 L-13 7 M5 4 L14 3 M5 5.5 L13 7" strokeWidth=".8" />
        </g>
        {/* gloss */}
        <path d="M30 34 C36 26 46 24 52 28" fill="none" stroke="#f4dce1" strokeWidth="3" strokeLinecap="round" opacity=".45" />
      </svg>
    </button>
  );
}
