import { readFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { describePdf, describeRichPdf, makeEncryptedPdf, makeHalfBrokenPdf, makePdf, makeRichPdf } from '../../tests/fixtures';
import { AppError } from '../core/errors';
import type { PageRef } from '../core/types';
import { buildPdf, zip, type BuildSource } from './build';

/** A source that hands out `bytes` and counts how often it is read. */
function source(bytes: Uint8Array, name?: string) {
  const src = { name, reads: 0, read: async () => (src.reads++, bytes) };
  return src satisfies BuildSource;
}

async function sources() {
  return {
    a: source(await makePdf([{ width: 501 }, { width: 502 }, { width: 503, rotate: 90 }])),
    b: source(await makePdf([{ width: 601 }, { width: 602 }])),
  };
}

let n = 0;
const ref = (docId: string, srcIndex: number, rotation = 0): PageRef => ({ id: `p${n++}`, docId, srcIndex, rotation });

describe('buildPdf', () => {
  it('merges pages from several files in the given order', async () => {
    const src = await sources();
    const out = await buildPdf([ref('b', 1), ref('a', 0), ref('b', 0), ref('a', 1)], src);
    expect((await describePdf(out)).map((p) => p.width)).toEqual([602, 501, 601, 502]);
  });

  it('adds the extra rotation on top of the rotation stored in the file', async () => {
    const src = await sources();
    const out = await buildPdf([ref('a', 0, 90), ref('a', 2, 0), ref('a', 2, 270)], src);
    expect((await describePdf(out)).map((p) => p.rotation)).toEqual([90, 90, 0]);
  });

  it('can use the same source page twice and leaves the source untouched', async () => {
    const bytes = await makePdf([{ width: 501 }, { width: 502 }, { width: 503 }]);
    const before = bytes.slice();
    const src = { a: source(bytes) };
    const out = await buildPdf([ref('a', 0), ref('a', 0, 180)], src);
    expect(await describePdf(out)).toEqual([
      { width: 501, rotation: 0 },
      { width: 501, rotation: 180 },
    ]);
    expect(bytes).toEqual(before);
    expect((await describePdf(bytes)).length).toBe(3);
  });

  it('reads and parses each source only once across several saves', async () => {
    const src = await sources();
    await buildPdf([ref('a', 0), ref('b', 0)], src);
    await buildPdf([ref('a', 1)], src);
    expect(src.a.reads).toBe(1);
    expect(src.b.reads).toBe(1);
  });

  it('saves the good pages of a file with a damaged page and names the damaged one', async () => {
    const src = { h: source(await makeHalfBrokenPdf(), 'halb.pdf') };
    expect((await describePdf(await buildPdf([ref('h', 0)], src))).map((p) => p.width)).toEqual([501]);
    await expect(buildPdf([ref('h', 0), ref('h', 1)], src)).rejects.toMatchObject({
      code: 'pageMissing',
      params: { name: 'halb.pdf', number: 2 },
    });
  });

  it('still picks the right page when the damaged one comes first', async () => {
    const src = { h: source(await makeHalfBrokenPdf(0), 'halb.pdf') };
    expect((await describePdf(await buildPdf([ref('h', 1)], src))).map((p) => p.width)).toEqual([502]);
    await expect(buildPdf([ref('h', 0)], src)).rejects.toMatchObject({ code: 'pageMissing', params: { number: 1 } });
  });

  it('refuses a source whose size no longer matches the opened file', async () => {
    const bytes = await makePdf([{ width: 300 }]);
    const src = { a: { ...source(bytes, 'neu.pdf'), byteLength: bytes.byteLength + 1 } };
    await expect(buildPdf([ref('a', 0)], src)).rejects.toMatchObject({ code: 'fileUnreadable' });
  });

  it('keeps embedded fonts of the source pages', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../../tests/files/embedded-font.pdf', import.meta.url)));
    const out = await PDFDocument.load(await buildPdf([ref('f', 0, 90)], { f: source(bytes) }));
    const fontFiles = out.context
      .enumerateIndirectObjects()
      .filter(([, object]) => object instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => object.has(PDFName.of(k))));
    expect(fontFiles.length).toBeGreaterThan(0);
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  it('tries again after a source could not be read', async () => {
    const bytes = await makePdf([{ width: 300 }]);
    let fail = true;
    const src = {
      a: {
        read: async () => {
          if (fail) throw new AppError('fileUnreadable', { name: 'a.pdf' });
          return bytes;
        },
      },
    };
    await expect(buildPdf([ref('a', 0)], src)).rejects.toMatchObject({ code: 'fileUnreadable' });
    fail = false;
    expect(await describePdf(await buildPdf([ref('a', 0)], src))).toHaveLength(1);
  });

  it('rejects an empty page list and unknown sources', async () => {
    const src = await sources();
    await expect(buildPdf([], src)).rejects.toMatchObject({ code: 'noPages' });
    await expect(buildPdf([ref('x', 0)], src)).rejects.toMatchObject({ code: 'sourceMissing', params: { id: 'x' } });
  });

  it('refuses a file that is encrypted with an owner password only', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../../tests/files/owner-encrypted.pdf', import.meta.url)));
    await expect(buildPdf([ref('o', 0)], { o: source(bytes, 'gesperrt.pdf') })).rejects.toMatchObject({
      code: 'encrypted',
    });
  });

  it('refuses encrypted sources instead of writing broken pages', async () => {
    const src = { e: source(await makeEncryptedPdf(), 'geheim.pdf') };
    await expect(buildPdf([ref('e', 0)], src)).rejects.toMatchObject({
      code: 'encrypted',
      params: { name: 'geheim.pdf' },
    });
  });
});

