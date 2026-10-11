import { expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { describePdf, makeContentPdf, makePhotoPdf, textOf, tinyPng, makePdf } from '../fixtures';
import { pdfFile, card, downloadBytes, test } from './helpers';

test.describe('pictures and export', () => {
  async function download(page: Page, name: RegExp) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    return file;
  }

  test('opens a picture as a page and saves it as PDF', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(page.getByRole('tab')).toHaveText(/scan\.pdf/);
    await expect(page.locator('.card img')).toBeVisible();
    const file = await download(page, /PDF speichern/);
    expect(file.suggestedFilename()).toBe('scan.pdf');
    // 8 pixels at 150 dpi are 3.84 points.
    expect((await describePdf(await downloadBytes(file))).map((p) => p.width)).toEqual([4]);
  });

  test('exports the text of the pages as plain text and Markdown', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('inhalt.pdf', await makeContentPdf()));
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel('Reiner Text').check();
    const text = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const txt = await text;
    expect(txt.suggestedFilename()).toBe('inhalt.txt');
    expect(new TextDecoder().decode(await downloadBytes(txt))).toBe('Erste Zeile Zweite Zeile');

    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel('Markdown').check();
    const md = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    expect((await md).suggestedFilename()).toBe('inhalt.md');

    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel(/^Word/).check();
    const word = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const docx = await word;
    expect(docx.suggestedFilename()).toBe('inhalt.docx');
    const parts = unzipSync(await downloadBytes(docx));
    expect(new TextDecoder().decode(parts['word/document.xml'])).toContain('Erste Zeile Zweite Zeile');
  });

  test('recognises the text of a scanned page and writes it into the saved file', async ({ app: page }) => {
    test.setTimeout(150_000);
    // A "scan": a picture with text on it, drawn in the browser.
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1400, 500);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 130px Arial, Helvetica, sans-serif';
      ctx.fillText('Hallo Welt', 80, 200);
      ctx.fillText('Rechnung 2026', 80, 380);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('file-input').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Texterkennung' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Erkennen' }).click();
    await expect(page.getByRole('status')).toContainText('Wörter erkannt', { timeout: 120_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    const text = (await textOf(await downloadBytes(await file)))[0];
    expect(text).toContain('Hallo');
    expect(text).toContain('Welt');
    expect(text).toContain('2026');
  });

  test('compares two documents and shows the words that differ', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles([
      pdfFile('alt.pdf', await makePdf([{ width: 595, label: 'Vertrag' }, { width: 595, label: 'gleich' }])),
      pdfFile('neu.pdf', await makePdf([{ width: 595, label: 'Vortrag' }, { width: 595, label: 'gleich' }])),
    ]);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Vergleichen' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vergleichen' }).click();
    await expect(page.getByRole('status')).toHaveText('Unterschiede auf 1 von 2 Seiten.');
    await expect(page.locator('.compare-text del')).toHaveText('Vertrag');
    await expect(page.locator('.compare-text ins')).toHaveText('Vortrag');
    await page.getByLabel('Bildvergleich (dunkel ist anders)').check();
    await expect(page.locator('canvas.compare-visual')).toBeVisible();
    await page.getByLabel('Zweites Dokument').selectOption({ label: 'alt.pdf' });
    await expect(page.getByText('Wähle zwei verschiedene Dokumente.')).toBeVisible();
  });

  test('says when two documents have the same text', async ({ app: page }) => {
    const same = await makePdf([{ width: 595, label: 'gleich' }]);
    await page.getByTestId('file-input').setInputFiles([pdfFile('eins.pdf', same), pdfFile('zwei.pdf', same)]);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Vergleichen' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vergleichen' }).click();
    await expect(page.getByRole('status')).toHaveText('Kein Unterschied im Text.');
  });

  test('compresses a file with a large picture and shows the sizes before and after', async ({ app: page }) => {
    const photo = await makePhotoPdf();
    await page.getByTestId('file-input').setInputFiles(pdfFile('foto.pdf', photo));
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Komprimieren' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Komprimieren' }).click();
    await expect(page.getByRole('status')).toContainText('Vorher');
    await expect(page.getByRole('status')).toContainText('nachher');
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    const saved = await file;
    expect(saved.suggestedFilename()).toBe('foto-komprimiert.pdf');
    expect((await downloadBytes(saved)).length).toBeLessThan(photo.length / 3);
  });

  test('exports pages as pictures, a single one as PNG and several as a ZIP', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('zwei.pdf', await makePdf([{ width: 300, height: 200 }, { width: 301, height: 200 }])));
    await expect(page.locator('.card img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    const zipped = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const zipFile = await zipped;
    expect(zipFile.suggestedFilename()).toBe('zwei-Bilder.zip');
    expect(Object.keys(unzipSync(await downloadBytes(zipFile))).sort()).toEqual(['zwei-01.png', 'zwei-02.png']);

    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    const single = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const png = await single;
    expect(png.suggestedFilename()).toBe('zwei-01.png');
    expect([...(await downloadBytes(png)).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
