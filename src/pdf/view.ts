// The page's door to the opened files: opening them and rendering their pages. The files live
// in a worker next to the engine's WebAssembly, so the page stays responsive.
import { AppError } from '../core/errors';
import { checkFileSize, MAX_FILE_BYTES, toMegabytes } from '../core/limits';
import type { Annot } from '../core/annotations';
import type { PageRef } from '../core/types';
import type { BuildSource } from './build';
import type { FormField } from './forms';
import type { Inspection } from './protect';
import type {
  Box,
  FileComment,
  OpenResult,
  OutlineNode,
  PageLink,
  TextLine,
  ViewRequest,
  ViewResponse,
} from './view.worker';

export type { Inspection };
export type { Box, FileComment, FormField, OutlineNode, PageLink, TextLine };

export interface SourceDoc extends BuildSource {
  /** The file on disk, when it was opened in a way that allows writing it back. */
  handle?: import('../features/open/fileAccess').FileHandle;
  id: string;
  name: string;
  /** Page sizes in points as shown, by page index; null for a damaged page. */
  sizes: OpenResult['sizes'];
}

export interface OpenedPdf {
  doc: SourceDoc;
  pages: PageRef[];
  /** True when the file is large enough that the user should be warned. */
  large: boolean;
  /** True when the file is protected; saving writes it without protection. */
  encrypted: boolean;
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

let worker: Worker | null = null;
let nextCall = 1;
const calls = new Map<number, { resolve: (value: unknown) => void; reject: (err: unknown) => void }>();

function start(): Worker {
  const w = new Worker(new URL('./view.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }: MessageEvent<ViewResponse>) => {
    const call = calls.get(data.id);
    if (!call) return;
    calls.delete(data.id);
    if (data.ok) call.resolve(data.result);
    else call.reject(data.code ? new AppError(data.code, data.params) : new Error(data.message));
  };
  w.onerror = (e) => {
    // The worker is gone; everything waiting fails, and the next call starts a new one.
    worker = null;
    const waiting = [...calls.values()];
    calls.clear();
    for (const call of waiting) call.reject(new Error(e.message || 'The PDF engine failed to start.'));
  };
  return w;
}

function call<T>(request: Distribute<ViewRequest>, transfer: Transferable[] = []): Promise<T> {
  const id = nextCall++;
  worker ??= start();
  return new Promise<T>((resolve, reject) => {
    calls.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker!.postMessage({ ...request, id }, { transfer });
  });
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

let nextId = 1;
const uid = (prefix: string) => `${prefix}${nextId++}`;

/** Opens a file and returns the document and its pages. The bytes never leave the browser. */
export async function openPdf(file: File, password?: string): Promise<OpenedPdf> {
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
  const id = uid('d');
  // The worker takes over the buffer it is given, so it gets a copy when we keep the bytes.
  const bytes = keepBytes ? data.slice() : data;
  const { pageCount, encrypted, sizes } = await call<OpenResult>(
    { type: 'open', docId: id, name, bytes, password },
    [bytes.buffer],
  );

  const doc: SourceDoc = {
    id,
    name,
    sizes,
    byteLength: file.size,
    password,
    read: keepBytes ? async () => data : () => readFile(file),
  };
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    id: uid('p'),
    docId: id,
    srcIndex: i,
    rotation: 0,
  }));
  return { doc, pages, large: verdict === 'warn', encrypted };
}

/** Renders one page and returns it as PNG bytes. */
export async function renderPageBytes(
  doc: SourceDoc,
  srcIndex: number,
  { width = 200, rotation = 0, dpr = 1, hidden, annots, fields, hideForms }: { width?: number; rotation?: number; dpr?: number; hidden?: number[]; annots?: Annot[]; fields?: Record<number, string>; hideForms?: boolean } = {},
): Promise<Uint8Array> {
  try {
    return await call<Uint8Array>({
      type: 'render',
      docId: doc.id,
      pageIndex: srcIndex,
      width: Math.round(width * dpr),
      rotation: ((rotation % 360) + 360) % 360,
      hidden,
      annots,
      fields,
      hideForms,
    });
  } catch {
    throw new AppError('renderFailed');
  }
}

/** Renders one page and returns it as an object URL. */
export async function renderPage(
  doc: SourceDoc,
  srcIndex: number,
  { width = 200, rotation = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), hidden, annots, fields, hideForms }: { width?: number; rotation?: number; dpr?: number; hidden?: number[]; annots?: Annot[]; fields?: Record<number, string>; hideForms?: boolean } = {},
): Promise<string> {
  try {
    const png = await call<Uint8Array>({
      type: 'render',
      docId: doc.id,
      pageIndex: srcIndex,
      width: Math.round(width * dpr),
      rotation: ((rotation % 360) + 360) % 360,
      hidden,
      annots,
      fields,
      hideForms,
    });
    return URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
  } catch {
    throw new AppError('renderFailed');
  }
}

/** Draws the first page of a finished PDF as PNG bytes. */
export async function renderBytesPng(bytes: Uint8Array, width: number): Promise<Uint8Array> {
  try {
    return await call<Uint8Array>({ type: 'renderBytes', bytes, width: Math.round(width) });
  } catch {
    throw new AppError('renderFailed');
  }
}

/** Draws the first page of a finished PDF. */
export async function renderBytes(bytes: Uint8Array, width: number, dpr = 1): Promise<string> {
  try {
    const png = await call<Uint8Array>({ type: 'renderBytes', bytes, width: Math.round(width * dpr) });
    return URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
  } catch {
    throw new AppError('renderFailed');
  }
}

export const closePdf = (doc: SourceDoc) => call({ type: 'close', docId: doc.id });

/** The text of one page with positions, for selecting and copying. */
export const getText = (doc: SourceDoc, srcIndex: number) =>
  call<TextLine[]>({ type: 'text', docId: doc.id, pageIndex: srcIndex });

/** Boxes of every match of `needle` on one page. */
export const searchPage = (doc: SourceDoc, srcIndex: number, needle: string) =>
  call<Box[][]>({ type: 'search', docId: doc.id, pageIndex: srcIndex, needle });

/** The bookmarks of a file. */
export const getOutline = (doc: SourceDoc) => call<OutlineNode[]>({ type: 'outline', docId: doc.id });

/** The links on one page. */
export const getLinks = (doc: SourceDoc, srcIndex: number) =>
  call<PageLink[]>({ type: 'links', docId: doc.id, pageIndex: srcIndex });

/** The comments that a file already has on one page. */
export const getComments = (doc: SourceDoc, srcIndex: number) =>
  call<FileComment[]>({ type: 'comments', docId: doc.id, pageIndex: srcIndex });

/** The boxes of the pictures on one page. */
export const getImages = (doc: SourceDoc, srcIndex: number) =>
  call<Box[]>({ type: 'images', docId: doc.id, pageIndex: srcIndex });

/** One picture of a page as PNG bytes; `index` counts in the order of `getImages`. */
export const getImagePng = (doc: SourceDoc, srcIndex: number, index: number) =>
  call<Uint8Array>({ type: 'imagePng', docId: doc.id, pageIndex: srcIndex, index });

/** The form fields on one page. */
export const getFields = (doc: SourceDoc, srcIndex: number) =>
  call<FormField[]>({ type: 'fields', docId: doc.id, pageIndex: srcIndex });

/** What a file carries along: metadata, comments, attachments and more. */
export const inspectDoc = (doc: SourceDoc) => call<Inspection>({ type: 'inspect', docId: doc.id });
