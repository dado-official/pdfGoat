// Browser boundary to PDF.js: opening files and rendering pages.
// The legacy build polyfills newer JS features, so older browsers (and Safari) work too.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { AppError } from '../core/errors';
import { checkFileSize, MAX_FILE_BYTES, toMegabytes } from '../core/limits';
import type { PageRef } from '../core/types';
import type { BuildSource } from './build';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Character maps, standard fonts and image decoders are served from our own origin
// (copied by scripts/copy-pdfjs-assets.mjs), never from a CDN. The worker fetches them,
// so the URLs must be absolute.
const asset = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

export interface SourceDoc extends BuildSource {
  id: string;
  name: string;
  view: PDFDocumentProxy;
}

/** Reads the file from disk. */
async function readFile(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    // The browser only holds a reference; the file may have been moved, changed or deleted.
    throw new AppError('fileUnreadable', { name: file.name });
  }
}

export interface OpenedPdf {
  doc: SourceDoc;
  pages: PageRef[];
  /** True when the file is large enough that the user should be warned. */
  large: boolean;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}${nextId++}`;

/** Opens a file and returns the document and its pages. The bytes never leave the browser. */
export async function openPdf(file: File): Promise<OpenedPdf> {
  const { name } = file;
  const verdict = checkFileSize(file.size);
  if (verdict === 'reject') {
    throw new AppError('tooLarge', { name, size: toMegabytes(file.size), max: toMegabytes(MAX_FILE_BYTES) });
  }

  const data = await readFile(file);
  // Normal files stay in memory, so saving still works when the file on disk is moved,
  // overwritten or deleted meanwhile (sync folders, cleaned-up downloads). Only large files
  // are read again when saving, to avoid holding them several times.
  const keepBytes = verdict === 'ok';
  let view: PDFDocumentProxy;
  try {
    view = await pdfjs.getDocument({
      // PDF.js takes over the buffer it is given, so it gets a copy when we keep the bytes.
      data: keepBytes ? data.slice() : data,
      cMapUrl: asset('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: asset('standard_fonts'),
      wasmUrl: asset('wasm'),
      iccUrl: asset('iccs'),
    }).promise;
  } catch (err) {
    throw new AppError((err as Error)?.name === 'PasswordException' ? 'encrypted' : 'notPdf', { name });
  }

  // Files with only an owner password open without asking, but are still encrypted.
  // pdf-lib cannot decrypt them, so saving would produce broken pages.
  if (await isEncrypted(view)) {
    await view.loadingTask.destroy();
    throw new AppError('encrypted', { name });
  }

  const doc: SourceDoc = {
    id: uid('d'),
    name,
    view,
    byteLength: data.byteLength,
    read: keepBytes ? async () => data : () => readFile(file),
  };
  const pages = Array.from({ length: view.numPages }, (_, i) => ({
    id: uid('p'),
    docId: doc.id,
    srcIndex: i,
    rotation: 0,
  }));
  return { doc, pages, large: verdict === 'warn' };
}

async function isEncrypted(view: PDFDocumentProxy): Promise<boolean> {
  try {
    const { info } = await view.getMetadata();
    return !!(info as { EncryptFilterName?: string | null }).EncryptFilterName;
  } catch {
    // Broken metadata is no reason to refuse a file; saving checks for encryption again.
    return false;
  }
}

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
  if (!blob) throw new AppError('renderFailed');
  return URL.createObjectURL(blob);
}
