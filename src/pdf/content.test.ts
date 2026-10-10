import { describe, expect, it } from 'vitest';
import { makePdf, makeRichPdf } from '../../tests/fixtures';
import { blankPdf } from '../core/blank';
import type { Annot } from '../core/annotations';
import type { Mark } from '../core/marks';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';
import { encodeWinAnsi } from '../core/winansi';

let n = 0;
const page = (extra: Partial<PageRef> = {}, srcIndex = 0): PageRef => ({ id: `p${n++}`, docId: 'a', srcIndex, rotation: 0, ...extra });
const source = (bytes: Uint8Array) => ({ read: async () => bytes });
const annot = (kind: Annot['kind'], extra: Partial<Annot> = {}): Annot => ({
  id: `a${n++}`,
  kind,
  color: '#14161a',
  contents: '',
  box: [100, 100, 300, 140],
  created: 1,
  ...extra,
});
const mark = (extra: Partial<Mark> = {}): Mark => ({ id: `m${n++}`, text: 'Seite {n} von {total}', place: 'bottomCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false, ...extra });

async function open(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  return new PDFDocument(bytes);
}

/** Lines of text of a page with their direction and the corner of their first character. */
async function linesOf(bytes: Uint8Array, index = 0) {
  const doc = await open(bytes);
  try {
    const stext = doc.loadPage(index).toStructuredText('');
    const lines: { text: string; dx: number; dy: number; x: number; y: number }[] = [];
    let cur: (typeof lines)[number] | null = null;
    stext.walk({
      beginLine(_b, _w, [dx, dy]) {
        cur = { text: '', dx, dy, x: 0, y: 0 };
      },
      onChar(c, [x, y]) {
        if (!cur) return;
        if (!cur.text) Object.assign(cur, { x, y });
        cur.text += c;
      },
      endLine() {
        if (cur) lines.push(cur);
        cur = null;
      },
    });
    return lines;
  } finally {
    doc.destroy();
  }
}

async function boundsOf(bytes: Uint8Array, index = 0) {
  const doc = await open(bytes);
  try {
    return doc.loadPage(index).getBounds();
  } finally {
    doc.destroy();
  }
}

const a4 = async () => ({ a: source(await makePdf([{ width: 595, height: 842 }, { width: 595, height: 842 }, { width: 595, height: 842 }])) });

describe('encodeWinAnsi', () => {
  it('writes western European text and names the characters it cannot write', () => {
    expect(encodeWinAnsi('Grüße €').missing).toEqual([]);
    expect(encodeWinAnsi('Grüße €').bytes).toEqual([71, 114, 252, 223, 101, 32, 0x80]);
    expect(encodeWinAnsi('日本a').missing).toEqual(['日', '本']);
  });
});

describe('inserted content', () => {
  it('writes text with umlauts and the euro sign into the page', async () => {
    const out = await buildPdf([page({ annots: [annot('text', { embed: true, contents: 'Größe: 5 € für Müller', fontSize: 14 })] })], await a4());
    expect((await linesOf(out)).map((l) => l.text)).toContain('Größe: 5 € für Müller');
  });

  it('wraps long text to the width of its box', async () => {
    const out = await buildPdf([page({ annots: [annot('text', { embed: true, contents: 'eins zwei drei vier fünf sechs sieben acht neun zehn', box: [100, 100, 180, 300] })] })], await a4());
    expect((await linesOf(out)).length).toBeGreaterThan(2);
  });

  it('puts text at the right place on a page that is rotated', async () => {
    const sources = { a: source(await makePdf([{ width: 595, height: 842, rotate: 90 }])) };
    const out = await buildPdf([page({ annots: [annot('text', { embed: true, contents: 'Hallo', box: [100, 50, 300, 90], fontSize: 20 })] })], sources);
    const [line] = await linesOf(out);
    // Seen as the reader shows it: the page is 842 wide and 595 high, and the text starts near its box.
    expect(line.text).toBe('Hallo');
    expect(Math.abs(line.x - 100)).toBeLessThan(3);
    expect(line.y).toBeGreaterThan(50);
    expect(line.y).toBeLessThan(90);
    expect(Math.abs(line.dy)).toBeLessThan(0.01);
  });

  it('draws a picture into its box', async () => {
    const { ColorSpace, PDFDocument } = await import('mupdf');
    // A 1x1 red PNG, stretched over the box.
    const RED = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const out = await buildPdf([page({ annots: [annot('stamp', { embed: true, image: RED, box: [100, 100, 200, 160] })] })], await a4());
    const doc = new PDFDocument(out);
    try {
      const pix = doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], ColorSpace.DeviceRGB, false, false);
      const sample = (x: number, y: number) => Array.from(pix.getPixels().slice((y * pix.getWidth() + x) * 3, (y * pix.getWidth() + x) * 3 + 3));
      expect(sample(150, 130)[0]).toBeGreaterThan(200);
      expect(sample(150, 130)[1]).toBeLessThan(60);
      expect(sample(50, 50)).toEqual([255, 255, 255]);
      pix.destroy();
    } finally {
      doc.destroy();
    }
  });

  it('makes a link only for safe addresses', async () => {
    const out = await buildPdf(
      [page({ annots: [annot('link', { contents: 'https://example.org/x' }), annot('link', { contents: 'javascript:alert(1)', box: [100, 200, 200, 220] })] })],
      await a4(),
    );
    const doc = await open(out);
    try {
      const links = doc.loadPage(0).getLinks();
      expect(links.map((l) => l.getURI())).toEqual(['https://example.org/x']);
    } finally {
      doc.destroy();
    }
  });
});

