// Draws a page of the edited document as it will be saved. Pages whose content is changed when
// saving (inserted text, header and footer, cropping, a new size) are built as a finished page
// first; the others are drawn from the opened file with their comments and form values added.
import { changesContent } from '../core/pages';
import type { PageRef } from '../core/types';
import { buildPdf } from './engine';
import { renderBytes, renderBytesPng, renderPage, renderPageBytes, type SourceDoc } from './view';

interface Options {
  /** Width in pixels of the finished (turned) page. */
  width: number;
  dpr?: number;
  /** For page numbers in header and footer. */
  number: number;
  total: number;
  date: string;
}

export async function renderFinal(page: PageRef, docs: Record<string, SourceDoc>, { width, dpr = 1, number, total, date }: Options): Promise<string> {
  if (changesContent(page)) {
    const bytes = await buildPdf([page], docs, { date, numbering: { number, total } });
    return renderBytes(bytes, width, dpr);
  }
  return renderPage(docs[page.docId], page.srcIndex, {
    width,
    rotation: page.rotation,
    dpr,
    hidden: page.removed,
    annots: page.annots,
    fields: page.fields,
  });
}

/** The same as `renderFinal`, as PNG bytes (for saving the picture of a page). */
export async function renderFinalPng(page: PageRef, docs: Record<string, SourceDoc>, { width, number, total, date }: Omit<Options, 'dpr'>): Promise<Uint8Array> {
  if (changesContent(page)) {
    const bytes = await buildPdf([page], docs, { date, numbering: { number, total } });
    return renderBytesPng(bytes, width);
  }
  return renderPageBytes(docs[page.docId], page.srcIndex, { width, rotation: page.rotation, hidden: page.removed, annots: page.annots, fields: page.fields });
}
