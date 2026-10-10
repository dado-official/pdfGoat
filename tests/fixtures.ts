// Test PDFs built with pdf-lib. Every page gets a unique width, so it can be recognised in any output.
import { crc32, deflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, StandardFonts, degrees } from 'pdf-lib';

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

/**
 * Three pages (widths from `width`) with everything a save must not lose: a text field `name`
 * on page 1, a checkbox `ok` on page 2, a note on page 2, a link from page 1 to page 3 and one
 * to a website, bookmarks to pages 1 and 3 (the latter with a child to page 2), a title, and
 * "open at page 2". pdf-lib writes the form, MuPDF adds the rest.
 */
export async function makeRichPdf(tag: string, width: number): Promise<Uint8Array> {
  const mupdf = await import('mupdf');
  const lib = await PDFDocument.create();
  for (let i = 0; i < 3; i++) lib.addPage([width + i, 842]);
  const form = lib.getForm();
  const name = form.createTextField('name');
  name.setText(`Daniel-${tag}`);
  name.addToPage(lib.getPage(0), { x: 30, y: 200, width: 150, height: 20 });
  const ok = form.createCheckBox('ok');
  ok.check();
  ok.addToPage(lib.getPage(1), { x: 30, y: 150, width: 15, height: 15 });
  lib.setTitle(`Titel ${tag}`);

  const doc = new mupdf.PDFDocument(await lib.save());
  const outline = doc.outlineIterator();
  outline.insert({ title: `${tag} Eins`, uri: '#page=1', open: true });
  outline.insert({ title: `${tag} Drei`, uri: '#page=3', open: true });
  outline.prev();
  outline.down();
  outline.insert({ title: `${tag} Zwei innen`, uri: '#page=2', open: true });
  doc.loadPage(0).createLink([30, 30, 130, 50], '#page=3');
  doc.loadPage(0).createLink([30, 60, 130, 80], 'https://example.org/');
  const note = doc.loadPage(1).createAnnotation('Text');
  note.setRect([200, 200, 220, 220]);
  note.setContents(`Notiz ${tag} äöü`);
  note.update();
  doc.getTrailer().get('Root').put('OpenAction', [doc.findPage(1), 'Fit']);
  const bytes = doc.saveToBuffer('').asUint8Array().slice();
  doc.destroy();
  return bytes;
}

export interface RichPage {
  width: number;
  /** Page numbers (from 0) that links on this page jump to, or the address of an external link. */
  links: (number | string)[];
  notes: string[];
  widgets: string[];
}

export interface RichPdf {
  pages: RichPage[];
  /** Bookmarks as "title > page", children indented by two spaces. */
  outline: string[];
  /** Form fields as pdf-lib (a second, independent reader) sees them. */
  fields: string[];
  title: string | undefined;
  producer: string | undefined;
  /** Page objects in the file, including any that no longer belong to the document. */
  pageObjects: number;
}

/** Reads back everything `makeRichPdf` puts in. */
export async function describeRichPdf(bytes: Uint8Array): Promise<RichPdf> {
  const mupdf = await import('mupdf');
  const doc = new mupdf.PDFDocument(bytes);
  const pages: RichPage[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds();
    pages.push({
      width: Math.round(bounds[2] - bounds[0]),
      links: page.getLinks().map((l) => (l.isExternal() ? l.getURI() : doc.resolveLink(l))),
      notes: page.getAnnotations().map((a) => a.getContents()),
      widgets: page.getWidgets().map((w) => w.getName()),
    });
  }
  const outline: string[] = [];
  type Item = { title?: string; page?: number; down?: Item[] };
  const walk = (items: Item[], indent: string) => {
    for (const item of items) {
      outline.push(`${indent}${item.title} > ${item.page}`);
      walk(item.down ?? [], `${indent}  `);
    }
  };
  walk((doc.loadOutline() ?? []) as Item[], '');
  let pageObjects = 0;
  for (let n = 1; n < doc.countObjects(); n++) {
    const object = doc.newIndirect(n).resolve();
    if (object.isDictionary() && object.get('Type').toString() === '/Page') pageObjects++;
  }
  const title = doc.getMetaData('info:Title');
  const producer = doc.getMetaData('info:Producer');
  doc.destroy();

  const lib = await PDFDocument.load(bytes);
  const fields = lib
    .getForm()
    .getFields()
    .map((f) => `${f.getName()}=${'getText' in f ? (f as { getText(): string | undefined }).getText() : (f as unknown as { isChecked(): boolean }).isChecked()}`);
  return { pages, outline, fields, title, producer, pageObjects };
}

