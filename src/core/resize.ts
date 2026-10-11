// Resizing and keeping things on the page. All in page points, in the page's own space (y down);
// the turn of the page is handled by whoever converts the pointer into this space.
import { boundsOf, isMarkup, type Annot, type Pt } from './annotations';
import type { Size } from './readerLayout';
import type { Box } from './textLayer';

/** Nothing gets smaller than this, so it can still be picked up. */
export const MIN_SIZE = 8;

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type LineEnd = 'start' | 'end';

/** Which edge a handle pulls: -1 the left or top one, 1 the right or bottom one, 0 none. */
export const SIDES: Record<Handle, readonly [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};

export const HANDLES = Object.keys(SIDES) as Handle[];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The box after pulling a handle to a point. The opposite side stays where it is, the box stays
 * on the page and keeps `MIN_SIZE`. With `keepRatio` the shape of the box stays the same: a corner
 * follows the larger change, an edge grows the other direction around its middle.
 */
export function dragBox(box: Box, handle: Handle, [px, py]: Pt, { keepRatio, size }: { keepRatio: boolean; size: Size }): Box {
  const [hx, hy] = SIDES[handle];
  const [x0, y0, x1, y1] = box;
  const x = clamp(px, 0, size.width);
  const y = clamp(py, 0, size.height);
  const left = hx < 0 ? Math.min(x, x1 - MIN_SIZE) : x0;
  const right = hx > 0 ? Math.max(x, x0 + MIN_SIZE) : x1;
  const top = hy < 0 ? Math.min(y, y1 - MIN_SIZE) : y0;
  const bottom = hy > 0 ? Math.max(y, y0 + MIN_SIZE) : y1;
  const w0 = x1 - x0;
  const h0 = y1 - y0;
  // A box without width or height has no shape to keep.
  if (!keepRatio || w0 <= 0 || h0 <= 0) return [left, top, right, bottom];

  // How far the pointer has pulled the box, before the smallest size is applied.
  const pulledW = hx < 0 ? x1 - x : hx > 0 ? x - x0 : w0;
  const pulledH = hy < 0 ? y1 - y : hy > 0 ? y - y0 : h0;
  let factor = hx && hy ? Math.max(pulledW / w0, pulledH / h0) : hx ? pulledW / w0 : pulledH / h0;
  // Smallest size: both sides, or for a box that is already thinner than that, its longer side.
  factor = Math.max(factor, MIN_SIZE / (Math.min(w0, h0) >= MIN_SIZE ? Math.min(w0, h0) : Math.max(w0, h0)));
  // Where the box may grow to: the fixed side stays, an edge handle grows around the middle of the other direction.
  const room = (lo: number, hi: number, side: number, max: number) =>
    Math.max(MIN_SIZE, side < 0 ? hi : side > 0 ? max - lo : 2 * Math.min((lo + hi) / 2, max - (lo + hi) / 2));
  factor = Math.min(factor, room(x0, x1, hx, size.width) / w0, room(y0, y1, hy, size.height) / h0);
  const w = w0 * factor;
  const h = h0 * factor;
  const span = (lo: number, hi: number, side: number, length: number): [number, number] =>
    side < 0 ? [hi - length, hi] : side > 0 ? [lo, lo + length] : [(lo + hi) / 2 - length / 2, (lo + hi) / 2 + length / 2];
  const [nx0, nx1] = span(x0, x1, hx, w);
  const [ny0, ny1] = span(y0, y1, hy, h);
  return [nx0, ny0, nx1, ny1];
}

/** The comment fitted into a new box: its box, freehand strokes and line ends are mapped along. */
export function resizeAnnot(a: Annot, box: Box): Annot {
  const [x0, y0, x1, y1] = a.box;
  const sx = (box[2] - box[0]) / (x1 - x0);
  const sy = (box[3] - box[1]) / (y1 - y0);
  const map = ([x, y]: Pt): Pt => [box[0] + (x - x0) * sx, box[1] + (y - y0) * sy];
  const strokes = a.strokes?.map((s) => s.map(map));
  const line = a.line && ([map(a.line[0]), map(a.line[1])] as [Pt, Pt]);
  // Freehand and lines are saved by their points, not by the box, so the box follows them.
  return { ...a, box: strokes ? boundsOf(strokes.flat(), 1.5) : line ? boundsOf(line, 2) : box, strokes, line };
}

/** A line with one end pulled to a point on the page; it never gets shorter than `MIN_SIZE`. */
export function dragLineEnd(a: Annot, end: LineEnd, [px, py]: Pt, size: Size): Annot {
  const [p, q] = a.line ?? [[a.box[0], a.box[1]], [a.box[2], a.box[3]]];
  const to: Pt = [clamp(px, 0, size.width), clamp(py, 0, size.height)];
  const line: [Pt, Pt] = end === 'start' ? [to, q] : [p, to];
  if (Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]) < MIN_SIZE) return a;
  return { ...a, line, box: boundsOf(line, 2) };
}

/** What can be pulled on a comment: its box, the two ends of a line, or nothing. */
export const gripOf = (a: Annot): 'box' | 'ends' | null => {
  if (isMarkup(a.kind) || a.kind === 'note') return null;
  return a.kind === 'line' || a.kind === 'arrow' ? 'ends' : 'box';
};

/** Pictures and stamps keep their shape, and so do tick boxes and round buttons. Shift turns this around. */
export const keepsRatio = (a: Annot) => a.kind === 'stamp' || (a.kind === 'field' && (a.field?.type === 'check' || a.field?.type === 'radio'));

/** A comment after pulling one of its handles to a point; `shift` turns the shape-keeping around. */
export function dragHandle(a: Annot, handle: Handle | LineEnd, p: Pt, { shift, size }: { shift: boolean; size: Size }): Annot {
  if (handle === 'start' || handle === 'end') return dragLineEnd(a, handle, p, size);
  return resizeAnnot(a, dragBox(a.box, handle, p, { keepRatio: keepsRatio(a) !== shift, size }));
}

/** The distance to move a box so that it stays on the page. A box that already sticks out may still be moved back. */
export const clampShift = (box: Box, dx: number, dy: number, size: Size): Pt => [
  clamp(dx, Math.min(0, -box[0]), Math.max(0, size.width - box[2])),
  clamp(dy, Math.min(0, -box[1]), Math.max(0, size.height - box[3])),
];

/** The mouse pointer for a handle; a page turned by 90 or 270 degrees swaps the diagonals and the straight ones. */
export function cursorOf(handle: Handle, rotation: number): string {
  const [hx, hy] = SIDES[handle];
  const sideways = Math.abs(rotation % 180) === 90;
  if (hx && hy) return (hx === hy) !== sideways ? 'nwse-resize' : 'nesw-resize';
  return (hx !== 0) !== sideways ? 'ew-resize' : 'ns-resize';
}
