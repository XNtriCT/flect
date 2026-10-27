import React from 'react';

const S = ({ children, size = 18, stroke = 1.7, fill = 'none' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

const ICONS = {
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12h-2.5" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a6 6 0 0 0 0 12h2.5" /></>,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></>,
  sparkle: <><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" /><path d="M18.6 16.4l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 4.5-4.5 3.5 3.5 3-2.5 4 3.5" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" /></>,
  shape: <><rect x="3" y="4" width="9" height="8" rx="1.5" /><circle cx="16.5" cy="15.5" r="4.5" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>,
  link: <><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></>,
  quote: <><path d="M9.5 6.5c-2.8.8-4.5 3-4.5 6V18h4.5v-5H6.8" /><path d="M19 6.5c-2.8.8-4.5 3-4.5 6V18H19v-5h-3.2" /></>,
  rule: <><path d="M4 12h16" strokeWidth="2" /><path d="M6 5h12M6 19h12" opacity=".45" /></>,
  bulletList: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.6" cy="6.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.6" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.6" cy="17.5" r="1.2" fill="currentColor" stroke="none" /></>,
  orderedList: <><path d="M10 6.5h10M10 12h10M10 17.5h10" /><path d="M4 5.2h1v3.4M3.6 8.6h2" /><path d="M3.6 11.4c0-.7.6-1.1 1.2-1.1s1.1.5 1.1 1.1c0 1.1-2.4 1.8-2.4 3.3h2.5" /></>,
  indent: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="m4 9 3 3-3 3" /></>,
  outdent: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="m7 9-3 3 3 3" /></>,
  alignLeft: <><path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h9" /></>,
  alignCenter: <><path d="M4 6h16M7 10.5h10M4 15h16M7.5 19.5h9" /></>,
  alignRight: <><path d="M4 6h16M10 10.5h10M4 15h16M11 19.5h9" /></>,
  alignJustify: <><path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h16" /></>,
  colorText: <><path d="M6.5 15.5 11 5h2l4.5 10.5" /><path d="M8.2 12h7.6" /><rect x="4.5" y="19" width="15" height="2.6" rx="1.2" fill="currentColor" stroke="none" /></>,
  highlight: <><path d="m8.5 14.5 6.6-6.6a2.3 2.3 0 0 1 3.2 0l.8.8a2.3 2.3 0 0 1 0 3.2L12.5 18.5" /><path d="M8.5 14.5 5 18v3h5.5l2-2" /><path d="M3 3h8" opacity=".45" /></>,
  type: <><path d="M5 6h14M12 6v12M9 18h6" /></>,
  clear: <><path d="M5 19h14" /><path d="m7 15 5-11 5 11" /><path d="M9.4 10.5h5.2" /><path d="m15.5 15.5 4 4m0-4-4 4" /></>,
  folder: <><path d="M3.5 8.5a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-10Z" /></>,
  save: <><path d="M5 4.5h11l3.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4.5Z" /><path d="M8 4.5v5h7v-5" /><path d="M8 20v-6h8v6" /></>,
  download: <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></>,
  doc: <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4" /><path d="M9.5 12h5M9.5 15.5h5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.2" />,
  restore: <><rect x="5" y="8" width="10.5" height="10.5" rx="1.2" /><path d="M8.5 8V6.5A1.5 1.5 0 0 1 10 5h7.5A1.5 1.5 0 0 1 19 6.5V14a1.5 1.5 0 0 1-1.5 1.5H16" /></>,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></>,
  zoomIn: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5M8.5 11h5M11 8.5v5" /></>,
  zoomOut: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5M8.5 11h5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-13.7-5.2L4 8" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 13.7 5.2L20 16" /><path d="M20 20v-4.5h-4.5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6.5 7l.9 12.2A1.8 1.8 0 0 0 9.2 21h5.6a1.8 1.8 0 0 0 1.8-1.8L17.5 7" /><path d="M9.5 7V4.5h5V7" /></>,
  wand: <><path d="m5 19 9-9" /><path d="m12.5 5.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /><path d="m18 12 .6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="m14 7 5 5-5 5" /></>,
  book: <><path d="M4 5.5A2 2 0 0 1 6 3.5h5v17H6a2 2 0 0 0-2 2v-17Z" /><path d="M20 5.5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2v-17Z" /></>,
  external: <><path d="M14 4.5h5.5V10" /><path d="m19 5-7.5 7.5" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h4.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.3" /></>,
  pen: <><path d="M15.5 4.5 19 8l-10 10H5.5v-3.5l10-10Z" /><path d="m13.5 6.5 3.5 3.5" /></>,
  split: <><path d="M5 5h6v6H5z" opacity=".5" /><path d="M13 13h6v6h-6z" opacity=".5" /><path d="M11 8h3.5a2 2 0 0 1 2 2v3" /></>,
};

export function Icon({ name, size = 18, stroke = 1.7 }) {
  const body = ICONS[name];
  if (!body) return null;
  return <S size={size} stroke={stroke}>{body}</S>;
}

/** Letter-based formatting glyphs, the way Word draws B / I / U. */
export function Glyph({ kind }) {
  const map = {
    bold: { text: 'B', cls: 'glyph glyph--bold' },
    italic: { text: 'I', cls: 'glyph glyph--italic' },
    underline: { text: 'U', cls: 'glyph glyph--underline' },
    strike: { text: 'S', cls: 'glyph glyph--strike' },
    superscript: { text: 'x²', cls: 'glyph glyph--sup' },
    subscript: { text: 'x₂', cls: 'glyph glyph--sub' },
  };
  const spec = map[kind];
  if (!spec) return null;
  return <span className={spec.cls}>{spec.text}</span>;
}

export const Brand = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="flectG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffd9a0" />
        <stop offset="0.5" stopColor="#f3b45c" />
        <stop offset="1" stopColor="#c97b4a" />
      </linearGradient>
    </defs>
    <path d="M6 6h13l-2.4 5.4H11v3.2h6.6l-2.3 5.2H11V26H5.8V6Z" fill="url(#flectG)" />
    <circle cx="24" cy="23.5" r="2.6" fill="url(#flectG)" opacity="0.9" />
  </svg>
);
