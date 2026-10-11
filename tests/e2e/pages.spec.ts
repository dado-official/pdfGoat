import { expect } from '@playwright/test';
import { unzipSync } from 'fflate';
import { rm, writeFile } from 'node:fs/promises';
import { makePdf } from '../fixtures';
import { pdfFile, openFixtures, cards, card, downloadBytes, widthsAndRotations, test } from './helpers';

test('shows the empty state with the privacy promise', async ({ app: page }) => {
  await expect(page.getByRole('heading', { name: 'PDFgoat' })).toBeVisible();
  await expect(page.getByText('Nichts wird hochgeladen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PDFs bearbeiten, ohne Upload.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF auswählen' })).toBeVisible();
  await expect(page.getByRole('toolbar')).toHaveCount(0); // the tools appear once a file is open
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('merges two files after rotating, deleting and reordering', async ({ app: page }) => {
  await openFixtures(page);
  await expect(page.getByText('5 Seiten aus 2 Dateien')).toBeVisible();

  await card(page, 0).getByLabel('Im Uhrzeigersinn drehen').click(); // A1 → 90°
  await card(page, 1).getByLabel('Seite löschen').click(); // A2 gone: A1 A3 B1 B2
  await card(page, 3).dragTo(card(page, 1), { targetPosition: { x: 5, y: 50 } }); // B2 before A3
  await expect(cards(page)).toHaveCount(4);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zusammengefügt speichern' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('zusammengefuegt.pdf');
  expect(await widthsAndRotations(await downloadBytes(file))).toEqual(['501@90', '602@0', '503@0', '601@0']);
});

test('undo restores the previous order', async ({ app: page }) => {
  await openFixtures(page);
  await card(page, 0).getByLabel('Nach rechts verschieben').click();
  await page.getByRole('button', { name: 'Reihenfolge umkehren' }).click();
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'Rückgängig' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zusammengefügt speichern' }).click();
  expect(await widthsAndRotations(await downloadBytes(await download))).toEqual([
    '501@0', '502@0', '503@0', '601@0', '602@0',
  ]);
});

test('redo brings back what undo removed, by button and by keyboard', async ({ app: page }) => {
  await openFixtures(page);
  const redo = page.getByRole('button', { name: 'Wiederholen' });
  await expect(redo).toBeDisabled();

  await card(page, 0).getByLabel('Seite löschen').click(); // A1 gone
  await page.getByRole('button', { name: 'Reihenfolge umkehren' }).click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(5);
  await redo.click(); // A1 gone again
  await page.keyboard.press('Control+y'); // reversed again
  await expect(redo).toBeDisabled();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zusammengefügt speichern' }).click();
  expect(await widthsAndRotations(await downloadBytes(await download))).toEqual([
    '602@0', '601@0', '503@0', '502@0',
  ]);
});

test('rotates and deletes a shift-click selection', async ({ app: page }) => {
  await openFixtures(page);
  await card(page, 1).locator('.card-thumb').click();
  await card(page, 3).locator('.card-thumb').click({ modifiers: ['Shift'] });
  await expect(page.getByText('3 ausgewählt')).toBeVisible();
  await page.getByRole('button', { name: 'Links drehen' }).click();
  await page.keyboard.press('Escape'); // clear the selection
  await card(page, 4).locator('.card-thumb').click();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(4);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zusammengefügt speichern' }).click();
  expect(await widthsAndRotations(await downloadBytes(await download))).toEqual([
    '501@0', '502@270', '503@270', '601@270',
  ]);
});

test('no longer counts a file once all of its pages are deleted', async ({ app: page }) => {
  await openFixtures(page);
  await card(page, 4).getByLabel('Seite löschen').click();
  await card(page, 3).getByLabel('Seite löschen').click();
  await expect(page.locator('.status')).toContainText('3 Seiten');
  await expect(page.locator('.status')).not.toContainText('Dateien');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF speichern' }).click();
  expect((await download).suggestedFilename()).toBe('a.pdf');
});

// Sync folders, scanners and cleaned-up download folders change files behind the browser's back.
test('still saves the opened pages after the file on disk was overwritten and deleted', async ({ app: page }, testInfo) => {
  const path = testInfo.outputPath('vertrag.pdf');
  await writeFile(path, await makePdf([{ width: 501 }, { width: 502 }]));
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(cards(page)).toHaveCount(2);

  await writeFile(path, await makePdf([{ width: 999 }]));
  await rm(path);
  await card(page, 0).getByLabel('Im Uhrzeigersinn drehen').click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF speichern' }).click();
  expect(await widthsAndRotations(await downloadBytes(await download))).toEqual(['501@90', '502@0']);
});

test('splits by page ranges into a ZIP', async ({ app: page }) => {
  await openFixtures(page);
  await page.getByRole('button', { name: 'Aufteilen', exact: false }).first().click();
  await page.getByRole('textbox', { name: 'Seitenbereiche' }).fill('1-2, 3, 4-');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aufteilen & herunterladen' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('zusammengefuegt-aufgeteilt.zip');

  const parts = unzipSync(await downloadBytes(file));
  expect(Object.keys(parts)).toEqual([
    'zusammengefuegt-01_S1-2.pdf',
    'zusammengefuegt-02_S3.pdf',
    'zusammengefuegt-03_S4-5.pdf',
  ]);
  expect(await widthsAndRotations(parts['zusammengefuegt-03_S4-5.pdf'])).toEqual(['601@0', '602@0']);
});

test('shows an error for an invalid range and keeps the dialog open', async ({ app: page }) => {
  await openFixtures(page);
  await page.getByRole('button', { name: /Aufteilen/ }).first().click();
  await page.getByRole('textbox', { name: 'Seitenbereiche' }).fill('2-9');
  await page.getByRole('button', { name: 'Aufteilen & herunterladen' }).click();
  await expect(page.getByRole('alert')).toContainText('außerhalb von 1–5');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('saves the selection as one PDF', async ({ app: page }) => {
  await openFixtures(page);
  await card(page, 4).locator('.card-thumb').click();
  await card(page, 0).locator('.card-thumb').click();
  await page.getByRole('button', { name: /Aufteilen/ }).first().click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aufteilen & herunterladen' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('zusammengefuegt-auswahl.pdf');
  expect(await widthsAndRotations(await downloadBytes(file))).toEqual(['501@0', '602@0']);
});

test('opens the large preview and steps through pages', async ({ app: page }) => {
  await openFixtures(page);
  await card(page, 1).locator('.card-thumb').dblclick();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Seite 2 von 5');
  await expect(dialog.locator('img')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog).toContainText('Seite 3 von 5');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('renders previews only for pages near the visible area', async ({ app: page }) => {
  const many = await makePdf(Array.from({ length: 80 }, () => ({ width: 300, height: 400 })));
  await page.getByTestId('file-input').setInputFiles(pdfFile('viele.pdf', many));
  await expect(cards(page)).toHaveCount(80);
  await expect(card(page, 0).locator('img')).toBeVisible();

  const last = card(page, 79);
  await expect(last.locator('img')).toHaveCount(0);
  expect(await page.locator('.card img').count()).toBeLessThan(80);

  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('img')).toBeVisible();
});
