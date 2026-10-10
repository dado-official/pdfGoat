// Text found by text recognition: the words of a page with their boxes in page points. They are
// written into the saved file as invisible text, so the page can be searched and copied from.
import type { TextLine } from '../pdf/view';
import type { Box } from './textLayer';

export interface OcrWord {
  text: string;
  /** Left, top, right, bottom in page points, y pointing down. */
  box: Box;
}

/** Words below this confidence (0 to 100) are dropped: they are mostly noise from smudges and edges. */
export const MIN_CONFIDENCE = 30;

/** Font size for a word, from the height of its box. */
export const wordSize = (box: Box) => Math.max(4, (box[3] - box[1]) * 0.8);

/** Baseline of a word: a little above the bottom of its box. */
export const wordBaseline = (box: Box) => box[3] - (box[3] - box[1]) * 0.2;

/**
 * The words in reading order: top to bottom, and left to right within a line of text. Words whose
 * baselines differ by less than half a font size count as one line.
 */
export function inReadingOrder(words: readonly OcrWord[]): OcrWord[] {
  const byTop = [...words].sort((a, b) => wordBaseline(a.box) - wordBaseline(b.box));
  const lines: OcrWord[][] = [];
  for (const w of byTop) {
    const last = lines.at(-1);
    if (last && Math.abs(wordBaseline(w.box) - wordBaseline(last[0].box)) < wordSize(w.box) * 0.5) last.push(w);
    else lines.push([w]);
  }
  return lines.flatMap((line) => line.sort((a, b) => a.box[0] - b.box[0]));
}

/** The words as lines of text for the text layer of the reading view and for text export (one line per word). */
export const ocrLines = (words: readonly OcrWord[]): TextLine[] =>
  inReadingOrder(words).map((w) => ({
    text: w.text,
    x: w.box[0],
    y: wordBaseline(w.box),
    dx: 1,
    dy: 0,
    size: wordSize(w.box),
    length: Math.max(1, w.box[2] - w.box[0]),
    color: '#14161a',
    font: { serif: false, mono: false, bold: false, italic: false },
  }));
