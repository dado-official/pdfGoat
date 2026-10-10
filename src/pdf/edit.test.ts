import { describe, expect, it } from 'vitest';
import { makeContentPdf, tinyPng } from '../../tests/fixtures';
import { colorHex, lineBox, replacementFont, type Edit } from '../core/edits';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';

const source = async () => ({ a: { read: async () => await makeContentPdf() } });
const page = (edits: Edit[]): PageRef => ({ id: 'p', docId: 'a', srcIndex: 0, rotation: 0, edits });

async function inspect(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    const stext = doc.loadPage(0).toStructuredText('preserve-images');
    const lines: { text: string; x: number; y: number; size: number }[] = [];
    const images: [number, number, number, number][] = [];
    let cur: (typeof lines)[number] | null = null;
    stext.walk({
      onImageBlock: (bbox) => images.push([...bbox] as [number, number, number, number]),
      beginLine() {
        cur = { text: '', x: 0, y: 0, size: 0 };
      },
      onChar(c, [x, y], _f, size, quad) {
        if (!cur) return;
        if (!cur.text) Object.assign(cur, { x, y, size });
        cur.text += c;
        void quad;
      },
      endLine() {
        if (cur) lines.push(cur);
        cur = null;
      },
    });
    return { lines, images };
  } finally {
    doc.destroy();
  }
}

const style = { serif: false, mono: false, bold: false, italic: false };
const textEdit = (line: { text: string; x: number; y: number; size: number }, text: string): Edit => ({
  id: 'e',
  kind: 'text',
  original: line.text,
  box: lineBox(line.x, line.y, 70, line.size),
  baseline: [line.x, line.y],
  size: line.size,
  color: '#14161a',
  font: style,
  text,
});

describe('changing existing content', () => {
  it('replaces a line of text and leaves the others alone', async () => {
    const before = await inspect(await makeContentPdf());
    const [first, second] = before.lines;
    expect([first.text, second.text]).toEqual(['Erste Zeile', 'Zweite Zeile']);
    const out = await buildPdf([page([textEdit(first, 'Geänderte Zeile für Müller')])], await source());
    const after = await inspect(out);
    expect(after.lines.map((l) => l.text).sort()).toEqual(['Geänderte Zeile für Müller', 'Zweite Zeile']);
    const changed = after.lines.find((l) => l.text.startsWith('Geänderte'))!;
    expect(Math.abs(changed.x - first.x)).toBeLessThan(1);
    expect(Math.abs(changed.y - first.y)).toBeLessThan(1);
    expect(Math.abs(changed.size - first.size)).toBeLessThan(0.5);
  });

  it('removes a line when its new text is empty', async () => {
    const [first] = (await inspect(await makeContentPdf())).lines;
    const out = await buildPdf([page([textEdit(first, '')])], await source());
    expect((await inspect(out)).lines.map((l) => l.text)).toEqual(['Zweite Zeile']);
  });

  it('removes, moves and replaces a picture', async () => {
    const [image] = (await inspect(await makeContentPdf())).images;
    expect(image[2] - image[0]).toBeCloseTo(120, 0);
    const png = new Uint8Array(tinyPng());
    const edit = (target: [number, number, number, number] | null): Edit => ({ id: 'i', kind: 'image', box: image, target, png });

    expect((await inspect(await buildPdf([page([edit(null)])], await source()))).images).toEqual([]);

    const moved = (await inspect(await buildPdf([page([edit([200, 300, 260, 340])])], await source()))).images;
    expect(moved).toHaveLength(1);
    expect(moved[0].map(Math.round)).toEqual([200, 300, 260, 340]);
  });
});

describe('helpers', () => {
  it('picks the standard font that looks most like the original', () => {
    expect(replacementFont(style)).toBe('Helvetica');
    expect(replacementFont({ ...style, bold: true, italic: true })).toBe('Helvetica-BoldOblique');
    expect(replacementFont({ ...style, serif: true, italic: true })).toBe('Times-Italic');
    expect(replacementFont({ ...style, mono: true, bold: true })).toBe('Courier-Bold');
  });

  it('turns colours from the engine into hex', () => {
    expect(colorHex([1, 0, 0])).toBe('#ff0000');
    expect(colorHex([0.5])).toBe('#808080');
    expect(colorHex([0, 0, 0, 1])).toBe('#000000');
    expect(colorHex(undefined)).toBe('#14161a');
  });
});

describe('moving a picture keeps its look', () => {
  /** A 40 x 30 picture with an asymmetric pattern and a transparent corner, as RGBA PNG. */
  async function alphaPng(): Promise<Buffer> {
    const { crc32, deflateSync } = await import('node:zlib');
    const w = 40;
    const h = 30;
    const rows: number[] = [];
    for (let y = 0; y < h; y++) {
      rows.push(0);
      for (let x = 0; x < w; x++) rows.push(x * 6, y * 8, 200 - x * 4, x < 14 && y < 10 ? 0 : x >= 30 ? 128 : 255); // top left corner is see-through, the right edge half so
    }
    const chunk = (type: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const out = Buffer.alloc(body.length + 8);
      out.writeUInt32BE(data.length, 0);
      body.copy(out, 4);
      out.writeUInt32BE(crc32(body), body.length + 4);
      return out;
    };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(w, 0);
    head.writeUInt32BE(h, 4);
    head.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
  }

  async function sourceWith(rotate: number) {
    const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 300]);
    page.drawRectangle({ x: 0, y: 0, width: 300, height: 300, color: rgb(0.8, 0.9, 1) });
    page.drawImage(await doc.embedPng(await alphaPng()), { x: 100, y: 100, width: 120, height: 90, rotate: degrees(rotate) });
    return doc.save();
  }

  async function pixels(bytes: Uint8Array) {
    const { PDFDocument, ColorSpace } = await import('mupdf');
    const doc = new PDFDocument(bytes);
    try {
      const pix = doc.loadPage(0).toPixmap([2, 0, 0, 2, 0, 0], ColorSpace.DeviceRGB, false, false);
      return { data: Array.from(pix.getPixels()), width: pix.getWidth() };
    } finally {
      doc.destroy();
    }
  }

  it.each([0, 90, 180])('looks the same after a "move" to the same place, rotated %i degrees, with transparency', async (rotate) => {
    const bytes = await sourceWith(rotate);
    const { PDFDocument } = await import('mupdf');
    const { pictureAsPng, pictureBoxes } = await import('./images');
    const engine = await import('mupdf');
    const doc = new PDFDocument(bytes);
    const p = doc.loadPage(0);
    const [box] = pictureBoxes(p);
    const png = pictureAsPng(engine, p, 0)!;
    doc.destroy();
    const edit: Edit = { id: 'i', kind: 'image', box, target: box, png };
    const out = await buildPdf([page([edit])], { a: { read: async () => bytes } });
    const [before, after] = await Promise.all([pixels(bytes), pixels(out)]);
    // Compare the area of the picture (and a margin): the average difference per channel must be tiny.
    let sum = 0;
    let n = 0;
    for (let y = Math.floor(box[1] * 2) - 4; y < Math.ceil(box[3] * 2) + 4; y++) {
      for (let x = Math.floor(box[0] * 2) - 4; x < Math.ceil(box[2] * 2) + 4; x++) {
        for (let c = 0; c < 3; c++) {
          sum += Math.abs(before.data[(y * before.width + x) * 3 + c] - after.data[(y * after.width + x) * 3 + c]);
          n++;
        }
      }
    }
    expect(sum / n).toBeLessThan(4);
  });
});
