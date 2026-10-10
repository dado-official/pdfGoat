// PDF.js is large, so it is loaded when the first file is opened, not with the start page.
import type { OpenedPdf, SourceDoc } from './pdfjs';

export type { OpenedPdf, SourceDoc };

const load = () => import('./pdfjs');

export const openPdf = async (file: File, password?: string): Promise<OpenedPdf> =>
  (await load()).openPdf(file, password);

export const renderPage = async (
  doc: SourceDoc,
  srcIndex: number,
  options?: { width?: number; rotation?: number },
): Promise<string> => (await load()).renderPage(doc, srcIndex, options);

export const closePdf = (doc: SourceDoc) => doc.view.loadingTask.destroy();
