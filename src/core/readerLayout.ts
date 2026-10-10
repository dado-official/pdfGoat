// Geometry of the reading view: how big each page is on screen and where it sits.
// Pure numbers, so it can be tested without a browser.

export type Zoom = { kind: 'width' } | { kind: 'page' } | { kind: 'percent'; value: number };

export interface Size {
  width: number;
  height: number;
}

/** A PDF point is 1/72 inch, a CSS pixel 1/96 inch: at 100 % one point is this many pixels. */
export const PX_PER_PT = 96 / 72;

export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** Space around the pages and between them, in pixels. */
export const PAD = 24;
export const GAP = 16;

/** Used for a damaged page, which has no size of its own. */
export const FALLBACK_SIZE: Size = { width: 595, height: 842 };

const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

/** Page size as shown after an extra turn by `rotation` degrees. */
export function turnedSize(size: Size, rotation: number): Size {
  return rotation % 180 === 0 ? size : { width: size.height, height: size.width };
}

/** Pixels per point for a zoom setting. The common scale is set by the widest and tallest page. */
export function scaleFor(zoom: Zoom, sizes: readonly Size[], viewport: Size): number {
  if (zoom.kind === 'percent') return clamp((zoom.value / 100) * PX_PER_PT);
  if (!sizes.length) return PX_PER_PT;
  const maxWidth = Math.max(...sizes.map((s) => s.width));
  const byWidth = (viewport.width - 2 * PAD) / maxWidth;
  if (zoom.kind === 'width') return clamp(byWidth);
  const maxHeight = Math.max(...sizes.map((s) => s.height));
  return clamp(Math.min(byWidth, (viewport.height - 2 * PAD) / maxHeight));
}

export const percentOf = (scale: number) => Math.round((scale / PX_PER_PT) * 100);

/** The next zoom step above or below the current percentage. */
export function stepZoom(percent: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((s) => s > percent) ?? ZOOM_STEPS.at(-1)!;
  return [...ZOOM_STEPS].reverse().find((s) => s < percent) ?? ZOOM_STEPS[0];
}

export interface Layout {
  tops: number[];
  heights: number[];
  widths: number[];
  /** Height of the whole scrolling content. */
  total: number;
}

export function layoutPages(sizes: readonly Size[], scale: number): Layout {
  const widths = sizes.map((s) => Math.round(s.width * scale));
  const heights = sizes.map((s) => Math.round(s.height * scale));
  const tops: number[] = [];
  let y = PAD;
  for (const h of heights) {
    tops.push(y);
    y += h + GAP;
  }
  return { tops, heights, widths, total: y - GAP + PAD };
}

/** Index of the page that contains the vertical position `y`, or the nearest one. */
export function pageAt(layout: Layout, y: number): number {
  const { tops, heights } = layout;
  if (!tops.length) return 0;
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  // In the gap below a page, the closer neighbour wins.
  const next = lo + 1;
  if (next < tops.length && y > tops[lo] + heights[lo] && tops[next] - y < y - (tops[lo] + heights[lo])) return next;
  return lo;
}
