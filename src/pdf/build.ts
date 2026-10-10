// Writes new PDFs with MuPDF. No DOM and no PDF.js here, so it runs in Node tests too.
import type { PDFDocument } from 'mupdf';
import { loadMupdf } from './mupdf';
import { AppError } from '../core/errors';
import { addComment, deleteComments } from './annotate';
import { applyFields } from './forms';
import type { PageRef } from '../core/types';

/** What building needs from an opened file. */
export interface BuildSource {
  /** File name, used in error messages and as bookmark title when files are merged. */
  name?: string;
  /** Returns the file's bytes. Called once, when the file is first needed for saving. */
  read: () => Promise<Uint8Array>;
  /** Size seen when the file was opened, to notice a file that changed since. */
  byteLength?: number;
  /** Password the file was opened with, if it asks for one. */
  password?: string;
}

// The engine and fflate are only needed when saving, so they load on demand.
const loadEngine = async () => ({ ...(await loadMupdf()), ...(await import('./merge')) });
type Engine = Awaited<ReturnType<typeof loadEngine>>;

// Bytes per source, so repeated saves do not read the file again.
// A WeakMap frees them together with the source when the file is closed.
const loaded = new WeakMap<BuildSource, Promise<Uint8Array>>();

export function bytesOf(src: BuildSource): Promise<Uint8Array> {
  let bytes = loaded.get(src);
  if (!bytes) {
    bytes = read(src);
    loaded.set(src, bytes);
    // A failed attempt must not be cached, so the next save tries again.
    bytes.catch(() => loaded.delete(src));
  }
  return bytes;
}

async function read(src: BuildSource): Promise<Uint8Array> {
  const bytes = await src.read();
  // A file that was replaced on disk after opening must never be exported as if it were the original.
  if (src.byteLength !== undefined && bytes.byteLength !== src.byteLength) {
    throw new AppError('fileUnreadable', { name: src.name ?? '' });
  }
  return bytes;
}

/** Opens a fresh working copy of a source. Every save changes its copies, never the source. */
function open(engine: Engine, bytes: Uint8Array, src: BuildSource): PDFDocument {
  const name = src.name ?? '';
  let doc: PDFDocument;
  try {
    doc = new engine.PDFDocument(bytes);
  } catch {
    throw new AppError('notPdf', { name });
  }
  // Files with only an owner password need no password to open; they are saved like any other.
  if (doc.needsPassword() && !doc.authenticatePassword(src.password ?? '')) {
    doc.destroy();
    throw new AppError('encrypted', { name });
  }
  return doc;
}

/** A damaged file can list pages that do not exist. */
function hasPage(doc: PDFDocument, index: number): boolean {
  try {
    return index < doc.countPages() && doc.findPage(index).isDictionary();
  } catch {
    return false;
  }
}

const title = (src: BuildSource) => (src.name ?? 'PDF').replace(/\.pdf$/i, '');

// MuPDF keeps the protection of a file when it saves it. The result of several files could only
// carry the protection of the first one, so every result is saved without protection.
const SAVE_OPTIONS = 'garbage=deduplicate,compress,encrypt=none';

/** Builds a new PDF from a list of pages (possibly from several documents). */
export async function buildPdf(
  pages: PageRef[],
  sources: Record<string, BuildSource>,
  /** Called after each file has been prepared and once more when the result is assembled. */
  onProgress?: (done: number, total: number) => void,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  if (!pages.length) throw new AppError('noPages');
  const engine = await loadEngine();

  // One working copy per source. A page that is used several times needs one copy per use,
  // because a page object can only sit at one place in a document.
  interface Part {
    docId: string;
    source: BuildSource;
    /** False for the extra copies of a source whose pages are used several times. */
    primary: boolean;
    refs: PageRef[];
    doc?: PDFDocument;
  }
  const parts = new Map<string, Part>();
  const uses = new Map<string, number>();
  for (const p of pages) {
    const source = sources[p.docId];
    if (!source) throw new AppError('sourceMissing', { id: p.docId });
    const use = uses.get(`${p.docId}/${p.srcIndex}`) ?? 0;
    uses.set(`${p.docId}/${p.srcIndex}`, use + 1);
    const key = `${p.docId}/${use}`;
    const part = parts.get(key) ?? { docId: p.docId, source, primary: use === 0, refs: [] };
    part.refs.push(p);
    parts.set(key, part);
  }

  const list = [...parts.values()];
  const total = list.length + 1;
  try {
    for (const part of list) {
      const doc = (part.doc = open(engine, await bytesOf(part.source), part.source));
      // Name the page instead of failing obscurely; the user can delete it and save the rest.
      const lost = part.refs.find((p) => !hasPage(doc, p.srcIndex));
      if (lost) throw new AppError('pageMissing', { name: part.source.name ?? '', number: lost.srcIndex + 1 });
      // Comments the user deleted are removed from the working copy before the pages move on.
      for (const p of part.refs) {
        if (p.removed?.length) deleteComments(doc.loadPage(p.srcIndex), p.removed);
        // The same for the values typed into form fields.
        if (p.fields && Object.keys(p.fields).length) applyFields(doc.loadPage(p.srcIndex), p.fields);
      }
      engine.keepPages(doc, part.refs.map((p) => p.srcIndex));
      onProgress?.(list.indexOf(part) + 1, total);
    }

    // Everything is collected in the copy of the first file, so its bookmarks, form and
    // document properties stay as they are.
    const [base, ...rest] = list;
    const out = base.doc!;
    const files = new Set(list.map((p) => p.docId)).size;
    // When files with bookmarks are merged, each file gets an entry with its name on top.
    const named = files > 1 && list.some((p) => p.primary && p.doc!.loadOutline()?.length);
    if (named) engine.nestOutline(out, title(base.source));
    const position = new Map<string, number>();
    base.refs.forEach((p, i) => position.set(p.id, i));
    for (const part of rest) {
      const first = out.countPages();
      part.refs.forEach((p, i) => position.set(p.id, first + i));
      engine.appendDocument(out, part.doc!, named && part.primary ? title(part.source) : undefined);
    }
    engine.keepPages(out, pages.map((p) => position.get(p.id)!));

    // Comments are written before the extra rotation, because their positions are given in the
    // page's own space.
    pages.forEach((p, i) => {
      if (!p.annots?.length) return;
      const page = out.loadPage(i);
      for (const a of p.annots) addComment(engine, page, a);
    });

    pages.forEach((p, i) => {
      if (!p.rotation) return;
      const page = out.findPage(i);
      const own = page.getInheritable('Rotate');
      page.put('Rotate', ((((own.isNumber() ? own.asNumber() : 0) + p.rotation) % 360) + 360) % 360);
    });

    // "Flatten form": the fields become part of the page, so they can no longer be changed.
    if (options.flatten) out.bake(false, true);

    out.setMetaData('info:Producer', 'PDFgoat');
    // The result lives in the engine's memory, so it is copied out before that is freed.
    const result = out.saveToBuffer(SAVE_OPTIONS).asUint8Array().slice();
    onProgress?.(total, total);
    return result;
  } finally {
    for (const part of list) part.doc?.destroy();
  }
}

export async function zip(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  // PDFs are already compressed; storing them is faster and barely bigger.
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.bytes, { level: 0 }]])));
}
