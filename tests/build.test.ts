import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildPdf, zip, type BuildSource } from '../src/lib/build';
import type { PageRef } from '../src/lib/types';
import { describePdf, makePdf } from './fixtures';

async function sources() {
  return {
    a: { bytes: await makePdf([{ width: 501 }, { width: 502 }, { width: 503, rotate: 90 }]), lib: null },
    b: { bytes: await makePdf([{ width: 601 }, { width: 602 }]), lib: null },
  } satisfies Record<string, BuildSource>;
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
    const src = await sources();
    const before = src.a.bytes.slice();
    const out = await buildPdf([ref('a', 0), ref('a', 0, 180)], src);
    expect(await describePdf(out)).toEqual([
      { width: 501, rotation: 0 },
      { width: 501, rotation: 180 },
    ]);
    expect(src.a.bytes).toEqual(before);
    expect((await describePdf(src.a.bytes)).length).toBe(3);
  });

  it('rejects an empty page list and unknown sources', async () => {
    const src = await sources();
    await expect(buildPdf([], src)).rejects.toThrow('Keine Seiten');
    await expect(buildPdf([ref('x', 0)], src)).rejects.toThrow('fehlt');
  });
});

it('zip stores every file under its name', async () => {
  const one = await makePdf([{ width: 300 }]);
  const two = await makePdf([{ width: 400 }]);
  const files = unzipSync(await zip([{ name: 'eins.pdf', bytes: one }, { name: 'zwei.pdf', bytes: two }]));
  expect(Object.keys(files)).toEqual(['eins.pdf', 'zwei.pdf']);
  expect((await describePdf(files['zwei.pdf']))[0].width).toBe(400);
});
