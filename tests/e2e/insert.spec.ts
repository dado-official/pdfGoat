import { expect, type Page } from '@playwright/test';
import { annotationsOf, imageCount, textOf, tinyPng, makePdf } from '../fixtures';
import { pdfFile, cards, card, downloadBytes, widthsAndRotations, test } from './helpers';

test.describe('inserting and page tools', () => {
  const sheet = (page: Page) => page.locator('.read-page').first();
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openOne(page: Page, bytes: Uint8Array, view: 'Lesen' | 'Seiten' = 'Lesen') {
    await page.getByTestId('file-input').setInputFiles(pdfFile('doc.pdf', bytes));
    await expect(page.locator('.card img').first()).toBeVisible();
    if (view === 'Lesen') {
      await page.getByRole('button', { name: 'Lesen', exact: true }).click();
      await expect(page.locator('.read-page img').first()).toBeVisible();
    }
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  async function drag(page: Page, from: [number, number], to: [number, number]) {
    const box = (await sheet(page).boundingBox())!;
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
    await page.mouse.up();
  }

  test('inserts text with umlauts into the page itself', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Text einfügen').click();
    await drag(page, [100, 200], [400, 260]);
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    const field = page.getByRole('textbox', { name: 'Kommentartext' });
    await field.fill('Größe 5 € für Müller');
    await field.blur();
    await expect(page.locator('.annot-text')).toHaveText('Größe 5 € für Müller');
    const bytes = await download(page);
    expect((await textOf(bytes))[0]).toContain('Größe 5 € für Müller');
    // It is page content now, not a comment.
    expect((await annotationsOf(bytes))[0]).toEqual([]);
  });

  test('warns about characters the font does not have', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Text einfügen').click();
    await sheet(page).click({ position: { x: 150, y: 200 } });
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByRole('textbox', { name: 'Kommentartext' }).fill('日本');
    await expect(page.getByRole('status')).toContainText('日 本');
  });

  test('inserts a picture and a link', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Bild einfügen').click();
    await page.getByTestId('picture-input').setInputFiles({ name: 'rot.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(tool(page, 'Bild einfügen')).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).click({ position: { x: 150, y: 200 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(1);
    await tool(page, 'Link').click();
    await drag(page, [300, 230], [450, 270]);
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    const field = page.getByRole('textbox', { name: 'Adresse des Links' });
    await field.fill('https://example.org/');
    await field.blur();
    const bytes = await download(page);
    expect(await imageCount(bytes)).toBe(1);
    expect((await annotationsOf(bytes))[0].map((a) => a.type)).toEqual(['Link']);
  });

  test('numbers the pages and puts a watermark on them', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'A1' }, { width: 595, label: 'A2' }]), 'Seiten');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await expect(page.getByText('Gilt für alle 2 Seiten.')).toBeVisible();
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await page.getByLabel('Vorlage').selectOption('watermark');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    const texts = await textOf(await download(page));
    expect(texts[0]).toContain('1 / 2');
    expect(texts[1]).toContain('2 / 2');
    expect(texts[1]).toContain('ENTWURF');
  });

  test('shows the numbers in the preview and removes a mark again', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'A1' }]), 'Seiten');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.locator('.card-thumb').first().dblclick();
    await expect(page.locator('.preview-body img')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await expect(page.getByText('Schon vorhanden')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('Schon vorhanden')).toHaveCount(0);
  });

  test('inserts an empty page after the selected one', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 501, label: 'A1' }, { width: 502, label: 'A2' }]), 'Seiten');
    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('button', { name: 'Leere Seite einfügen' }).click();
    await expect(cards(page)).toHaveCount(3);
    expect(await widthsAndRotations(await download(page))).toEqual(['501@0', '501@0', '502@0']);
  });

  test('crops pages and changes their size', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 300, height: 400 }]), 'Seiten');
    await page.getByRole('button', { name: 'Zuschneiden' }).click();
    await page.getByRole('button', { name: 'Zuschneiden' }).last().click();
    // 10 mm = 28.35 pt cut from each side.
    expect(await widthsAndRotations(await download(page))).toEqual(['243@0']);
    await page.getByRole('button', { name: 'Seitengröße' }).click();
    await page.getByRole('button', { name: 'Anwenden' }).click();
    expect(await widthsAndRotations(await download(page))).toEqual(['595@0']);
  });
});
