// Browser boundary: opening and rendering with PDF.js, and triggering downloads.
// The legacy build polyfills newer JS features, so older browsers (and Safari) work too.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { BuildSource } from './build';
import type { PageRef } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface SourceDoc extends BuildSource {
  id: string;
  name: string;
  view: PDFDocumentProxy;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}${nextId++}`;

/** Opens a file and returns the document and its pages. The bytes never leave the browser. */
export async function openPdf(file: File): Promise<{ doc: SourceDoc; pages: PageRef[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let view: PDFDocumentProxy;
  try {
    // PDF.js may transfer the buffer to its worker, so hand it a copy.
    view = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch (err) {
    if ((err as Error)?.name === 'PasswordException') {
      throw new Error(`„${file.name}“ ist passwortgeschützt. Das wird noch nicht unterstützt.`);
    }
    throw new Error(`„${file.name}“ konnte nicht als PDF gelesen werden.`);
  }
  const doc: SourceDoc = { id: uid('d'), name: file.name, bytes, view, lib: null };
  const pages = Array.from({ length: view.numPages }, (_, i) => ({
    id: uid('p'),
    docId: doc.id,
    srcIndex: i,
    rotation: 0,
  }));
  return { doc, pages };
}

export const closePdf = (doc: SourceDoc) => doc.view.loadingTask.destroy();

/** Renders one page into a canvas and returns it as an object URL. */
export async function renderPage(
  doc: SourceDoc,
  srcIndex: number,
  { width = 200, rotation = 0 } = {},
): Promise<string> {
  const page = await doc.view.getPage(srcIndex + 1);
  const rotate = (page.rotate + rotation) % 360;
  const base = page.getViewport({ scale: 1, rotation: rotate });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr, rotation: rotate });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) throw new Error('Seite konnte nicht gerendert werden.');
  return URL.createObjectURL(blob);
}

export function download(bytes: Uint8Array, name: string, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
