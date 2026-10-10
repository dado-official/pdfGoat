// Header, footer, page numbers and watermarks: one text that every page it is given to shows.
// The text can contain {n} (the page's number in the saved file), {total} and {date}.

export type MarkPlace = 'topLeft' | 'topCenter' | 'topRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight' | 'center';

export interface Mark {
  id: string;
  text: string;
  place: MarkPlace;
  /** Font size in points. */
  size: number;
  /** #rrggbb. */
  color: string;
  /** 0 to 1. */
  opacity: number;
  /** Turned diagonally across the page; only for the centre. */
  diagonal: boolean;
}

export const MARK_PLACES: readonly MarkPlace[] = ['topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight', 'center'];

/** Margin from the page edge, in points. */
export const MARK_MARGIN = 36;

/** The text of a mark on one page. */
export function markText(mark: Mark, number: number, total: number, date: string): string {
  return mark.text.replaceAll('{n}', String(number)).replaceAll('{total}', String(total)).replaceAll('{date}', date);
}

/**
 * Where a text of `width` points sits on a page of `page` points: left edge and top of its box.
 * `size` is the font size; the box is one line high.
 */
export function markPosition(place: MarkPlace, page: { width: number; height: number }, width: number, size: number): { x: number; y: number } {
  const line = size * 1.2;
  const x =
    place.endsWith('Left') ? MARK_MARGIN
    : place.endsWith('Right') ? page.width - MARK_MARGIN - width
    : (page.width - width) / 2;
  const y = place.startsWith('top') ? MARK_MARGIN : place.startsWith('bottom') ? page.height - MARK_MARGIN - line : (page.height - line) / 2;
  return { x, y };
}