describe('buildPdf keeps what belongs to the pages', () => {
  const rich = async () => ({
    a: source(await makeRichPdf('A', 500), 'a.pdf'),
    b: source(await makeRichPdf('B', 600), 'b.pdf'),
  });

  it('reads the fixture as it was written', async () => {
    expect(await describeRichPdf(await makeRichPdf('A', 500))).toEqual({
      pages: [
        { width: 500, links: [2, 'https://example.org/'], notes: [], widgets: ['name'] },
        { width: 501, links: [], notes: ['Notiz A äöü'], widgets: ['ok'] },
        { width: 502, links: [], notes: [], widgets: [] },
      ],
      outline: ['A Eins > 0', 'A Drei > 2', '  A Zwei innen > 1'],
      fields: ['name=Daniel-A', 'ok=true'],
      title: 'Titel A',
      producer: expect.any(String),
      pageObjects: 3,
    });
  });

  it('moves bookmarks, links, notes and form fields with their pages', async () => {
    const out = await describeRichPdf(await buildPdf([ref('a', 2), ref('a', 0), ref('a', 1)], await rich()));
    expect(out).toEqual({
      pages: [
        { width: 502, links: [], notes: [], widgets: [] },
        { width: 500, links: [0, 'https://example.org/'], notes: [], widgets: ['name'] },
        { width: 501, links: [], notes: ['Notiz A äöü'], widgets: ['ok'] },
      ],
      outline: ['A Eins > 1', 'A Drei > 0', '  A Zwei innen > 2'],
      fields: ['name=Daniel-A', 'ok=true'],
      title: 'Titel A',
      producer: 'PDFgoat',
      pageObjects: 3,
    });
  });

  it('removes a deleted page from the file, with its field, note and bookmark', async () => {
    // The file opens at page 2, which is the page that gets deleted.
    const out = await describeRichPdf(await buildPdf([ref('a', 0), ref('a', 2)], await rich()));
    expect(out.pages.map((p) => p.width)).toEqual([500, 502]);
    expect(out.pageObjects).toBe(2);
    expect(out.fields).toEqual(['name=Daniel-A']);
    expect(out.outline).toEqual(['A Eins > 0', 'A Drei > 1']);
    expect(out.pages[0].links).toEqual([1, 'https://example.org/']);
  });

  it('drops a link whose target page was deleted', async () => {
    const out = await describeRichPdf(await buildPdf([ref('a', 0), ref('a', 1)], await rich()));
    expect(out.pages[0].links).toEqual(['https://example.org/']);
    // The bookmark to the deleted page stays as a heading, because the one below it still has its page.
    expect(out.outline).toEqual(['A Eins > 0', 'A Drei > undefined', '  A Zwei innen > 1']);
    expect(out.pageObjects).toBe(2);
  });

  it('merges files with their bookmarks, links, notes and form fields', async () => {
    const order = [ref('a', 0), ref('b', 0), ref('a', 1), ref('b', 1), ref('a', 2), ref('b', 2)];
    const out = await describeRichPdf(await buildPdf(order, await rich()));
    expect(out).toEqual({
      pages: [
        { width: 500, links: [4, 'https://example.org/'], notes: [], widgets: ['name'] },
        { width: 600, links: [5, 'https://example.org/'], notes: [], widgets: ['name_2'] },
        { width: 501, links: [], notes: ['Notiz A äöü'], widgets: ['ok'] },
        { width: 601, links: [], notes: ['Notiz B äöü'], widgets: ['ok_2'] },
        { width: 502, links: [], notes: [], widgets: [] },
        { width: 602, links: [], notes: [], widgets: [] },
      ],
      outline: ['a > 0', '  A Eins > 0', '  A Drei > 4', '    A Zwei innen > 2', 'b > 1', '  B Eins > 1', '  B Drei > 5', '    B Zwei innen > 3'],
      fields: ['name=Daniel-A', 'ok=true', 'name_2=Daniel-B', 'ok_2=true'],
      title: 'Titel A',
      producer: 'PDFgoat',
      pageObjects: 6,
    });
  });

  it('takes only the chosen pages of a merged file along', async () => {
    const out = await describeRichPdf(await buildPdf([ref('b', 1), ref('a', 0)], await rich()));
    expect(out.pages).toEqual([
      { width: 601, links: [], notes: ['Notiz B äöü'], widgets: ['ok'] },
      { width: 500, links: ['https://example.org/'], notes: [], widgets: ['name'] },
    ]);
    expect(out.fields).toEqual(['ok=true', 'name=Daniel-A']);
    expect(out.outline).toEqual(['b > 0', 'a > 1', '  A Eins > 1']);
    expect(out.pageObjects).toBe(2);
  });

  it('gives the second copy of a page its own form field', async () => {
    const out = await describeRichPdf(await buildPdf([ref('a', 0), ref('a', 0)], await rich()));
    expect(out.pages.map((p) => p.widgets)).toEqual([['name'], ['name_2']]);
    expect(out.fields).toEqual(['name=Daniel-A', 'name_2=Daniel-A']);
    expect(out.outline).toEqual(['A Eins > 0']);
  });

  it('adds no bookmarks when the merged files have none', async () => {
    const src = await sources();
    expect((await describeRichPdf(await buildPdf([ref('a', 0), ref('b', 0)], src))).outline).toEqual([]);
  });
});

it('zip stores every file under its name', async () => {
  const one = await makePdf([{ width: 300 }]);
  const two = await makePdf([{ width: 400 }]);
  const files = unzipSync(await zip([{ name: 'eins.pdf', bytes: one }, { name: 'zwei.pdf', bytes: two }]));
  expect(Object.keys(files)).toEqual(['eins.pdf', 'zwei.pdf']);
  expect((await describePdf(files['zwei.pdf']))[0].width).toBe(400);
});
