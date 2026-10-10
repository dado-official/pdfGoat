// Holds the opened files and renders their pages, away from the page. Saving runs in its own
// worker (engine.worker.ts), so a long save never stops the previews.
import type { PDFDocument } from 'mupdf';
import { loadMupdf } from './mupdf';
import { AppError, type ErrorCode, type ErrorParams } from '../core/errors';

export type ViewRequest =
  | { id: number; type: 'open'; docId: string; name: string; bytes: Uint8Array; password?: string }
  | { id: number; type: 'render'; docId: string; pageIndex: number; width: number; rotation: number }
  | { id: number; type: 'close'; docId: string };

export type ViewResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code?: ErrorCode; params?: ErrorParams; message: string };

export interface OpenResult {
  pageCount: number;
  /** True when the file is protected; it was opened with the given password or needs none. */
  encrypted: boolean;
}

const docs = new Map<string, PDFDocument>();

// MuPDF starts with top-level await. A module that waits on it would miss the first messages,
// so it is loaded on the first request instead of at the top of this file.
const loadEngine = loadMupdf;
type Engine = Awaited<ReturnType<typeof loadEngine>>;

function open(engine: Engine, { docId, name, bytes, password }: Extract<ViewRequest, { type: 'open' }>): OpenResult {
  let doc: PDFDocument;
  try {
    doc = new engine.PDFDocument(bytes);
  } catch {
    throw new AppError('notPdf', { name });
  }
  if (doc.needsPassword() && !doc.authenticatePassword(password ?? '')) {
    doc.destroy();
    throw new AppError(password === undefined ? 'passwordRequired' : 'passwordWrong', { name });
  }
  docs.set(docId, doc);
  return { pageCount: doc.countPages(), encrypted: !doc.getTrailer().get('Encrypt').isNull() };
}

/** Renders a page to a PNG that is `width` pixels wide, turned clockwise by `rotation` on top of its own. */
function render(engine: Engine, { docId, pageIndex, width, rotation }: Extract<ViewRequest, { type: 'render' }>): Uint8Array {
  const doc = docs.get(docId);
  if (!doc) throw new AppError('renderFailed');
  // A damaged file can list pages that do not exist; MuPDF would draw them empty.
  let exists = false;
  try {
    exists = pageIndex < doc.countPages() && doc.findPage(pageIndex).isDictionary();
  } catch {
    // treated as missing
  }
  if (!exists) throw new AppError('renderFailed');
  const page = doc.loadPage(pageIndex);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const turned = rotation % 180 !== 0;
    const scale = width / (turned ? y1 - y0 : x1 - x0);
    const matrix = engine.Matrix.concat(engine.Matrix.scale(scale, scale), engine.Matrix.rotate(rotation));
    const pixmap = page.toPixmap(matrix, engine.ColorSpace.DeviceRGB, false, true);
    try {
      return pixmap.asPNG().slice();
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

const post = (message: ViewResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = async ({ data }: MessageEvent<ViewRequest>) => {
  try {
    const engine = await loadEngine();
    switch (data.type) {
      case 'open':
        return post({ id: data.id, ok: true, result: open(engine, data) });
      case 'render': {
        const png = render(engine, data);
        return post({ id: data.id, ok: true, result: png }, [png.buffer]);
      }
      case 'close':
        docs.get(data.docId)?.destroy();
        docs.delete(data.docId);
        return post({ id: data.id, ok: true, result: null });
    }
  } catch (err) {
    if (err instanceof AppError) post({ id: data.id, ok: false, code: err.code, params: err.params, message: err.message });
    else post({ id: data.id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
