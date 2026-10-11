// Comments that the user adds to a page, as plain data in page points (the page's own space,
// before the extra rotation). They are drawn over the page and written as real PDF annotations
// when saving, so other programs can read and edit them.
import type { FieldSpec } from './formfields';
import type { Size } from './readerLayout';
import type { Box } from './textLayer';

export type AnnotKind =
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'note'
  | 'text'
  | 'ink'
  | 'square'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'stamp'
  /** A clickable area; `contents` holds the address. */
  | 'link'
  /** An area to be removed for good when saving; `contents` is not used. */
  | 'redact'
  /** A form field; `field` says what kind. */
  | 'field';

export type Pt = [number, number];

export interface Annot {
  id: string;
  kind: AnnotKind;
  /** Colour as #rrggbb. */
  color: string;
  /** The comment text, or the text of a text box. */
  contents: string;
  /** Bounding box in page points. */
  box: Box;
  /** Highlight, underline, strikeout: one box per line of text. */
  quads?: Box[];
  /** Freehand: one list of points per stroke. */
  strokes?: Pt[][];
  /** Line and arrow: start and end. */
  line?: [Pt, Pt];
  /** Stroke width in points. */
  width?: number;
  /** Font size of a text box, in points. */
  fontSize?: number;
  /** The form field this stands for, when `kind` is 'field'. */
  field?: FieldSpec;
  /** Written into the page itself when saving (text, pictures) instead of being a comment. */
  embed?: boolean;
  /** What a filled-in item is, for the list: a signature, initials, a check mark or a date. */
  tag?: 'signature' | 'initials' | 'check' | 'date';
  /** Stamp: the picture as PNG bytes. */
  image?: Uint8Array;
  /** Redaction from a search hit: its box is as tall as the font allows, so the text pass trims it. */
  search?: boolean;
  created: number;
}

export const COMMENT_COLORS = ['#f5c400', '#e5484d', '#3a8f4b', '#3347c9', '#14161a'] as const;
export const DEFAULT_COLOR = COMMENT_COLORS[0];

/** Kinds that mark text and so need a text selection. */
export const isMarkup = (k: string): k is 'highlight' | 'underline' | 'strikeout' => k === 'highlight' || k === 'underline' || k === 'strikeout';

/** Kinds that are drawn by dragging a rectangle. */
export const isDragged = (k: AnnotKind) => k === 'square' || k === 'circle' || k === 'text' || k === 'stamp';

export const boundsOf = (points: readonly Pt[], pad = 0): Box => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
};

/** Normalised rectangle between two corners. */
export const boxBetween = (a: Pt, b: Pt): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];

/**
 * A point on the turned, scaled page (pixels from its top left corner) as a point of the page's
 * own space. The inverse of what `overlayTransform` does.
 */
export function screenToPage(x: number, y: number, size: Size, rotation: number, scale: number): Pt {
  const px = x / scale;
  const py = y / scale;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [py, size.height - px];
    case 180:
      return [size.width - px, size.height - py];
    case 270:
      return [size.width - py, px];
    default:
      return [px, py];
  }
}

/** Merges boxes that sit on the same line, so a selection gives one box per line of text. */
export function mergeLineBoxes(boxes: readonly Box[]): Box[] {
  const sorted = [...boxes].filter((b) => b[2] - b[0] > 0.5 && b[3] - b[1] > 0.5).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out: Box[] = [];
  for (const b of sorted) {
    const last = out.at(-1);
    const sameLine = last && Math.abs((last[1] + last[3]) / 2 - (b[1] + b[3]) / 2) < (last[3] - last[1]) * 0.5;
    if (last && sameLine) {
      last[0] = Math.min(last[0], b[0]);
      last[1] = Math.min(last[1], b[1]);
      last[2] = Math.max(last[2], b[2]);
      last[3] = Math.max(last[3], b[3]);
    } else out.push([...b]);
  }
  return out;
}

export const unionOf = (boxes: readonly Box[]): Box => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

/** The arrow head of a line from `a` to `b`: two points behind `b`. */
export function arrowHead(a: Pt, b: Pt, length: number): [Pt, Pt] {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const spread = Math.PI / 7;
  return [
    [b[0] - length * Math.cos(angle - spread), b[1] - length * Math.sin(angle - spread)],
    [b[0] - length * Math.cos(angle + spread), b[1] - length * Math.sin(angle + spread)],
  ];
}

/** #rrggbb as red, green and blue between 0 and 1. */
export function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Comments in reading order of the page: top to bottom, then left to right. */
export const sortAnnots = (annots: readonly Annot[]): Annot[] =>
  [...annots].sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0] || a.created - b.created);
