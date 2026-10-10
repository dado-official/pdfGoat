// Changes to what a page already contains. Text is changed line by line: the old line is removed
// and the new one written in its place. A picture can be removed, moved, resized or replaced.
import type { Box } from './textLayer';

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
