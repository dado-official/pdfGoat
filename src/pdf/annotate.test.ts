import { describe, expect, it } from 'vitest';
import { makePdf } from '../../tests/fixtures';
import type { Annot, AnnotKind } from '../core/annotations';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';
import { resizeAnnot } from '../core/resize';
import { listComments } from './annotate';

const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

let n = 0;
const annot = (kind: AnnotKind, extra: Partial<Annot> = {}): Annot => ({
  id: `a${n++}`,
  kind,
  color: '#e5484d',
  contents: '',
  box: [100, 100, 220, 140],
  created: Date.UTC(2026, 9, 10),
  ...extra,
});
const page = (docId: string, srcIndex: number, extra: Partial<PageRef> = {}): PageRef => ({ id: `p${n++}`, docId, srcIndex, rotation: 0, ...extra });
const source = (bytes: Uint8Array) => ({ read: async () => bytes });

async function commentsOf(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    return Array.from({ length: doc.countPages() }, (_, i) => {
      const p = doc.loadPage(i);
      return listComments(p).map((a) => ({ type: a.getType(), contents: a.getContents(), rect: a.getBounds() }));
    });
  } finally {
    doc.destroy();
  }
}

describe('comments when saving', () => {
  it('writes every kind as a real PDF annotation', async () => {
    const src = { a: source(await makePdf([{ width: 595, height: 842 }])) };
    const quads: [number, number, number, number][] = [[72, 100, 200, 114], [72, 118, 150, 132]];
    const annots = [
      annot('highlight', { quads, box: [72, 100, 200, 132], contents: 'wichtig' }),
      annot('underline', { quads, box: [72, 100, 200, 132] }),
      annot('strikeout', { quads, box: [72, 100, 200, 132] }),
      annot('note', { box: [300, 100, 320, 120], contents: 'Bitte prüfen: Größe & Maß' }),
      annot('text', { box: [300, 200, 460, 240], contents: 'Textfeld mit Umlauten äöü', fontSize: 12 }),
      annot('ink', { strokes: [[[100, 300], [120, 320], [150, 310]]], box: [100, 300, 150, 320] }),
      annot('square', { box: [100, 400, 200, 460] }),
      annot('circle', { box: [220, 400, 320, 460] }),
      annot('line', { line: [[100, 500], [300, 520]], box: [100, 500, 300, 520] }),
      annot('arrow', { line: [[100, 560], [300, 600]], box: [100, 560, 300, 600] }),
      annot('stamp', { box: [350, 400, 450, 450], image: PIXEL }),
    ];
    const out = await buildPdf([page('a', 0, { annots })], src);
    const [found] = await commentsOf(out);
    expect(found.map((c) => c.type)).toEqual(['Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText', 'Ink', 'Square', 'Circle', 'Line', 'Line', 'Stamp']);
    expect(found[0].contents).toBe('wichtig');
    expect(found[3].contents).toBe('Bitte prüfen: Größe & Maß');
    expect(found[4].contents).toBe('Textfeld mit Umlauten äöü');
  });

  it('keeps the position on a page that is rotated when saving', async () => {
    const src = { a: source(await makePdf([{ width: 595, height: 842 }])) };
    const a = annot('square', { box: [100, 100, 200, 160] });
    const plain = await commentsOf(await buildPdf([page('a', 0, { annots: [a] })], src));
    const turned = await commentsOf(await buildPdf([page('a', 0, { annots: [a], rotation: 90 })], src));
    // The annotation sits at the same place on the page itself; only the page is turned.
    // The border makes the bounds a little larger than the rectangle.
    const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(2));
    near(plain[0][0].rect, [100, 100, 200, 160]);
    near(turned[0][0].rect, [842 - 160, 100, 842 - 100, 200]);
  });

  it('saves a resized freehand drawing and a resized line at their new size', async () => {
    const src = { a: source(await makePdf([{ width: 595, height: 842 }])) };
    const ink = annot('ink', { box: [98.5, 98.5, 201.5, 151.5], strokes: [[[100, 100], [200, 150]]], width: 2 });
    const line = annot('line', { box: [98, 198, 202, 252], line: [[100, 200], [200, 250]], width: 2 });
    const [inkRect, lineRect] = (await commentsOf(await buildPdf([page('a', 0, { annots: [resizeAnnot(ink, [100, 100, 300, 200]), resizeAnnot(line, [100, 200, 300, 300])] })], src)))[0].map((c) => c.rect);
    // The file keeps the points, not the box: they have to move along or the saved file stays small.
    expect(inkRect[2] - inkRect[0]).toBeGreaterThan(190);
    expect(inkRect[3] - inkRect[1]).toBeGreaterThan(90);
    expect(lineRect[2] - lineRect[0]).toBeGreaterThan(190);
    expect(lineRect[3] - lineRect[1]).toBeGreaterThan(90);
  });

  it('deletes comments that were already in the file, by position', async () => {
    const first = await buildPdf([page('a', 0, { annots: [annot('note', { contents: 'eins' }), annot('note', { contents: 'zwei' }), annot('note', { contents: 'drei' })] })], {
      a: source(await makePdf([{ width: 595 }])),
    });
    const out = await buildPdf([page('f', 0, { removed: [1] })], { f: source(first) });
    expect((await commentsOf(out))[0].map((c) => c.contents)).toEqual(['eins', 'drei']);
  });

  it('keeps comments of the file and adds new ones after them', async () => {
    const first = await buildPdf([page('a', 0, { annots: [annot('note', { contents: 'alt' })] })], { a: source(await makePdf([{ width: 595 }])) });
    const out = await buildPdf([page('f', 0, { annots: [annot('note', { contents: 'neu' })] })], { f: source(first) });
    expect((await commentsOf(out))[0].map((c) => c.contents)).toEqual(['alt', 'neu']);
  });

  it('puts comments on the right page after pages were reordered and merged', async () => {
    const src = { a: source(await makePdf([{ width: 501 }, { width: 502 }])), b: source(await makePdf([{ width: 601 }])) };
    const out = await buildPdf(
      [page('b', 0), page('a', 1, { annots: [annot('note', { contents: 'auf 502' })] }), page('a', 0)],
      src,
    );
    const found = await commentsOf(out);
    expect(found.map((p) => p.map((c) => c.contents))).toEqual([[], ['auf 502'], []]);
  });
});
