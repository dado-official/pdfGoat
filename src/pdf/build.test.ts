import { readFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { describePdf, makeEncryptedPdf, makePdf } from '../../tests/fixtures';
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

  it('refuses a source whose page count no longer matches the opened file', async () => {
    const replaced = { ...source(await makePdf([{ width: 300 }]), 'neu.pdf'), pageCount: 3 };
    await expect(buildPdf([ref('a', 0)], { a: replaced })).rejects.toMatchObject({
      code: 'fileUnreadable',
      params: { name: 'neu.pdf' },
    });
    const same = { ...source(await makePdf([{ width: 300 }])), pageCount: 1 };
    expect(await describePdf(await buildPdf([ref('a', 0)], { a: same }))).toHaveLength(1);
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

it('zip stores every file under its name', async () => {
  const one = await makePdf([{ width: 300 }]);
  const two = await makePdf([{ width: 400 }]);
  const files = unzipSync(await zip([{ name: 'eins.pdf', bytes: one }, { name: 'zwei.pdf', bytes: two }]));
  expect(Object.keys(files)).toEqual(['eins.pdf', 'zwei.pdf']);
  expect((await describePdf(files['zwei.pdf']))[0].width).toBe(400);
});
