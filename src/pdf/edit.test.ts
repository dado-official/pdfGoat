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
