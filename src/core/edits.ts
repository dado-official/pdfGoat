// Changes to what a page already contains. Text is changed line by line: the old line is removed
// and the new one written in its place. A picture can be removed, moved, resized or replaced.
import type { Box } from './textLayer';

/** What a font looks like, as far as the replacement font needs to know. */
export interface FontStyle {
  serif: boolean;
  mono: boolean;
  bold: boolean;
  italic: boolean;
}

export type Edit =
  | {
      id: string;
      kind: 'text';
      /** The line as it was, to show and to find again. */
      original: string;
      /** The line's box on the page, in page points. */
      box: Box;
      /** Start of the baseline of the original line. */
      baseline: [number, number];
      size: number;
      color: string;
      font: FontStyle;
      text: string;
    }
  | {
      id: string;
      kind: 'image';
      /** The picture's box on the page as it is now. */
      box: Box;
      /** Where it goes; null removes it. */
      target: Box | null;
      /** The picture itself as PNG, taken from the page when the edit was made, or a replacement. */
      png: Uint8Array;
    };

/** The standard font that looks most like the original one. */
export function replacementFont({ serif, mono, bold, italic }: FontStyle): string {
  if (mono) return ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'][(bold ? 1 : 0) + (italic ? 2 : 0)];
  if (serif) return ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'][(bold ? 1 : 0) + (italic ? 2 : 0)];
  return ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'][(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** The box of a line of text for removing it: from just above the capitals to just below the baseline. */
export function lineBox(x: number, y: number, length: number, size: number): Box {
  return [x - 0.5, y - size * 0.78, x + length + 0.5, y + size * 0.22];
}

/** A box scaled around its centre. */
export function scaleBox([x0, y0, x1, y1]: Box, factor: number): Box {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = ((x1 - x0) * factor) / 2;
  const h = ((y1 - y0) * factor) / 2;
  return [cx - w, cy - h, cx + w, cy + h];
}

/** The same box moved. */
export const moveBox = ([x0, y0, x1, y1]: Box, dx: number, dy: number): Box => [x0 + dx, y0 + dy, x1 + dx, y1 + dy];

/** A colour from MuPDF (grey, RGB or CMYK components between 0 and 1) as #rrggbb. */
export function colorHex(c: readonly number[] | undefined): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  if (!c?.length) return '#14161a';
  if (c.length === 1) return `#${to(c[0]).repeat(3)}`;
  if (c.length === 3) return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
  if (c.length === 4) return `#${to((1 - c[0]) * (1 - c[3]))}${to((1 - c[1]) * (1 - c[3]))}${to((1 - c[2]) * (1 - c[3]))}`;
  return '#14161a';
}
