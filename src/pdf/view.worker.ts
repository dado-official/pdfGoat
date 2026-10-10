// Holds the opened files and renders their pages, away from the page. Saving runs in its own
// worker (engine.worker.ts), so a long save never stops the previews.
import type { PDFDocument } from 'mupdf';
import { loadMupdf } from './mupdf';
import { AppError, type ErrorCode, type ErrorParams } from '../core/errors';
import type { Annot } from '../core/annotations';
import { addComment, listComments } from './annotate';
import { applyFields, hideWidgets, listFields, type FormField } from './forms';

export type ViewRequest =
  | { id: number; type: 'open'; docId: string; name: string; bytes: Uint8Array; password?: string }
  | { id: number; type: 'render'; docId: string; pageIndex: number; width: number; rotation: number; hidden?: number[]; annots?: Annot[]; fields?: Record<number, string>; hideForms?: boolean }
  | { id: number; type: 'fields'; docId: string; pageIndex: number }
  | { id: number; type: 'renderBytes'; bytes: Uint8Array; width: number }
  | { id: number; type: 'comments'; docId: string; pageIndex: number }
  | { id: number; type: 'text'; docId: string; pageIndex: number }
  | { id: number; type: 'search'; docId: string; pageIndex: number; needle: string }
  | { id: number; type: 'outline'; docId: string }
  | { id: number; type: 'links'; docId: string; pageIndex: number }
  | { id: number; type: 'close'; docId: string };

/** A bookmark. `page` counts from 0 in the file; null when it points nowhere inside the file. */
export interface OutlineNode {
  title: string;
  page: number | null;
  children: OutlineNode[];
}

/** A comment that is already in the file. `index` is its position among the page's comments. */
export interface FileComment {
  index: number;
  type: string;
  contents: string;
  author: string;
  box: Box;
  /** Milliseconds since 1970, or 0 when the file has no date. */
  date: number;
}

/** A clickable area on a page: a jump to another page of the file, or an address. */
export interface PageLink {
  box: Box;
  page?: number;
  uri?: string;
}

/** One line of text on a page, in page points (y points down, as drawn). */
export interface TextLine {
  text: string;
  /** Start of the baseline. */
  x: number;
  y: number;
  /** Direction the text runs in, a unit vector. */
  dx: number;
  dy: number;
  /** Font size in points. */
  size: number;
  /** How far the line runs along its direction. */
  length: number;
}

/** A box on the page: left, top, right, bottom in points. */
export type Box = [number, number, number, number];

export type ViewResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code?: ErrorCode; params?: ErrorParams; message: string };

export interface OpenResult {
  pageCount: number;
  /** True when the file is protected; it was opened with the given password or needs none. */
  encrypted: boolean;
  /** Width and height of every page in points, as shown (own rotation applied); null for a page that is damaged. */
  sizes: (readonly [number, number] | null)[];
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
  const pageCount = doc.countPages();
  const sizes = Array.from({ length: pageCount }, (_, i) => pageSize(doc, i));
  return { pageCount, encrypted: !doc.getTrailer().get('Encrypt').isNull(), sizes };
}

/** A damaged file can list pages that do not exist; MuPDF would draw them empty. */
function hasPage(doc: PDFDocument, index: number): boolean {
  try {
    return index < doc.countPages() && doc.findPage(index).isDictionary();
  } catch {
    return false;
  }
}

function pageSize(doc: PDFDocument, index: number): readonly [number, number] | null {
  if (!hasPage(doc, index)) return null;
  try {
    const page = doc.loadPage(index);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      return [x1 - x0, y1 - y0];
    } finally {
      page.destroy();
    }
  } catch {
    return null;
  }
}

