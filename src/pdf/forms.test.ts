import { describe, expect, it } from 'vitest';
import { formValues, makeFormPdf } from '../../tests/fixtures';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';
import { listFields } from './forms';

const source = async () => ({ f: { read: async () => await makeFormPdf() } });
const page = (fields?: Record<number, string>): PageRef => ({ id: 'p', docId: 'f', srcIndex: 0, rotation: 0, fields });

async function fieldsOf(bytes: Uint8Array) {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  try {
    return listFields(doc.loadPage(0));
  } finally {
    doc.destroy();
  }
}

describe('form fields', () => {
  it('lists the fields of a page with their kind, name and options', async () => {
    const found = await fieldsOf(await makeFormPdf());
    expect(found.map((f) => [f.kind, f.name])).toEqual([
      ['text', 'name'],
      ['check', 'agree'],
      ['radio', 'colour'],
      ['radio', 'colour'],
      ['radio', 'colour'],
      ['choice', 'country'],
    ]);
    expect(found[5].options).toEqual(['Deutschland', 'Österreich', 'Schweiz']);
    expect(found.every((f) => f.value === '' || f.value === 'off')).toBe(true);
  });

  it('writes typed values when saving', async () => {
    const found = await fieldsOf(await makeFormPdf());
    const at = (name: string, n = 0) => found.filter((f) => f.name === name)[n].index;
    const out = await buildPdf(
      [page({ [at('name')]: 'Erika Müller', [at('agree')]: 'on', [at('colour', 1)]: 'on', [at('country')]: 'Österreich' })],
      await source(),
    );
    expect(await formValues(out)).toEqual({ name: 'Erika Müller', agree: true, colour: 'green', country: 'Österreich', fields: 4 });
  });

  it('leaves the file as it was when no values are given', async () => {
    expect(await formValues(await buildPdf([page()], await source()))).toEqual({ name: '', agree: false, colour: null, country: null, fields: 4 });
  });

  it('flattens the form: the values stay on the page but the fields are gone', async () => {
    const found = await fieldsOf(await makeFormPdf());
    const out = await buildPdf([page({ [found[0].index]: 'Erika' })], await source(), undefined, { flatten: true });
    expect((await fieldsOf(out)).length).toBe(0);
    // The text is part of the page now.
    const { PDFDocument } = await import('mupdf');
    const doc = new PDFDocument(out);
    try {
      expect(doc.loadPage(0).toStructuredText('').asText()).toContain('Erika');
    } finally {
      doc.destroy();
    }
  });
});
