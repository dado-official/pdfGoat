// Test PDFs built with pdf-lib. Every page gets a unique width, so it can be recognised in any output.
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

export interface FixturePage {
  width: number;
  height?: number;
  label?: string;
  /** Rotation stored in the source file itself. */
  rotate?: number;
}

export async function makePdf(pages: FixturePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const p of pages) {
    const page = doc.addPage([p.width, p.height ?? 842]);
    if (p.label) page.drawText(p.label, { x: 60, y: 400, size: 96, font });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return doc.save();
}

/** Width and rotation of every page, in order. */
export async function describePdf(bytes: Uint8Array): Promise<{ width: number; rotation: number }[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({ width: Math.round(p.getWidth()), rotation: p.getRotation().angle }));
}