/** Renders a page to a PNG that is `width` pixels wide, turned clockwise by `rotation` on top of its own. */
function render(engine: Engine, { docId, pageIndex, width, rotation, hidden, annots, fields, hideForms }: Extract<ViewRequest, { type: 'render' }>): Uint8Array {
  const doc = docs.get(docId);
  if (!doc) throw new AppError('renderFailed');
  if (!hasPage(doc, pageIndex)) throw new AppError('renderFailed');
  const page = doc.loadPage(pageIndex);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const turned = rotation % 180 !== 0;
    const scale = width / (turned ? y1 - y0 : x1 - x0);
    const matrix = engine.Matrix.concat(engine.Matrix.scale(scale, scale), engine.Matrix.rotate(rotation));
    // Deleted comments are hidden for this drawing only, and new ones are added for it and taken
    // away again, so the opened file itself stays as it was read.
    const HIDDEN = 2;
    const existing = hidden?.length ? listComments(page) : [];
    const restore = (hidden ?? []).flatMap((i) => (existing[i] ? [[existing[i], existing[i].getFlags()] as const] : []));
    for (const [annot, flags] of restore) annot.setFlags(flags | HIDDEN);
    // Text and pictures that become part of the page cannot be taken back; those pages are drawn
    // from a finished copy instead (see renderBytes).
    const temporary = annots?.filter((a) => !a.embed && a.kind !== 'link');
    const added = temporary?.length ? listNew(engine, page, temporary) : [];
    // Typed values are shown for this drawing only; the reading view draws its own fields instead.
    const undoFields = fields && Object.keys(fields).length ? applyFields(page, fields) : null;
    const undoHide = hideForms ? hideWidgets(page) : null;
    try {
      const pixmap = page.toPixmap(matrix, engine.ColorSpace.DeviceRGB, false, true);
      try {
        return pixmap.asPNG().slice();
      } finally {
        pixmap.destroy();
      }
    } finally {
      for (const [annot, flags] of restore) annot.setFlags(flags);
      for (const annot of added) page.deleteAnnotation(annot);
      undoHide?.();
      undoFields?.();
    }
  } finally {
    page.destroy();
  }
}

