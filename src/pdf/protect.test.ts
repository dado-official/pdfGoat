import { describe, expect, it } from 'vitest';
import { makeContentPdf, makeCommentedPdf, makeRichPdf } from '../../tests/fixtures';
import type { Annot } from '../core/annotations';
import { ALL_ALLOWED, encryptionOptions, noCleaning, noProtection, passwordProblem, permissionBits } from '../core/protect';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';
import { inspectPdf } from './protect';

const page = (extra: Partial<PageRef> = {}): PageRef => ({ id: 'p', docId: 'a', srcIndex: 0, rotation: 0, ...extra });
const redact = (box: [number, number, number, number]): Annot => ({ id: `r${box[0]}`, kind: 'redact', color: '#000000', contents: '', box, created: 1 });
const open = async (bytes: Uint8Array, password?: string) => {
  const { PDFDocument } = await import('mupdf');
  const doc = new PDFDocument(bytes);
  if (doc.needsPassword()) doc.authenticatePassword(password ?? '');
  return doc;
};

describe('redaction', () => {
  it('removes the text under the area and keeps the rest', async () => {
    const bytes = await makeContentPdf();
    // "Erste Zeile" sits at x 72, baseline y 82 (842 - 760); the area covers only that line.
    const out = await buildPdf([page({ annots: [redact([60, 60, 200, 86])] })], { a: { read: async () => bytes } });
    const doc = await open(out);
    try {
      const text = doc.loadPage(0).toStructuredText('').asText();
      expect(text).not.toContain('Erste');
      expect(text).toContain('Zweite Zeile');
    } finally {
      doc.destroy();
    }
    // The words are not in the file in any form: not in the page content either.
    const raw = new TextDecoder('latin1').decode(out);
    expect(raw).not.toContain('Erste');
  });

  it('does not touch the next line when the area comes from a search match', async () => {
    const bytes = await makeContentPdf();
    const probe = await open(bytes);
    const hit = probe.loadPage(0).search('Erste', 'ignore-case')[0][0];
    probe.destroy();
    const box = [Math.min(hit[0], hit[6]) - 1, Math.min(hit[1], hit[3]) - 1, Math.max(hit[0], hit[6], hit[2]) + 1, Math.max(hit[5], hit[7]) + 1] as [number, number, number, number];
    const out = await buildPdf([page({ annots: [redact(box)] })], { a: { read: async () => bytes } });
    const doc = await open(out);
    try {
      const text = doc.loadPage(0).toStructuredText('').asText();
      expect(text).not.toContain('Erste');
      expect(text).toContain('Zeile'); // the rest of the first line
      expect(text).toContain('Zweite Zeile');
    } finally {
      doc.destroy();
    }
  });

  it('blacks out the part of a picture under the area', async () => {
    const bytes = await makeContentPdf();
    // The picture covers x 100–220, y 262–342 (page space); the area takes its left half.
    const out = await buildPdf([page({ annots: [redact([100, 262, 160, 342])] })], { a: { read: async () => bytes } });
    const { ColorSpace } = await import('mupdf');
    const doc = await open(out);
    try {
      const pix = doc.loadPage(0).toPixmap([1, 0, 0, 1, 0, 0], ColorSpace.DeviceRGB, false, false);
      const at = (x: number, y: number) => Array.from(pix.getPixels().slice((y * pix.getWidth() + x) * 3, (y * pix.getWidth() + x) * 3 + 3));
      expect(at(130, 300).every((v) => v < 40)).toBe(true); // black
      expect(at(200, 300)[0]).toBeGreaterThan(150); // red picture still there
      pix.destroy();
    } finally {
      doc.destroy();
    }
  });

  it('deletes comments and links that touch the area', async () => {
    const bytes = await makeCommentedPdf('geheim');
    const out = await buildPdf([page({ annots: [redact([290, 100, 330, 140])] })], { a: { read: async () => bytes } });
    const doc = await open(out);
    try {
      expect(doc.loadPage(0).getAnnotations().filter((a) => a.getType() === 'Text')).toHaveLength(0);
    } finally {
      doc.destroy();
    }
  });
});

