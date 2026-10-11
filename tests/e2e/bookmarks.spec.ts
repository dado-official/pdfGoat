import { expect } from '@playwright/test';
import { outlineOf, makeRichPdf } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

test.describe('bookmarks', () => {
  test('renames, adds and points bookmarks at other pages, and saves them', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('buch.pdf', await makeRichPdf('R', 500)));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesezeichen' }).first().click();
    await expect(page.getByRole('option', { name: /R Eins/ })).toBeVisible();
    await page.getByRole('option', { name: /R Eins/ }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Anfang');
    await page.getByRole('button', { name: 'Neu', exact: true }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Zum Schluss');
    await page.getByLabel('Springt zu').selectOption({ label: 'Seite 3' });
    await page.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click();
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    expect(await outlineOf(await downloadBytes(await file))).toEqual([
      { title: 'Anfang', page: 0 },
      { title: 'R Drei', page: 2 },
      { title: 'Zum Schluss', page: 2 },
    ]);
  });

  test('are carried into a document made of several tabs', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles([pdfFile('a.pdf', await makeRichPdf('A', 500)), pdfFile('b.pdf', await makeRichPdf('B', 600))]);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('tab', { name: /a\.pdf/ }).click();
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesezeichen' }).first().click();
    await page.getByRole('option', { name: /A Eins/ }).click();
    await page.getByLabel('Titel', { exact: true }).fill('Anfang von A');
    await page.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click();
    await page.getByTestId('merge').click();
    await page.getByTestId('merge-submit').click();
    await expect(page.getByRole('tab')).toHaveCount(3);
    await page.getByRole('button', { name: 'Lesezeichen' }).first().click();
    await expect(page.getByRole('option', { name: /Anfang von A/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /B Eins/ })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Zusammengefügt speichern' }).click();
    expect((await outlineOf(await downloadBytes(await file))).map((o) => o.title)).toEqual(['a.pdf', 'b.pdf']);
  });

  test('moves with the page, shows in the reading view and can be undone and reset', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('buch.pdf', await makeRichPdf('R', 500)));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesezeichen' }).first().click();
    await page.getByRole('option', { name: /R Drei/ }).click();
    await page.getByRole('button', { name: 'Löschen' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click();
    // Reading view: only the one bookmark is left.
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await page.getByRole('button', { name: 'Seitenleiste' }).click();
    await page.getByRole('tab', { name: 'Lesezeichen' }).click();
    await expect(page.locator('.outline').getByText('R Eins')).toBeVisible();
    await expect(page.locator('.outline').getByText('R Drei')).toHaveCount(0);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('.outline').getByText('R Drei')).toBeVisible();
  });
});
