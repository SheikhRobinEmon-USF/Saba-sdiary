import { useCallback, useEffect, useRef, useState } from 'react';

type Mood = 'asleep' | 'waking' | 'awake' | 'settling';

interface Props {
  onPurr?(): void;
}

/**
 * A small sepia line-art cat, curled up beside the notebook with a dusty-pink
 * ribbon. Click or tap (or press Enter/Space when focused) to wake her: she
 * lifts her head, blinks, stretches a little, then settles back to sleep. Her
 * tail drifts now and then. Purely decorative for the journal: never touches
 * the text.
 */
export default function CatCompanion({ onPurr }: Props) {
  const [mood, setMood] = useState<Mood>('asleep');
  const [hearts, setHearts] = useState<number[]>([]);
  const [tailSway, setTailSway] = useState(false);
  const timers = useRef<number[]>([]);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    // occasional, gentle tail movement while she sleeps
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        setTailSway(true);
        window.setTimeout(() => setTailSway(false), 2600);
        loop();
      }, 9000 + Math.random() * 9000);
    };
    loop();
    const pending = timers.current;
    return () => {
      clearTimeout(t);
      pending.forEach(clearTimeout);
    };
  }, []);

  const wake = useCallback(() => {
    if (mood !== 'asleep') return;
    onPurr?.();
    setMood('waking');
    const id = Date.now();
    setHearts((h) => [...h, id]);
    later(1800, () => setHearts((h) => h.filter((x) => x !== id)));
    later(700, () => setMood('awake'));
    later(3600, () => setMood('settling'));
    later(4600, () => setMood('asleep'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, onPurr]);

  const eyesOpen = mood === 'waking' || mood === 'awake';
  const label = eyesOpen ? 'The cat is awake and blinking at you' : 'A sleeping cat. Tap to wake her';

  return (
    <button
      type="button"
      className="cat"
      data-mood={mood}
      data-tail={tailSway ? 'sway' : 'still'}
      aria-label={label}
      onClick={wake}
    >
      <svg viewBox="0 0 250 160" width="250" height="160" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="catFur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efe0c6" />
            <stop offset="1" stopColor="#dcc6a3" />
          </linearGradient>
          <radialGradient id="catShadow" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#392a24" stopOpacity=".35" />
            <stop offset="1" stopColor="#392a24" stopOpacity="0" />
          </radialGradient>
          <filter id="catWash" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="8" />
            <feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <ellipse cx="135" cy="146" rx="112" ry="12" fill="url(#catShadow)" />

        <g className="cat-whole">
          {/* tail, wrapping around the front */}
          <g className="cat-tail">
            <path
              d="M214 128 C232 140 222 152 190 152 C150 153 104 152 76 146 C60 142 52 134 60 128 C66 124 74 130 70 136"
              fill="none"
              stroke="#50372d"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <path
              d="M214 128 C232 140 222 152 190 152 C150 153 104 152 76 146 C60 142 52 134 60 128 C66 124 74 130 70 136"
              fill="none"
              stroke="url(#catFur)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M196 146 l4 7 M176 147 l3 6 M156 147 l2 6 M136 147 l2 6 M116 146 l1 6 M96 145 l1 6 M78 141 l-1 6"
              stroke="#50372d"
              strokeWidth="1.2"
              opacity=".55"
              strokeLinecap="round"
            />
          </g>

          {/* body */}
          <path
            d="M88 70 C104 50 150 44 186 54 C218 63 236 90 232 116 C229 136 212 146 186 146 L96 146 C74 146 60 138 58 124 C56 104 70 86 88 70 Z"
            fill="url(#catFur)"
            stroke="#50372d"
            strokeWidth="1.8"
            filter="url(#catWash)"
          />
          {/* tabby stripes & engraved hatching along the back */}
          <g stroke="#50372d" fill="none" strokeLinecap="round">
            <path d="M150 52 C146 62 147 70 152 76 M168 54 C163 64 164 73 170 80 M186 58 C180 68 181 78 188 86 M203 66 C196 76 197 86 205 94 M217 80 C211 88 212 98 219 104" strokeWidth="2.2" opacity=".5" />
            <path
              d="M120 58 l-4 6 M128 55 l-4 6 M136 53 l-4 6 M144 52 l-3 6 M158 52 l-3 7 M176 55 l-3 7 M194 61 l-3 7 M210 71 l-2 7 M222 84 l-1 7 M228 98 l0 7 M229 112 l-1 7"
              strokeWidth="1"
              opacity=".55"
            />
            <path d="M200 118 C206 112 214 112 220 118 M190 128 C198 121 210 121 218 128" strokeWidth="1" opacity=".45" />
          </g>
          {/* hind leg contour */}
          <path d="M188 146 C172 140 168 120 182 108 C196 98 216 104 220 120" fill="none" stroke="#50372d" strokeWidth="1.5" opacity=".8" />

          {/* front paws */}
          <g className="cat-paws" stroke="#50372d" strokeWidth="1.6" fill="url(#catFur)">
            <path d="M62 140 C58 132 66 126 78 127 L102 128 C110 129 112 140 104 143 L72 145 C66 145 63 143 62 140 Z" />
            <path d="M90 143 C86 136 92 131 104 132 L126 133 C134 134 135 144 128 146 L98 147 C93 147 91 146 90 143 Z" />
            <path d="M70 136 l0 6 M78 135 l0 7 M100 139 l0 6 M108 139 l0 7" strokeWidth="1" fill="none" />
          </g>

          {/* head */}
          <g className="cat-head">
            <g className="cat-ear cat-ear-l">
              <path d="M44 66 L40 26 C40 22 44 21 47 23 L76 46 Z" fill="url(#catFur)" stroke="#50372d" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M48 56 L46 32 L66 47" fill="#f4dce1" stroke="#c88f9d" strokeWidth="1" />
            </g>
            <g className="cat-ear cat-ear-r">
              <path d="M88 44 L114 20 C117 18 121 19 120 23 L118 62 Z" fill="url(#catFur)" stroke="#50372d" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M96 45 L114 28 L113 54" fill="#f4dce1" stroke="#c88f9d" strokeWidth="1" />
            </g>
            <path
              d="M80 40 C104 40 124 56 124 80 C124 104 104 118 80 118 C56 118 36 104 36 80 C36 56 56 40 80 40 Z"
              fill="url(#catFur)"
              stroke="#50372d"
              strokeWidth="1.8"
              filter="url(#catWash)"
            />
            {/* forehead stripes */}
            <path d="M80 46 L80 58 M71 48 L73 59 M89 48 L87 59" stroke="#50372d" strokeWidth="1.8" opacity=".55" strokeLinecap="round" />
            {/* cheek hatching */}
            <path d="M44 92 l6 3 M42 98 l7 2 M116 92 l-6 3 M118 98 l-7 2" stroke="#50372d" strokeWidth="1" opacity=".5" strokeLinecap="round" />
            {/* blush */}
            <ellipse cx="56" cy="94" rx="8" ry="4" fill="#c88f9d" opacity=".35" />
            <ellipse cx="104" cy="94" rx="8" ry="4" fill="#c88f9d" opacity=".35" />

            {/* eyes: closed */}
            <g className="cat-eyes-closed" stroke="#392a24" strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M56 80 Q63 86 70 80" />
              <path d="M90 80 Q97 86 104 80" />
              <path d="M56 80 l-3 -2 M104 80 l3 -2" strokeWidth="1.3" />
            </g>
            {/* eyes: open */}
            <g className="cat-eyes-open">
              <path d="M54 80 Q63 70 72 80 Q63 88 54 80 Z" fill="#b69a69" stroke="#392a24" strokeWidth="1.6" />
              <path d="M88 80 Q97 70 106 80 Q97 88 88 80 Z" fill="#b69a69" stroke="#392a24" strokeWidth="1.6" />
              <ellipse className="cat-pupil" cx="63" cy="79.5" rx="2" ry="5" fill="#2a1a14" />
              <ellipse className="cat-pupil" cx="97" cy="79.5" rx="2" ry="5" fill="#2a1a14" />
              <circle cx="65" cy="77" r="1.2" fill="#fff" />
              <circle cx="99" cy="77" r="1.2" fill="#fff" />
            </g>
            {/* nose & mouth */}
            <path d="M76 90 L84 90 L80 95 Z" fill="#c88f9d" stroke="#794454" strokeWidth="1" strokeLinejoin="round" />
            <path d="M80 95 C80 99 76 101 72 99 M80 95 C80 99 84 101 88 99" fill="none" stroke="#392a24" strokeWidth="1.3" strokeLinecap="round" />
            {/* whiskers */}
            <g stroke="#50372d" strokeWidth=".8" opacity=".7" strokeLinecap="round">
              <path d="M60 96 L24 90 M60 99 L22 100 M61 102 L26 110" />
              <path d="M100 96 L136 90 M100 99 L138 100 M99 102 L134 110" />
            </g>
            {/* dusty-pink ribbon collar with a little bow */}
            <path d="M48 108 C62 118 98 118 112 108" fill="none" stroke="#c88f9d" strokeWidth="5" strokeLinecap="round" />
            <path d="M48 108 C62 118 98 118 112 108" fill="none" stroke="#794454" strokeWidth=".8" opacity=".6" />
            <g className="cat-bow" transform="translate(80 116)">
              <path d="M0 0 C-6 -9 -18 -8 -16 1 C-14 8 -5 5 0 0 Z" fill="#c88f9d" stroke="#794454" strokeWidth="1" />
              <path d="M0 0 C6 -9 18 -8 16 1 C14 8 5 5 0 0 Z" fill="#c88f9d" stroke="#794454" strokeWidth="1" />
              <path d="M-1 1 L-6 13 M1 1 L7 12" stroke="#c88f9d" strokeWidth="3" strokeLinecap="round" />
              <circle r="2.6" fill="#f4dce1" stroke="#794454" strokeWidth="1" />
            </g>
          </g>
        </g>
      </svg>
      {hearts.map((id) => (
        <span key={id} className="cat-heart" aria-hidden="true">
          <svg viewBox="0 0 20 18" width="16" height="15">
            <path d="M10 17 C4 12 1 9 1 5.5 C1 3 3 1 5.5 1 C7.5 1 9 2.3 10 4 C11 2.3 12.5 1 14.5 1 C17 1 19 3 19 5.5 C19 9 16 12 10 17 Z" fill="#c88f9d" />
          </svg>
        </span>
      ))}
    </button>
  );
}
