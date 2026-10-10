// Paper sizes in points (1/72 inch), portrait, and the conversions the page tools need.
import { screenToPage } from './annotations';
import type { Size } from './readerLayout';
import type { Box } from './textLayer';

export const PAPERS = {
  a3: [842, 1191],
  a4: [595, 842],
  a5: [420, 595],
  letter: [612, 792],
  legal: [612, 1008],
} as const;
export type PaperName = keyof typeof PAPERS;
export const PAPER_NAMES = Object.keys(PAPERS) as PaperName[];

export type Orientation = 'portrait' | 'landscape' | 'keep';

/** The size for a paper and orientation; `keep` takes the shape of the page that is being changed. */
export function paperSize(name: PaperName, orientation: Orientation, current: Size): [number, number] {
  const [w, h] = PAPERS[name];
  const landscape = orientation === 'keep' ? current.width > current.height : orientation === 'landscape';
  return landscape ? [h, w] : [w, h];
}

export const MM = 72 / 25.4;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The visible area for margins (in points) cut from the page as it is shown. `size` is the page's
 * own size and `rotation` the extra turn, so the margins follow what the user sees. The result is
 * in the page's own space, where the page keeps its crop.
 */
export function cropFromMargins(size: Size, rotation: number, m: Margins): Box | null {
  const shown = rotation % 180 === 0 ? size : { width: size.height, height: size.width };
  const left = m.left;
  const top = m.top;
  const right = shown.width - m.right;
  const bottom = shown.height - m.bottom;
  if (right - left < 10 || bottom - top < 10) return null;
  const a = screenToPage(left, top, size, rotation, 1);
  const b = screenToPage(right, bottom, size, rotation, 1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
