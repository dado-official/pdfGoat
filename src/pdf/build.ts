// Writes new PDFs with pdf-lib. No DOM and no PDF.js here, so it runs in Node tests too.
import type { PDFDocument, PDFObject } from 'pdf-lib';
import { AppError } from '../core/errors';
import type { PageRef } from '../core/types';

/** What building needs from an opened file. */
export interface BuildSource {
  /** File name, only used in error messages. */
  name?: string;
  /** Returns the file's bytes. Called once, when the file is first needed for saving. */
  read: () => Promise<Uint8Array>;
  /** Size seen when the file was opened, to notice a file that changed since. */
  byteLength?: number;
}

// pdf-lib and fflate are only needed when saving, so they load on demand.
const loadPdfLib = () => import('pdf-lib');
type PdfLib = Awaited<ReturnType<typeof loadPdfLib>>;

// Parsed pdf-lib documents, kept per source so repeated saves do not parse the file again.
// A WeakMap frees them together with the source when the file is closed.
const parsed = new WeakMap<BuildSource, Promise<PDFDocument>>();

function libDoc(src: BuildSource): Promise<PDFDocument> {
  let doc = parsed.get(src);
  if (!doc) {
    doc = parse(src);
    parsed.set(src, doc);
    // A failed attempt must not be cached, so the next save tries again.
    doc.catch(() => parsed.delete(src));
  }
  return doc;
}

async function parse(src: BuildSource): Promise<PDFDocument> {
  const { PDFDocument } = await loadPdfLib();
  const bytes = await src.read();
  // A file that was replaced on disk after opening must never be exported as if it were the original.
  if (src.byteLength !== undefined && bytes.byteLength !== src.byteLength) {
    throw new AppError('fileUnreadable', { name: src.name ?? '' });
  }
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // Encrypted files must not be rebuilt: their streams would be copied without decrypting
  // them, which produces broken pages without any error.
  if (doc.isEncrypted) throw new AppError('encrypted', { name: src.name ?? '' });
  return doc;
}

/**
 * Maps page positions as PDF.js counts them to page indices in pdf-lib. They differ when a
 * damaged file lists a page that does not exist: PDF.js keeps the position, pdf-lib skips it.
 */
function readablePages(doc: PDFDocument, { PDFArray, PDFDict, PDFName }: PdfLib): Map<number, number> {
  const readable = new Map<number, number>();
  let position = 0;
  const walk = (node: PDFObject | undefined) => {
    if (!(node instanceof PDFDict)) {
      // A reference to nothing still counts as a page position.
      position++;
      return;
    }
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) {
      for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i));
    } else {
      readable.set(position++, readable.size);
    }
  };
  walk(doc.catalog.lookup(PDFName.of('Pages')));
  return readable;
}

/** Builds a new PDF from a list of pages (possibly from several documents). */
export async function buildPdf(pages: PageRef[], sources: Record<string, BuildSource>): Promise<Uint8Array> {
  if (!pages.length) throw new AppError('noPages');
  const pdfLib = await loadPdfLib();
  const { PDFDocument, degrees } = pdfLib;
  const out = await PDFDocument.create();
  out.setProducer('PDFgoat');
  out.setCreator('PDFgoat');

  // Copy all pages of one source in one call so shared resources (fonts, images) are copied once.
  const bySource = new Map<string, PageRef[]>();
  for (const p of pages) {
    const list = bySource.get(p.docId) ?? [];
    list.push(p);
    bySource.set(p.docId, list);
  }
  const copied = new Map<string, Awaited<ReturnType<typeof out.copyPages>>[number]>();
  for (const [docId, list] of bySource) {
    const source = sources[docId];
    if (!source) throw new AppError('sourceMissing', { id: docId });
    const lib = await libDoc(source);
    // A damaged file can list pages that do not exist. Name the page instead of failing obscurely;
    // the user can delete it and save the rest.
    const missing = (p: PageRef) => new AppError('pageMissing', { name: source.name ?? '', number: p.srcIndex + 1 });
    const available = readablePages(lib, pdfLib);
    const lost = list.find((p) => !available.has(p.srcIndex));
    if (lost) throw missing(lost);
    const result = await out.copyPages(lib, list.map((p) => available.get(p.srcIndex)!));
    list.forEach((p, i) => copied.set(p.id, result[i]));
  }

  for (const p of pages) {
    const page = copied.get(p.id)!;
    if (p.rotation) page.setRotation(degrees((page.getRotation().angle + p.rotation) % 360));
    out.addPage(page);
  }
  return out.save();
}

export async function zip(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  // PDFs are already compressed; storing them is faster and barely bigger.
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.bytes, { level: 0 }]])));
}