/** Draws the first page of a finished PDF, for the pages whose content was changed. */
function renderBytes(engine: Engine, { bytes, width }: Extract<ViewRequest, { type: 'renderBytes' }>): Uint8Array {
  const doc = new engine.PDFDocument(bytes);
  try {
    const page = doc.loadPage(0);
    try {
      const [x0, , x1] = page.getBounds();
      const scale = width / (x1 - x0);
      const pixmap = page.toPixmap(engine.Matrix.scale(scale, scale), engine.ColorSpace.DeviceRGB, false, true);
      try {
        return pixmap.asPNG().slice();
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** Adds comments to a page and returns the annotations that were created. */
function listNew(engine: Engine, page: ReturnType<PDFDocument['loadPage']>, annots: Annot[]) {
  const before = new Set(page.getAnnotations().map((a) => a.getObject().asIndirect()));
  for (const a of annots) addComment(engine, page, a);
  return page.getAnnotations().filter((a) => !before.has(a.getObject().asIndirect()));
}

function fileComments({ docId, pageIndex }: Extract<ViewRequest, { type: 'comments' }>): FileComment[] {
  const doc = docs.get(docId);
  if (!doc || !hasPage(doc, pageIndex)) return [];
  const page = doc.loadPage(pageIndex);
  try {
    return listComments(page).map((a, index) => {
      const [x0, y0, x1, y1] = a.getBounds();
      let date = 0;
      try {
        date = a.getModificationDate().getTime() || 0;
      } catch {
        // A date that cannot be read is left out.
      }
      return { index, type: a.getType(), contents: a.getContents(), author: a.getAuthor(), box: [x0, y0, x1, y1] as Box, date };
    });
  } catch {
    return [];
  } finally {
    page.destroy();
  }
}

function pageFields({ docId, pageIndex }: Extract<ViewRequest, { type: 'fields' }>): FormField[] {
  const doc = docs.get(docId);
  if (!doc || !hasPage(doc, pageIndex)) return [];
  const page = doc.loadPage(pageIndex);
  try {
    return listFields(page);
  } catch {
    return [];
  } finally {
    page.destroy();
  }
}

function pageText({ docId, pageIndex }: Extract<ViewRequest, { type: 'text' }>): TextLine[] {
  const doc = docs.get(docId);
  if (!doc || !hasPage(doc, pageIndex)) throw new AppError('renderFailed');
  const page = doc.loadPage(pageIndex);
  const lines: TextLine[] = [];
  try {
    const text = page.toStructuredText('');
    try {
      let line: (TextLine & { started: boolean }) | null = null;
      text.walk({
        beginLine(_bbox, _wmode, [dx, dy]) {
          line = { text: '', x: 0, y: 0, dx, dy, size: 0, length: 0, started: false };
        },
        onChar(c, [x, y], _font, size, quad) {
          if (!line) return;
          if (!line.started) Object.assign(line, { x, y, size, started: true });
          line.text += c;
          // The line ends where its farthest character ends, measured along its direction.
          for (let i = 0; i < 8; i += 2) {
            line.length = Math.max(line.length, (quad[i] - line.x) * line.dx + (quad[i + 1] - line.y) * line.dy);
          }
        },
        endLine() {
          if (line?.started && line.text.trim() && line.size > 0) lines.push(line);
          line = null;
        },
      });
    } finally {
      text.destroy();
    }
  } finally {
    page.destroy();
  }
  return lines;
}

/** Every match of `needle` on a page as boxes, one group per match (a match can span lines). */
function searchPage({ docId, pageIndex, needle }: Extract<ViewRequest, { type: 'search' }>): Box[][] {
  const doc = docs.get(docId);
  if (!doc || !hasPage(doc, pageIndex)) return [];
  const page = doc.loadPage(pageIndex);
  try {
    return page.search(needle, 'ignore-case,ignore-diacritics').slice(0, MAX_HITS_PER_PAGE).map((hit) =>
      hit.map((q) => [
        Math.min(q[0], q[2], q[4], q[6]),
        Math.min(q[1], q[3], q[5], q[7]),
        Math.max(q[0], q[2], q[4], q[6]),
        Math.max(q[1], q[3], q[5], q[7]),
      ] as Box),
    );
  } finally {
    page.destroy();
  }
}

const MAX_HITS_PER_PAGE = 500;

function outline({ docId }: Extract<ViewRequest, { type: 'outline' }>): OutlineNode[] {
  const doc = docs.get(docId);
  type Item = { title?: string; page?: number; down?: Item[] };
  const convert = (items: Item[]): OutlineNode[] =>
    items.map((item) => ({
      title: item.title?.trim() || '–',
      page: typeof item.page === 'number' && item.page >= 0 ? item.page : null,
      children: convert(item.down ?? []),
    }));
  try {
    return convert((doc?.loadOutline() ?? []) as Item[]);
  } catch {
    // Bookmarks are a convenience; a broken table of contents must not stop the file from opening.
    return [];
  }
}

function pageLinks({ docId, pageIndex }: Extract<ViewRequest, { type: 'links' }>): PageLink[] {
  const doc = docs.get(docId);
  if (!doc || !hasPage(doc, pageIndex)) return [];
  const page = doc.loadPage(pageIndex);
  const found: PageLink[] = [];
  try {
    for (const link of page.getLinks()) {
      const box = link.getBounds();
      try {
        if (link.isExternal()) found.push({ box, uri: link.getURI() });
        else {
          const target = doc.resolveLink(link);
          if (target >= 0) found.push({ box, page: target });
        }
      } catch {
        // A link with an unreadable target is left out.
      }
    }
  } finally {
    page.destroy();
  }
  return found;
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
      case 'renderBytes': {
        const png = renderBytes(engine, data);
        return post({ id: data.id, ok: true, result: png }, [png.buffer]);
      }
      case 'comments':
        return post({ id: data.id, ok: true, result: fileComments(data) });
      case 'fields':
        return post({ id: data.id, ok: true, result: pageFields(data) });
      case 'text':
        return post({ id: data.id, ok: true, result: pageText(data) });
      case 'search':
        return post({ id: data.id, ok: true, result: searchPage(data) });
      case 'outline':
        return post({ id: data.id, ok: true, result: outline(data) });
      case 'links':
        return post({ id: data.id, ok: true, result: pageLinks(data) });
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
