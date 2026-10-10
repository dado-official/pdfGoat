// Comments in MuPDF: finding the ones a file already has, deleting them, and writing new ones
// as real PDF annotations. No DOM here, so it runs in the workers and in Node tests.
import type { PDFAnnotation, PDFPage, Quad } from 'mupdf';
import { rgb, type Annot } from '../core/annotations';
import type { Mupdf } from './mupdf';

/** Types that are not comments: links, form fields and the pop-ups that belong to a comment. */
const NOT_COMMENTS = new Set(['Link', 'Widget', 'Popup']);

/** The annotations of a page that count as comments. Their position in this list identifies them. */
export const listComments = (page: PDFPage): PDFAnnotation[] => page.getAnnotations().filter((a) => !NOT_COMMENTS.has(a.getType()));

/** Deletes comments by their position in `listComments`. */
export function deleteComments(page: PDFPage, positions: readonly number[]) {
  const all = listComments(page);
  for (const i of positions) {
    const annot = all[i];
    if (annot) page.deleteAnnotation(annot);
  }
}

const quadOf = ([x0, y0, x1, y1]: readonly number[]): Quad => [x0, y0, x1, y0, x0, y1, x1, y1];

/** Writes one comment onto a page. The page's coordinates are the same as the ones the comment uses. */
export function addComment(engine: Mupdf, page: PDFPage, a: Annot) {
  const color = rgb(a.color);
  const width = a.width ?? 1.5;
  const date = new Date(a.created);
  const finish = (annot: PDFAnnotation) => {
    if (a.contents && annot.getType() !== 'FreeText') annot.setContents(a.contents);
    annot.setCreationDate(date);
    annot.setModificationDate(date);
    annot.update();
  };

  switch (a.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      const annot = page.createAnnotation(a.kind === 'highlight' ? 'Highlight' : a.kind === 'underline' ? 'Underline' : 'StrikeOut');
      annot.setColor(color);
      annot.setQuadPoints((a.quads ?? [a.box]).map(quadOf));
      return finish(annot);
    }
    case 'note': {
      const annot = page.createAnnotation('Text');
      annot.setColor(color);
      annot.setRect([a.box[0], a.box[1], a.box[0] + 20, a.box[1] + 20]);
      annot.setIcon('Comment');
      return finish(annot);
    }
    case 'text': {
      const annot = page.createAnnotation('FreeText');
      annot.setRect(a.box);
      annot.setDefaultAppearance('Helv', a.fontSize ?? 12, color);
      annot.setContents(a.contents);
      annot.setBorderWidth(0);
      return finish(annot);
    }
    case 'ink': {
      const annot = page.createAnnotation('Ink');
      annot.setColor(color);
      annot.setBorderWidth(width);
      annot.setInkList((a.strokes ?? []).map((s) => s.map(([x, y]) => [x, y] as [number, number])));
      return finish(annot);
    }
    case 'square':
    case 'circle': {
      const annot = page.createAnnotation(a.kind === 'square' ? 'Square' : 'Circle');
      annot.setColor(color);
      annot.setBorderWidth(width);
      annot.setRect(a.box);
      return finish(annot);
    }
    case 'line':
    case 'arrow': {
      const [p, q] = a.line ?? [[a.box[0], a.box[1]], [a.box[2], a.box[3]]];
      const annot = page.createAnnotation('Line');
      annot.setColor(color);
      annot.setBorderWidth(width);
      annot.setLine(p, q);
      if (a.kind === 'arrow') annot.setLineEndingStyles('None', 'OpenArrow');
      return finish(annot);
    }
    case 'stamp': {
      const annot = page.createAnnotation('Stamp');
      annot.setRect(a.box);
      if (a.image) annot.setStampImage(new engine.Image(a.image));
      return finish(annot);
    }
  }
}
