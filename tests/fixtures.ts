// Test PDFs built with pdf-lib. Every page gets a unique width, so it can be recognised in any output.
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFRef, StandardFonts, degrees } from 'pdf-lib';

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

/**
 * A PDF whose trailer declares encryption, like a password-protected file.
 * The key data is made up, so no reader can decrypt it; that is enough to test that it is refused.
 */
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  const key = PDFHexString.of('00'.repeat(32));
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1, R: 2, O: key, U: key, P: -44 }),
  );
  return doc.save({ useObjectStreams: false });
}

/** Two pages (501 and 502 wide), but one entry of the page list points at an object that does not exist. */
export async function makeHalfBrokenPdf(brokenIndex = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await makePdf([{ width: 501 }, { width: 502 }]));
  doc.catalog.Pages().lookup(PDFName.of('Kids'), PDFArray).set(brokenIndex, PDFRef.of(9999));
  return doc.save();
}
