import { describe, expect, it } from 'vitest';
import { blankPdf } from './blank';
import { cropFromMargins, paperSize } from './paper';

describe('paperSize', () => {
  it('turns the paper to the wanted orientation', () => {
    expect(paperSize('a4', 'portrait', { width: 800, height: 400 })).toEqual([595, 842]);
    expect(paperSize('a4', 'landscape', { width: 400, height: 800 })).toEqual([842, 595]);
    expect(paperSize('a4', 'keep', { width: 800, height: 400 })).toEqual([842, 595]);
    expect(paperSize('letter', 'keep', { width: 400, height: 800 })).toEqual([612, 792]);
  });
});

describe('cropFromMargins', () => {
  const size = { width: 300, height: 500 };
  it('cuts margins from an upright page', () => {
    expect(cropFromMargins(size, 0, { top: 10, right: 20, bottom: 30, left: 40 })).toEqual([40, 10, 280, 470]);
  });

  it('follows the page as it is shown when it is turned', () => {
    // Turned by 90°, the shown top edge is the page's own left edge.
    const box = cropFromMargins(size, 90, { top: 10, right: 0, bottom: 0, left: 0 })!;
    expect(box).toEqual([10, 0, 300, 500]);
    const turned = cropFromMargins(size, 270, { top: 10, right: 0, bottom: 0, left: 0 })!;
    expect(turned).toEqual([0, 0, 290, 500]);
  });

  it('refuses margins that leave nothing', () => {
    expect(cropFromMargins(size, 0, { top: 300, right: 0, bottom: 300, left: 0 })).toBeNull();
  });
});

it('writes a valid PDF with one empty page', async () => {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(blankPdf(595, 842));
  try {
    expect(doc.countPages()).toBe(1);
    expect(doc.wasRepaired()).toBe(false);
    expect(doc.loadPage(0).getBounds()).toEqual([0, 0, 595, 842]);
  } finally {
    doc.destroy();
  }
});