describe('marks', () => {
  it('numbers the pages in the order of the saved file', async () => {
    const m = mark();
    const pages = [page({ marks: [m] }, 2), page({ marks: [m] }, 0), page({ marks: [m] }, 1)];
    const out = await buildPdf(pages, await a4());
    const texts = await Promise.all([0, 1, 2].map(async (i) => (await linesOf(out, i)).map((l) => l.text)));
    expect(texts).toEqual([['Seite 1 von 3'], ['Seite 2 von 3'], ['Seite 3 von 3']]);
  });

  it('puts a header at the top and a footer at the bottom, and fills in the date', async () => {
    const out = await buildPdf(
      [page({ marks: [mark({ text: 'Kopf {date}', place: 'topLeft' }), mark({ text: 'Fuß', place: 'bottomRight' })] })],
      await a4(),
      undefined,
      { date: '10.10.2026' },
    );
    const lines = await linesOf(out);
    const head = lines.find((l) => l.text === 'Kopf 10.10.2026')!;
    const foot = lines.find((l) => l.text === 'Fuß')!;
    expect(head.y).toBeLessThan(100);
    expect(foot.y).toBeGreaterThan(700);
    expect(foot.x).toBeGreaterThan(400);
  });

  it('turns a watermark diagonally across the middle of the page', async () => {
    const out = await buildPdf([page({ marks: [mark({ text: 'ENTWURF', place: 'center', size: 80, diagonal: true, opacity: 0.2, color: '#c0392b' })] })], await a4());
    const [line] = await linesOf(out);
    expect(line.text).toBe('ENTWURF');
    expect(line.dx).toBeCloseTo(Math.SQRT1_2, 2);
    expect(line.dy).toBeCloseTo(-Math.SQRT1_2, 2);
    expect(line.x).toBeGreaterThan(100);
    expect(line.x).toBeLessThan(300);
  });
});

describe('page area and size', () => {
  it('cuts the page down to the crop area', async () => {
    const out = await buildPdf([page({ crop: [50, 100, 450, 500] })], await a4());
    const b = await boundsOf(out);
    expect([Math.round(b[2] - b[0]), Math.round(b[3] - b[1])]).toEqual([400, 400]);
  });

  it('scales a page to a new paper size and moves its comments along', async () => {
    const sources = { a: source(await makePdf([{ width: 400, height: 300 }])) };
    const out = await buildPdf(
      [page({ size: [800, 600], annots: [annot('link', { contents: 'https://example.org', box: [100, 100, 200, 150] })] })],
      sources,
    );
    const b = await boundsOf(out);
    expect([b[2] - b[0], b[3] - b[1]]).toEqual([800, 600]);
    const doc = await open(out);
    try {
      const [link] = doc.loadPage(0).getLinks();
      const [x0, y0, x1, y1] = link.getBounds();
      expect([x0, y0, x1, y1].map(Math.round)).toEqual([200, 200, 400, 300]);
    } finally {
      doc.destroy();
    }
  });

  it('centres a page that does not have the shape of the new size', async () => {
    const sources = { a: source(await makePdf([{ width: 400, height: 400 }])) };
    const out = await buildPdf([page({ size: [800, 600], annots: [annot('link', { contents: 'https://example.org', box: [0, 0, 400, 400] })] })], sources);
    const doc = await open(out);
    try {
      const [x0, y0, x1, y1] = doc.loadPage(0).getLinks()[0].getBounds();
      // 400 x 400 scaled to 600 x 600 and centred on 800 x 600.
      expect([x0, y0, x1, y1].map(Math.round)).toEqual([100, 0, 700, 600]);
    } finally {
      doc.destroy();
    }
  });
});

describe('empty pages', () => {
  it('do not take over the file: the bookmarks of a real file stay as they are', async () => {
    const rich = await makeRichPdf('R', 500);
    const sources = { blank: { read: async () => blankPdf(500, 700), generated: true, name: 'Leere Seite.pdf' }, rich: { read: async () => rich, name: 'echt.pdf' } };
    const plain = await buildPdf([{ id: 'x', docId: 'rich', srcIndex: 0, rotation: 0 }], { rich: sources.rich });
    const out = await buildPdf(
      [{ id: 'b', docId: 'blank', srcIndex: 0, rotation: 0 }, { id: 'x', docId: 'rich', srcIndex: 0, rotation: 0 }],
      sources,
    );
    const titles = async (bytes: Uint8Array) => {
      const doc = await open(bytes);
      try {
        return (doc.loadOutline() ?? []).map((o) => o.title);
      } finally {
        doc.destroy();
      }
    };
    expect(await titles(out)).toEqual(await titles(plain));
    expect((await boundsOf(out, 0))[3]).toBe(700);
  });
});

describe('text recognition result', () => {
  it('writes found words as invisible text that can be searched', async () => {
    const out = await buildPdf(
      [page({ ocr: [{ text: 'Hallo', box: [100, 100, 180, 124] }, { text: 'Müller', box: [200, 100, 290, 124] }] })],
      await a4(),
    );
    const doc = await open(out);
    try {
      const p = doc.loadPage(0);
      const hit = p.search('Müller', 'ignore-case')[0][0];
      // The found box is where the word was found, to within a few points.
      expect(Math.abs(hit[0] - 200)).toBeLessThan(4);
      expect(Math.abs(hit[2] - 290)).toBeLessThan(6);
      expect(p.toStructuredText('').asText()).toContain('Hallo');
      // Nothing is drawn.
      const { ColorSpace } = await import('mupdf');
      const pix = p.toPixmap([1, 0, 0, 1, 0, 0], ColorSpace.DeviceRGB, false, false);
      expect(Array.from(pix.getPixels()).every((v) => v === 255)).toBe(true);
      pix.destroy();
    } finally {
      doc.destroy();
    }
  });
});
