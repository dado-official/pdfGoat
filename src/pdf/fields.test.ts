import { describe, expect, it } from 'vitest';
import { makeFormPdf, makePdf } from '../../tests/fixtures';
import { newField } from '../core/formfields';
import type { Annot } from '../core/annotations';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';
import { listFields } from './forms';

const field = (spec: ReturnType<typeof newField>, box: [number, number, number, number]): Annot => ({ id: `f${box[0]}${box[1]}`, kind: 'field', color: '#3347c9', contents: '', box, created: 1, field: spec });
const page = (extra: Partial<PageRef> = {}): PageRef => ({ id: 'p', docId: 'a', srcIndex: 0, rotation: 0, ...extra });
const blank = async () => ({ a: { read: async () => await makePdf([{ width: 400, height: 400 }]) } });

async function fieldsOf(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    return listFields(doc.loadPage(0));
  } finally {
    doc.destroy();
  }
}

describe('creating form fields', () => {
  const annots = [
    field(newField('text', 'Name'), [20, 20, 200, 44]),
    field(newField('check', 'Zustimmung'), [20, 60, 36, 76]),
    field({ ...newField('choice', 'Land'), options: ['Deutschland', 'Österreich'] }, [20, 100, 200, 124]),
    field({ ...newField('radio', 'Farbe', 'rot'), exportValue: 'rot' }, [20, 150, 36, 166]),
    field({ ...newField('radio', 'Farbe', 'blau'), exportValue: 'blau' }, [60, 150, 76, 166]),
  ];

  it('writes real fields of every kind that can be found and read back', async () => {
    const out = await buildPdf([page({ annots })], await blank());
    const found = await fieldsOf(out);
    expect(found.map((f) => [f.kind, f.name])).toEqual([
      ['text', 'Name'],
      ['check', 'Zustimmung'],
      ['choice', 'Land'],
      ['radio', 'Farbe'],
      ['radio', 'Farbe'],
    ]);
    expect(found[2].options).toEqual(['Deutschland', 'Österreich']);
  });

  it('draws the fields, so they can be seen', async () => {
    const out = await buildPdf([page({ annots })], await blank());
    const { PDFDocument, ColorSpace } = await import('mupdf');
    const doc = new PDFDocument(out);
    try {
      const pix = doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], ColorSpace.DeviceRGB, false, true);
      const px = pix.getPixels();
      let dark = 0;
      for (let i = 0; i < px.length; i += 3) if (px[i] < 200) dark++;
      expect(dark).toBeGreaterThan(300);
    } finally {
      doc.destroy();
    }
  });

  it('can be filled in afterwards, including choosing one radio button of the group', async () => {
    const out = await buildPdf([page({ annots })], await blank());
    const found = await fieldsOf(out);
    const filled = await buildPdf([page({ fields: { [found[0].index]: 'Erika', [found[1].index]: 'on', [found[2].index]: 'Österreich', [found[4].index]: 'on' } })], { a: { read: async () => out } });
    const after = await fieldsOf(filled);
    expect(after.map((f) => f.value)).toEqual(['Erika', 'on', 'Österreich', 'off', 'on']);
  });

  it('gives fields with the same name different names in the file', async () => {
    const out = await buildPdf(
      [page({ annots: [field(newField('text', 'Eins'), [20, 20, 100, 40]), field(newField('text', 'Eins'), [20, 60, 100, 80])] })],
      await blank(),
    );
    expect((await fieldsOf(out)).map((f) => f.name)).toEqual(['Eins', 'Eins-2']);
  });
});

describe('removing form fields', () => {
  it('removes a field of the file by its position and keeps the others', async () => {
    const src = { a: { read: async () => await makeFormPdf() } };
    const before = await fieldsOf(await buildPdf([page()], src));
    const agree = before.find((f) => f.name === 'agree')!;
    const out = await buildPdf([page({ removedFields: [agree.index] })], src);
    expect((await fieldsOf(out)).map((f) => f.name)).toEqual(before.filter((f) => f.name !== 'agree').map((f) => f.name));
  });
});