describe('protection', () => {
  const source = async () => ({ a: { read: async () => await makeContentPdf() } });

  it('asks for a password to open the file', async () => {
    const out = await buildPdf([page()], await source(), undefined, { protect: { ...noProtection(), userPassword: 'öffne' } });
    const { PDFDocument } = await import('mupdf');
    const doc = new PDFDocument(out);
    try {
      expect(doc.needsPassword()).toBe(true);
      expect(doc.authenticatePassword('falsch')).toBe(0);
      expect(doc.authenticatePassword('öffne')).toBeGreaterThan(0);
    } finally {
      doc.destroy();
    }
  });

  it('limits what may be done with the file, and the open password lifts nothing', async () => {
    const protect = { userPassword: '', ownerPassword: 'chef', allow: { ...ALL_ALLOWED, copy: false, edit: false } };
    const out = await buildPdf([page()], await source(), undefined, { protect });
    const { PDFDocument } = await import('mupdf');
    const doc = new PDFDocument(out);
    try {
      expect(doc.needsPassword()).toBe(false);
      expect(doc.hasPermission('print')).toBe(true);
      expect(doc.hasPermission('copy')).toBe(false);
      // Bit 4 of the permission number is "change the document".
      expect(doc.getTrailer().get('Encrypt').get('P').asNumber() & 8).toBe(0);
    } finally {
      doc.destroy();
    }
  });

  it('saves without protection when none is asked for', async () => {
    const out = await buildPdf([page()], await source(), undefined, { protect: null });
    const doc = await open(out);
    try {
      expect(doc.needsPassword()).toBe(false);
      expect(doc.getTrailer().get('Encrypt').isNull()).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it('writes the permission bits and refuses passwords the options cannot carry', () => {
    expect(permissionBits(ALL_ALLOWED) & 0xfff).toBe(0xfff & permissionBits(ALL_ALLOWED));
    expect(permissionBits({ ...ALL_ALLOWED, copy: false }) & 16).toBe(0);
    expect(permissionBits(ALL_ALLOWED) & 16).toBe(16);
    expect(passwordProblem('a,b')).toBe(true);
    expect(passwordProblem('Ärger mit Ümlauten')).toBe(false);
    expect(encryptionOptions(null)).toBe('encrypt=none');
    expect(encryptionOptions({ ...noProtection(), userPassword: 'x' })).toContain('user-password=x');
  });
});

describe('check before giving away', () => {
  it('lists what a file carries and takes it out on request', async () => {
    const bytes = await makeCommentedPdf('Notiz');
    const { PDFDocument } = await import('mupdf');
    // Give the file some metadata first.
    const first = new PDFDocument(bytes);
    first.setMetaData('info:Author', 'Erika Müller');
    first.setMetaData('info:Title', 'Vertraulich');
    const withInfo = first.saveToBuffer('').asUint8Array().slice();
    first.destroy();

    const before = await open(withInfo);
    const report = inspectPdf(before as never);
    before.destroy();
    expect(report.author).toBe('Erika Müller');
    expect(report.title).toBe('Vertraulich');
    expect(report.comments).toBe(1);

    const clean = { ...noCleaning(), metadata: true, comments: true };
    const out = await buildPdf([page()], { a: { read: async () => withInfo } }, undefined, { clean });
    const after = await open(out);
    try {
      const r = inspectPdf(after as never);
      expect(r.author).toBe('');
      expect(r.title).toBe('');
      expect(r.comments).toBe(0);
    } finally {
      after.destroy();
    }
  });

  it('counts the pictures-free rich file as it is', async () => {
    const doc = await open(await makeRichPdf('R', 500));
    try {
      const r = inspectPdf(doc as never);
      expect(r.attachments).toEqual([]);
      expect(r.scripts).toBe(false);
    } finally {
      doc.destroy();
    }
  });
});
