// Protecting and cleaning: real redaction, checking what a file carries along, and taking it out.
// No DOM here, so it runs in the workers and in Node tests.
import type { PDFAnnotation, PDFDocument, PDFPage } from 'mupdf';
import type { Cleaning } from '../core/protect';
import type { Box } from '../core/textLayer';
import { listComments } from './annotate';
import { embedFill } from './embed';
import type { Mupdf } from './mupdf';

const intersects = (a: readonly number[], b: readonly number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Removes everything under the boxes from a page for good: text, parts of pictures and drawn lines
 * are taken out of the page's content and the area is filled black. Annotations, links and form
 * fields that touch a box are deleted too.
 *
 * The boxes of text found by a search are as tall as the font allows, which reaches into the lines
 * above and below. Text is therefore only removed where it meets the box without its top and
 * bottom edge; pictures and lines are cut at the full box.
 */
export function redactPage(engine: Mupdf, page: PDFPage, boxes: Box[]) {
  if (!boxes.length) return;
  const doc = page._doc;
  const touching = (a: PDFAnnotation) => {
    try {
      return boxes.some((b) => intersects(a.getBounds(), b));
    } catch {
      return false;
    }
  };
  for (const a of page.getAnnotations()) if (touching(a)) page.deleteAnnotation(a);

  const apply = (rects: Box[], images: number, lines: number, text: number) => {
    for (const box of rects) {
      const redact = page.createAnnotation('Redact');
      redact.setRect(box);
      redact.update();
    }
    // The black fill is drawn separately, so it can be as large as the box.
    page.applyRedactions(false, images, lines, text);
  };
  apply(
    boxes.map(([x0, y0, x1, y1]) => {
      const inset = Math.min(4, (y1 - y0) * 0.25);
      return [x0, y0 + inset, x1, y1 - inset] as Box;
    }),
    0, // pictures: left for the next step
    0, // lines: left for the next step
    0, // text: removed
  );
  // Pictures lose the pixels under the box, lines are removed when they touch it; text stays as it is now.
  apply(boxes, 2, 2, 1);
  for (const box of boxes) embedFill(engine, doc, page, box, '#000000');
}

/** What a file carries along, for the check before it is given away. */
export interface Inspection {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  created: string;
  modified: string;
  xmp: boolean;
  attachments: string[];
  comments: number;
  layers: number;
  thumbnails: number;
  scripts: boolean;
  fields: number;
}

const INFO = { title: 'Title', author: 'Author', subject: 'Subject', keywords: 'Keywords', creator: 'Creator', producer: 'Producer', created: 'CreationDate', modified: 'ModDate' } as const;

export function inspectPdf(doc: PDFDocument): Inspection {
  const root = doc.getTrailer().get('Root');
  const info = (key: string) => {
    try {
      return doc.getMetaData(`info:${key}`) ?? '';
    } catch {
      return '';
    }
  };
  let comments = 0;
  let thumbnails = 0;
  let fields = 0;
  const count = doc.countPages();
  for (let i = 0; i < count; i++) {
    try {
      const page = doc.loadPage(i);
      comments += listComments(page).length;
      fields += page.getWidgets().length;
      if (!page.getObject().get('Thumb').isNull()) thumbnails++;
      page.destroy();
    } catch {
      // A damaged page adds nothing to the counts.
    }
  }
  let layers = 0;
  try {
    layers = doc.countLayers();
  } catch {
    // Not every file has layers.
  }
  let attachments: string[] = [];
  try {
    attachments = Object.keys(doc.getEmbeddedFiles());
  } catch {
    // Not every file has attachments.
  }
  const names = root.get('Names');
  const open = root.get('OpenAction');
  return {
    ...(Object.fromEntries(Object.entries(INFO).map(([k, v]) => [k, info(v)])) as Pick<Inspection, keyof typeof INFO>),
    xmp: !root.get('Metadata').isNull(),
    attachments,
    comments,
    layers,
    thumbnails,
    scripts: (open.isDictionary() && !open.get('JS').isNull()) || (names.isDictionary() && !names.get('JavaScript').isNull()) || !root.get('AA').isNull(),
    fields,
  };
}

/** Takes the chosen things out of a file that is about to be saved. */
export function cleanPdf(doc: PDFDocument, what: Cleaning) {
  const root = doc.getTrailer().get('Root');
  if (what.metadata) {
    for (const key of Object.values(INFO)) {
      if (key === 'Producer') continue; // PDFgoat sets its own name afterwards
      try {
        doc.setMetaData(`info:${key}`, '');
      } catch {
        // Not every key can be set.
      }
    }
    root.delete('Metadata');
  }
  if (what.attachments) {
    try {
      for (const name of Object.keys(doc.getEmbeddedFiles())) doc.deleteEmbeddedFile(name);
    } catch {
      // Nothing to remove.
    }
  }
  if (what.scripts) {
    root.delete('OpenAction');
    root.delete('AA');
    const names = root.get('Names');
    if (names.isDictionary()) names.delete('JavaScript');
  }
  const count = doc.countPages();
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    try {
      if (what.thumbnails) page.getObject().delete('Thumb');
      if (what.scripts) page.getObject().delete('AA');
      if (what.comments) for (const a of listComments(page)) page.deleteAnnotation(a);
    } finally {
      page.destroy();
    }
  }
}
