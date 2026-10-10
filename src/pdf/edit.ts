// Changing what a page already contains. MuPDF can cut text and pictures out of a page (the
// same step that real redaction uses); the changed content is then written in at the place.
import type { PDFDocument, PDFPage } from 'mupdf';
import { replacementFont, type Edit } from '../core/edits';
import type { Box } from '../core/textLayer';
import { embedPicture, embedText } from './embed';
import type { Mupdf } from './mupdf';

/** Removes what lies under the boxes: text only, or pictures only. */
function cut(page: PDFPage, boxes: Box[], what: 'text' | 'images') {
  if (!boxes.length) return;
  for (const box of boxes) {
    const annot = page.createAnnotation('Redact');
    annot.setRect(box);
    annot.update();
  }
  // No black boxes: the place is left empty.
  const removeImages = what === 'images' ? 1 : 0;
  page.applyRedactions(false, removeImages, 0, what === 'text' ? 0 : 1);
}

export function applyEdits(engine: Mupdf, doc: PDFDocument, page: PDFPage, edits: Edit[]) {
  cut(page, edits.filter((e) => e.kind === 'text').map((e) => e.box), 'text');
  cut(page, edits.filter((e) => e.kind === 'image').map((e) => e.box), 'images');
  for (const e of edits) {
    if (e.kind === 'text') {
      if (!e.text.trim()) continue;
      embedText(engine, doc, page, {
        text: e.text,
        x: e.baseline[0],
        y: e.baseline[1] - e.size * 0.92,
        width: 0,
        size: e.size,
        color: e.color,
        font: replacementFont(e.font),
      });
    } else if (e.target) {
      embedPicture(engine, doc, page, { png: e.png, box: e.target });
    }
  }
}
