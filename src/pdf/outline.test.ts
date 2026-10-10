import { describe, expect, it } from 'vitest';
import { makePdf, makeRichPdf } from '../../tests/fixtures';
import type { ResolvedBookmark } from '../core/bookmarks';
import { buildPdf } from './build';

const page = (srcIndex: number, id = `p${srcIndex}`) => ({ id, docId: 'a', srcIndex, rotation: 0 });

async function read(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    const walk = (items: { title?: string; page?: number; down?: unknown[] }[]): unknown[] =>
      items.map((o) => ({ title: o.title, page: o.page ?? null, children: walk((o.down ?? []) as never) }));
    return walk((doc.loadOutline() ?? []) as never);
  } finally {
    doc.destroy();
  }
}

describe('writing bookmarks', () => {
  const items: ResolvedBookmark[] = [
    { title: 'Kapitel', page: 0, children: [{ title: 'Abschnitt', page: 1, children: [{ title: 'Tief', page: 2, children: [] }] }, { title: 'Ohne Ziel', page: null, children: [] }] },
    { title: 'Ende', page: 2, children: [] },
  ];

  it('replaces the bookmarks of the file with the given ones, nested as given', async () => {
    const bytes = await makeRichPdf('R', 500);
    const out = await buildPdf([page(0), page(1), page(2)], { a: { read: async () => bytes } }, undefined, { outline: items });
    expect(await read(out)).toEqual([
      { title: 'Kapitel', page: 0, children: [{ title: 'Abschnitt', page: 1, children: [{ title: 'Tief', page: 2, children: [] }] }, { title: 'Ohne Ziel', page: null, children: [] }] },
      { title: 'Ende', page: 2, children: [] },
    ]);
  });

  it('writes bookmarks into a file that had none, and an empty list removes them all', async () => {
    const plain = await makePdf([{ width: 300 }, { width: 301 }, { width: 302 }]);
    const out = await buildPdf([page(0), page(1), page(2)], { a: { read: async () => plain } }, undefined, { outline: items });
    expect((await read(out)).length).toBe(2);
    const none = await buildPdf([page(0), page(1), page(2)], { a: { read: async () => out } }, undefined, { outline: [] });
    expect(await read(none)).toEqual([]);
  });

  it('keeps the bookmarks of the file when none are given', async () => {
    const bytes = await makeRichPdf('R', 500);
    const out = await buildPdf([page(0), page(1), page(2)], { a: { read: async () => bytes } });
    expect((await read(out)).map((o) => (o as { title: string }).title)).toEqual(['R Eins', 'R Drei']);
  });
});
