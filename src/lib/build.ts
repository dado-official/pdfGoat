// Writes new PDFs with pdf-lib. No DOM and no PDF.js here, so it runs in Node tests too.
import type { PDFDocument } from 'pdf-lib';
import type { PageRef } from './types';

/** What building needs from an opened file; the pdf-lib document is cached on first use. */
export interface BuildSource {
  bytes: Uint8Array;
  lib: PDFDocument | null;
}

// pdf-lib and fflate are only needed when saving, so they load on demand.
const loadPdfLib = () => import('pdf-lib');

async function libDoc(src: BuildSource): Promise<PDFDocument> {
  if (!src.lib) {
    const { PDFDocument } = await loadPdfLib();
    src.lib = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
  }
  return src.lib;
}

/** Builds a new PDF from a list of pages (possibly from several documents). */
export async function buildPdf(pages: PageRef[], sources: Record<string, BuildSource>): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Keine Seiten zum Speichern.');
  const { PDFDocument, degrees } = await loadPdfLib();
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
    if (!source) throw new Error(`Quelldatei ${docId} fehlt.`);
    const result = await out.copyPages(await libDoc(source), list.map((p) => p.srcIndex));
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
