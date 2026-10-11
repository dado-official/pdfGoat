import { expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { describePdf, passwordInfo, textOf, makePdf } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

test.describe('workflows', () => {
  async function openBatch(page: Page) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('start.pdf', await makePdf([{ width: 300 }])));
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Abläufe' }).first().click();
  }

  test('applies a list of steps to several files and saves them as a ZIP', async ({ app: page }) => {
    await openBatch(page);
    await page.getByLabel('Schritt hinzufügen').selectOption('mark');
    await page.getByLabel('Schritt hinzufügen').selectOption('rotate');
    await page.getByTestId('batch-input').setInputFiles([
      pdfFile('eins.pdf', await makePdf([{ width: 301, label: 'A' }, { width: 302, label: 'B' }])),
      pdfFile('zwei.pdf', await makePdf([{ width: 303, label: 'C' }])),
      { name: 'kaputt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('das ist kein PDF') },
    ]);
    await expect(page.getByText('3 Dateien gewählt')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Anwenden' }).click();
    await expect(page.locator('.batch-rows li[data-state="done"]')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.batch-rows li[data-state="failed"]')).toHaveCount(1);
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ergebnis speichern' }).click();
    const zipFile = await file;
    expect(zipFile.suggestedFilename()).toBe('bearbeitete-pdfs.zip');
    const parts = unzipSync(await downloadBytes(zipFile));
    expect(Object.keys(parts).sort()).toEqual(['eins-bearbeitet.pdf', 'zwei-bearbeitet.pdf']);
    const eins = parts['eins-bearbeitet.pdf'];
    expect((await textOf(eins)).map((t) => t.includes('1 / 2') || t.includes('2 / 2'))).toEqual([true, true]);
    expect((await describePdf(eins)).map((p) => p.rotation)).toEqual([90, 90]);
  });

  test('saves a workflow without its passwords and loads it again', async ({ app: page }) => {
    await openBatch(page);
    await page.getByLabel('Schritt hinzufügen').selectOption('protect');
    await page.getByLabel('Passwort zum Öffnen', { exact: true }).fill('geheim');
    await page.getByLabel('Schritt hinzufügen').selectOption('flatten');
    await page.getByLabel('Name', { exact: true }).fill('Vertraulich');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Abläufe' }).first().click();
    await page.getByLabel('Gespeicherte Abläufe').selectOption('Vertraulich');
    await expect(page.getByText('Passwort und Berechtigungen', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Formular glätten', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Passwort zum Öffnen', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('pdfgoat.workflows'))).not.toContain('geheim');
  });

  test('protects every file with the password typed for this run', async ({ app: page }) => {
    await openBatch(page);
    await page.getByLabel('Schritt hinzufügen').selectOption('protect');
    await page.getByLabel('Passwort zum Öffnen', { exact: true }).fill('lauf');
    await page.getByTestId('batch-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 301 }])));
    await page.getByRole('dialog').getByRole('button', { name: 'Anwenden' }).click();
    await expect(page.locator('.batch-rows li[data-state="done"]')).toHaveCount(1, { timeout: 30_000 });
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ergebnis speichern' }).click();
    expect(await passwordInfo(await downloadBytes(await file), 'lauf')).toEqual({ asks: true, opens: true });
  });
});