/** A real PDF with one 400 x 300 page, locked with AES-256: it opens only with `password`. */
export async function makeProtectedPdf(password = 'geheim'): Promise<Uint8Array> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const plain = await makePdf([{ width: 400, height: 300, label: 'secret' }]);
  const doc = new MuPdf(plain);
  try {
    return doc.saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${password}-owner`).asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}

/** A one-page PDF that already carries a comment (a note by "Erika"), like a file from another program. */
export async function makeCommentedPdf(text = 'Alter Kommentar'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  page.drawText('Hallo', { x: 60, y: 600, size: 48, font });
  const note = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [300, 700, 320, 720],
      Contents: PDFHexString.fromText(text),
      T: PDFHexString.fromText('Erika'),
      Name: 'Comment',
      F: 4,
    }),
  );
  page.node.set(PDFName.of('Annots'), doc.context.obj([note]));
  return doc.save();
}

/** Subtype and text of every comment on every page (the pop-up windows that belong to notes are left out). */
export async function annotationsOf(bytes: Uint8Array): Promise<{ type: string; contents: string }[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => {
    const list = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    return (list?.asArray() ?? [])
      .map((ref) => {
        const dict = doc.context.lookup(ref, PDFDict);
        const contents = dict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString);
        return { type: String(dict.get(PDFName.of('Subtype'))).slice(1), contents: contents?.decodeText() ?? '' };
      })
      .filter((a) => a.type !== 'Popup');
  });
}

/** A one-page form: text field "name", check box "agree", radio group "colour" (red, green, blue) and drop-down "country". */
export async function makeFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  const text = form.createTextField('name');
  text.addToPage(page, { x: 60, y: 740, width: 200, height: 22 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 60, y: 690, width: 18, height: 18 });
  const colour = form.createRadioGroup('colour');
  ['red', 'green', 'blue'].forEach((option, i) => colour.addOptionToPage(option, page, { x: 60 + i * 40, y: 640, width: 18, height: 18 }));
  const country = form.createDropdown('country');
  country.addOptions(['Deutschland', 'Österreich', 'Schweiz']);
  country.addToPage(page, { x: 60, y: 590, width: 200, height: 22 });
  return doc.save();
}

/** Current value of every field of a form PDF, read by pdf-lib. */
export async function formValues(bytes: Uint8Array) {
  const form = (await PDFDocument.load(bytes)).getForm();
  return {
    name: form.getTextField('name').getText() ?? '',
    agree: form.getCheckBox('agree').isChecked(),
    colour: form.getRadioGroup('colour').getSelected() ?? null,
    country: form.getDropdown('country').getSelected()[0] ?? null,
    fields: form.getFields().length,
  };
}

export async function fieldCount(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getForm().getFields().length;
}

/** The text of every page, read by MuPDF (a second engine instance in Node, independent of the app). */
export async function textOf(bytes: Uint8Array): Promise<string[]> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const doc = new MuPdf(bytes);
  try {
    return Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i).toStructuredText('').asText());
  } finally {
    doc.destroy();
  }
}

/** Number of pictures in the resources of the first page. */
export async function imageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  const resources = doc.getPages()[0].node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return xobjects ? xobjects.keys().length : 0;
}

/** A small solid red PNG (8 x 8), for pictures to insert. Written by hand with correct checksums. */
export function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [220, 40, 40]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A page with two lines of text and a red picture, for tests that change existing content. */
export async function makeContentPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Erste Zeile', { x: 72, y: 760, size: 14, font });
  page.drawText('Zweite Zeile', { x: 72, y: 742, size: 14, font });
  const picture = await doc.embedPng(tinyPng());
  page.drawImage(picture, { x: 100, y: 500, width: 120, height: 80 });
  return doc.save();
}

/** Whether a PDF asks for a password, and whether the given one opens it. */
export async function passwordInfo(bytes: Uint8Array, password = ''): Promise<{ asks: boolean; opens: boolean }> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const doc = new MuPdf(bytes);
  try {
    const asks = doc.needsPassword();
    return { asks, opens: !asks || doc.authenticatePassword(password) > 0 };
  } finally {
    doc.destroy();
  }
}

/** A page with one large, noisy picture (1500 x 1000 pixels), as a scan or a photo would be. */
export async function makePhotoPdf(): Promise<Uint8Array> {
  const w = 1500;
  const h = 1000;
  // Smooth colours with a little noise: compresses well as JPEG and badly as lossless data.
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 24;
  const row = (y: number) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, (_, x) => [(x / w) * 200 + rand(), (y / h) * 200 + rand(), 120 + rand()]).flat().map((v) => Math.min(255, Math.max(0, Math.round(v)))))]);
  const raw = Buffer.concat(Array.from({ length: h }, (_, y) => row(y)));
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawImage(await doc.embedPng(png), { x: 50, y: 400, width: 450, height: 300 });
  return doc.save();
}

/** Title and page (from 0) of every top-level bookmark of a PDF. */
export async function outlineOf(bytes: Uint8Array): Promise<{ title: string; page: number | null }[]> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const doc = new MuPdf(bytes);
  try {
    return (doc.loadOutline() ?? []).map((o) => ({ title: o.title ?? '', page: o.page ?? null }));
  } finally {
    doc.destroy();
  }
}

/** Kind and name of every form field, in the order of the widgets of the first page (read by MuPDF). */
export async function formFieldsOf(bytes: Uint8Array): Promise<[string, string][]> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const doc = new MuPdf(bytes);
  try {
    return doc.loadPage(0).getWidgets().map((w) => [w.getFieldType(), w.getName()] as [string, string]);
  } finally {
    doc.destroy();
  }
}

/** The values of the fields of the first page: text, 'on' or 'off' for buttons (read by MuPDF). */
export async function formValues2(bytes: Uint8Array): Promise<string[]> {
  const { PDFDocument: MuPdf } = await import('mupdf');
  const doc = new MuPdf(bytes);
  try {
    return doc.loadPage(0).getWidgets().map((w) => {
      if (w.isCheckbox() || w.isRadioButton()) {
        const state = w.getObject().get('AS');
        return state.isName() && state.asName() !== 'Off' ? 'on' : 'off';
      }
      return w.getValue();
    });
  } finally {
    doc.destroy();
  }
}
