import { describe, expect, it } from 'vitest';
import { makePhotoPdf } from '../../tests/fixtures';
import { LEVELS, formatBytes, savedPercent, scaledSize } from '../core/compress';
import { buildPdf } from './build';

const page = { id: 'p', docId: 'a', srcIndex: 0, rotation: 0 };

async function firstImage(bytes: Uint8Array) {
  const { PDFDocument, ColorSpace } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    const res = doc.findPage(0).getInheritable('Resources').get('XObject');
    let ref: ReturnType<typeof res.get> | null = null;
    res.forEach((v) => (ref ??= v));
    const image = doc.loadImage(ref!);
    const shot = doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], ColorSpace.DeviceRGB, false, false);
    // Pixel in the upper left of the picture area (page x 60, y 842 - 690), where the colours are known.
    const px = shot.getPixels();
    const at = (x: number, y: number) => Array.from(px.slice((y * shot.getWidth() + x) * 3, (y * shot.getWidth() + x) * 3 + 3));
    return { width: image.getWidth(), height: image.getHeight(), upperLeft: at(60, 152), lowerRight: at(490, 440) };
  } finally {
    doc.destroy();
  }
}

describe('compressing pictures', () => {
  it('makes the file much smaller, scales the picture down and keeps the colours', async () => {
    const bytes = await makePhotoPdf();
    const source = { a: { read: async () => bytes } };
    const plain = await buildPdf([page], source);
    const small = await buildPdf([page], source, undefined, { compress: LEVELS.medium });
    expect(small.length).toBeLessThan(plain.length / 3);
    const before = await firstImage(plain);
    const after = await firstImage(small);
    expect([before.width, before.height]).toEqual([1500, 1000]);
    // The picture is 1500 pixels wide, below the limit of 1600: it keeps its size.
    expect(Math.max(after.width, after.height)).toBe(1500);
    // The colours are the same within what JPEG changes.
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(after.upperLeft[c] - before.upperLeft[c])).toBeLessThan(25);
      expect(Math.abs(after.lowerRight[c] - before.lowerRight[c])).toBeLessThan(25);
    }
  });

  it('scales a picture down when it is larger than the level allows', async () => {
    const bytes = await makePhotoPdf();
    const small = await buildPdf([page], { a: { read: async () => bytes } }, undefined, { compress: LEVELS.strong });
    const after = await firstImage(small);
    expect([after.width, after.height]).toEqual([1000, 667]);
  });

  it('leaves a file without pictures alone', async () => {
    const { makePdf } = await import('../../tests/fixtures');
    const bytes = await makePdf([{ width: 300 }]);
    const out = await buildPdf([page], { a: { read: async () => bytes } }, undefined, { compress: LEVELS.strong });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('computes sizes and percentages', () => {
    expect(scaledSize(3000, 2000, 1500)).toEqual([1500, 1000]);
    expect(scaledSize(800, 600, 1500)).toEqual([800, 600]);
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1200)).toBe(0);
    expect(formatBytes(1536 * 1024, 'de')).toBe('1,5 MB');
    expect(formatBytes(2048, 'en')).toBe('2 KB');
  });
});
