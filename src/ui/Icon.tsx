// Small line icons for the tool bars, drawn here so nothing is loaded from elsewhere.
// All are 24 x 24 and use the text colour.

const PATHS = {
  // Comments
  highlight: 'M14.5 4.5l5 5L10 19l-5 1 1-5zM12.5 6.5l5 5M4 22h16',
  underline: 'M7 4v7a5 5 0 0010 0V4M5 21h14',
  strikeout: 'M5 12h14M16.5 7.5C15.6 6.2 14 5.5 12 5.5c-2.5 0-4 1.2-4 3 0 1.4 1 2.2 3 2.7M13 13.3c2 .5 3 1.4 3 2.8 0 1.8-1.5 3.4-4 3.4-2 0-3.6-.8-4.5-2.2',
  note: 'M4 5h16v11H10l-4 4v-4H4z',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  ink: 'M3 17c3-7 5-7 7-3s4 2 6-3 3-3 5-1',
  square: 'M4 6h16v12H4z',
  circle: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M10 5h9v9',
  stamp: 'M10 4h4v6l3.5 3.5V16h-11v-2.5L10 10zM5 20h14',
  // Fill in and sign
  date: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  check: 'M5 12.5l4.5 4.5L19 7',
  signature: 'M3 16c3-6 4-9 6-9 1.5 0 0 7 1.8 7 1.5 0 2-4 3.7-4 1.5 0 .5 4 3.5 4M3 21h18',
  initials: 'M6 19l6-14 6 14M8.5 14h7',
  // Insert
  embedText: 'M5 7V5h11v2M10.5 5v13M8 18h5M18 12v6M15 15h6',
  embedImage: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  // Change
  editText: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  editImage: 'M4 6h9M4 6v13h13v-7M17 3l4 4-8 8-4 1 1-4z',
  redact: 'M4 6h16v12H4zM7 10h6M7 14h10',
  search: 'M10.5 4a6.5 6.5 0 105 10.7l4.5 4.5M10.5 4a6.5 6.5 0 010 13',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3M12 15v2',
  export: 'M12 15V4M7 9l5-5 5 5M5 14v6h14v-6',
  compress: 'M4 9h6V3M20 9h-6V3M4 15h6v6M20 15h-6v6',
  compare: 'M4 4h7v16H4zM13 4h7v16h-7zM6.5 9h2M15.5 9h2M6.5 13h2',
  ocr: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M8 9h8M12 9v7M9.5 16h5',
  batch: 'M5 7h14M5 12h14M5 17h9M17 15l3 2-3 2',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  // Rail
  open: 'M12 5v14M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  close: 'M6 6l12 12M18 6L6 18',
  selectAll: 'M4 4h16v16H4zM8 12.5l3 3 5-6',
  rotateLeft: 'M4 12a8 8 0 108-8H8M8 4L5 7l3 3',
  rotateRight: 'M20 12a8 8 0 11-8-8h4M16 4l3 3-3 3',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  reverse: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  split: 'M12 3v18M6 8l-3 4 3 4M18 8l3 4-3 4',
  merge: 'M4 5h7v14H4zM13 5h7v14h-7z',
  print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  save: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  comments: 'M4 5h16v11H10l-4 4v-4H4zM8 9h8M8 12h5',
  read: 'M4 5h7a2 2 0 012 2v13a2 2 0 00-2-2H4zM20 5h-7a2 2 0 00-2 2v13a2 2 0 012-2h7z',
  pages: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  flatten: 'M4 8l8-4 8 4-8 4zM4 13l8 4 8-4M4 17l8 4 8-4',
  blank: 'M6 3h8l4 4v14H6zM14 3v4h4',
  mark: 'M4 6h16M4 18h16M8 12h8',
  crop: 'M7 3v14h14M3 7h14v14',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  resize: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
