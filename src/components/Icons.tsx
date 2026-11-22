/** Small engraved-style line icons. Decorative: buttons carry their own names. */
type P = { size?: number };
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

export const IconSoundOn = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.2 9.2c1 .8 1.5 1.8 1.5 2.8s-.5 2-1.5 2.8M17.6 6.8c1.7 1.4 2.6 3.2 2.6 5.2s-.9 3.8-2.6 5.2" />
  </svg>
);
export const IconSoundOff = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
  </svg>
);
export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </svg>
);
export const IconScroll = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 4h10.5a2 2 0 0 1 0 4H17v10a2.5 2.5 0 0 1-2.5 2.5H6a2 2 0 0 1 0-4h.8V6A2 2 0 0 1 7 4z" />
    <path d="M9.5 9.5h5M9.5 12.5h5M9.5 15.5h3" />
  </svg>
);
export const IconImport = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3.5v11M7.8 10.5L12 14.7l4.2-4.2" />
    <path d="M4.5 15.5v2.8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.8" />
  </svg>
);
export const IconExport = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 14.5v-11M7.8 7.7L12 3.5l4.2 4.2" />
    <path d="M4.5 15.5v2.8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.8" />
  </svg>
);
export const IconNewPage = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M14 3.5v4h4M12 11v6M9 14h6" />
  </svg>
);
export const IconQuill = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 20c3-6 7-11.5 15.5-16.5-1 6-4.5 10.5-10.5 12.5" />
    <path d="M8 15.5c2.5-.3 4.8-1.2 6.5-2.6M10.5 11.6c2-.3 3.8-1 5.3-2.1" />
  </svg>
);
export const IconInstant = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z" />
  </svg>
);
export const IconClose = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPrint = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 8V3.5h10V8M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2" />
    <path d="M7 14h10v6.5H7z" />
  </svg>
);
export const IconText = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M9 11h6M9 14h6M9 17h4" />
  </svg>
);
export const IconSeal = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 20.5c-5-3.6-8-6.5-8-10.1A4.3 4.3 0 0 1 8.4 6c1.6 0 2.8.8 3.6 2 .8-1.2 2-2 3.6-2A4.3 4.3 0 0 1 20 10.4c0 3.6-3 6.5-8 10.1z" />
  </svg>
);
