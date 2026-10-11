import { expect, type Page } from '@playwright/test';
import { makeContentPdf, imageCount, textOf, tinyPng } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

test.describe('changing existing content', () => {
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openContent(page: Page) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('inhalt.pdf', await makeContentPdf()));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img').first()).toBeVisible();
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  test('changes a line of text and leaves the next one alone', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Text ändern').click();
    await page.getByRole('button', { name: 'Erste Zeile' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.getByText('Vorher: Erste Zeile')).toBeVisible();
    const field = page.getByRole('textbox', { name: 'Neuer Text der Zeile' });
    await field.fill('Geänderte Zeile für Müller');
    await field.blur();
    await expect(page.locator('.edit-text')).toHaveText('Geänderte Zeile für Müller');
    const text = (await textOf(await download(page)))[0];
    expect(text).toContain('Geänderte Zeile für Müller');
    expect(text).toContain('Zweite Zeile');
    expect(text).not.toContain('Erste Zeile');
  });

  test('takes a change back', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Text ändern').click();
    await page.getByRole('button', { name: 'Zweite Zeile' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByRole('button', { name: 'Änderung zurücknehmen' }).click();
    await expect(page.locator('.edit-text')).toHaveCount(0);
    expect((await textOf(await download(page)))[0]).toContain('Zweite Zeile');
  });

  test('removes a picture and brings it back with undo', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Bild ändern').click();
    await page.getByRole('button', { name: '#1' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.getByText('Das Bild wurde geändert.')).toBeVisible();
    await page.getByRole('button', { name: 'Entfernen' }).click();
    await expect(page.getByText('Bild entfernt')).toBeVisible();
    const bytes = await download(page);
    expect(await imageCount(bytes)).toBe(0);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('Das Bild wurde geändert.')).toBeVisible();
  });

  test('replaces a picture with another one', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Bild ändern').click();
    await page.getByRole('button', { name: '#1' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByTestId('replace-input').setInputFiles({ name: 'neu.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(page.locator('.edit-picture')).toBeVisible();
    expect(await imageCount(await download(page))).toBe(1);
  });

  test('pulls a changed picture bigger by a corner and keeps its shape', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Bild ändern').click();
    await page.getByRole('button', { name: '#1' }).click();
    const picture = page.locator('.edit-picture');
    const before = (await picture.boundingBox())!;
    await expect(page.locator('[data-handle="se"]')).toBeVisible();
    const corner = (await page.locator('[data-handle="se"]').first().boundingBox())!;
    const [x, y] = [corner.x + corner.width / 2, corner.y + corner.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 120, { steps: 5 });
    await page.mouse.up();
    const after = (await picture.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2);
    expect(after.x).toBeCloseTo(before.x, 0); // the opposite corner stays
    await page.keyboard.press('Control+z');
    expect((await picture.boundingBox())!.width).toBeCloseTo(before.width, 0);
  });
});
