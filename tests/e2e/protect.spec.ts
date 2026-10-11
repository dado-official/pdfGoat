import { expect, type Page } from '@playwright/test';
import { annotationsOf, makeContentPdf, passwordInfo, textOf, makeCommentedPdf } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

test.describe('protecting', () => {
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openContent(page: Page, bytes?: Uint8Array) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('geheim.pdf', bytes ?? (await makeContentPdf())));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img').first()).toBeVisible();
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  test('redacts the matches of a search for good', async ({ app: page }) => {
    await openContent(page);
    await page.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('Erste');
    await expect(page.locator('.search-state')).toHaveText('1 von 1');
    await tool(page, 'Treffer schwärzen').click();
    await expect(page.locator('.annot-layer rect[fill^="rgb(20"]')).toHaveCount(1);
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.getByText('Wird beim Speichern endgültig entfernt', { exact: false }).first()).toBeVisible();
    const bytes = await download(page);
    const text = (await textOf(bytes))[0];
    expect(text).not.toContain('Erste');
    expect(text).toContain('Zweite Zeile');
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('Erste');
    // What a redaction does not reach is named after saving.
    await expect(page.getByRole('status').filter({ hasText: 'Lesezeichen, Metadaten' })).toBeVisible();
  });

  test('keeps redacted text out of an export as text', async ({ app: page }) => {
    await openContent(page);
    await page.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('Erste');
    await tool(page, 'Treffer schwärzen').click();
    await page.getByRole('button', { name: 'Seiten', exact: true }).click();
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel('Reiner Text').check();
    const file = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const text = new TextDecoder().decode(await downloadBytes(await file));
    expect(text).not.toContain('Erste');
    expect(text).toContain('Zweite Zeile');
  });

  test('draws a redaction area and takes it back', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Schwärzen').click();
    const box = (await page.locator('.read-page').first().boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 160, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: /^Kommentare \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByRole('button', { name: /^Kommentare \(0\)/ })).toBeVisible();
  });

  test('saves with a password to open', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Schutz und Prüfung').click();
    await page.getByLabel('Passwort zum Öffnen', { exact: true }).fill('öffne-mich');
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    const bytes = await download(page);
    expect(await passwordInfo(bytes, 'falsch')).toEqual({ asks: true, opens: false });
    expect(await passwordInfo(bytes, 'öffne-mich')).toEqual({ asks: true, opens: true });
  });

  test('refuses a password that the engine cannot carry', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Schutz und Prüfung').click();
    await page.getByLabel('Passwort zum Öffnen', { exact: true }).fill('a,b');
    await expect(page.getByRole('alert')).toContainText('kein Komma');
    await expect(page.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
  });

  test('shows what a file carries and removes comments when asked', async ({ app: page }) => {
    await openContent(page, await makeCommentedPdf());
    await tool(page, 'Schutz und Prüfung').click();
    await page.getByRole('tab', { name: 'Vor dem Weitergeben prüfen' }).click();
    await expect(page.getByRole('dialog').getByText('geheim.pdf')).toBeVisible();
    await expect(page.getByLabel(/Alle Kommentare/)).toBeVisible();
    await expect(page.getByText('(1)')).toBeVisible();
    await page.getByLabel(/Alle Kommentare/).check();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    expect(await annotationsOf(await download(page))).toEqual([[]]);
  });
});
