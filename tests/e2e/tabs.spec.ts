import { expect, type Page } from '@playwright/test';
import { describePdf, makePdf } from '../fixtures';
import { pdfFile, cards, card, downloadBytes, widthsAndRotations, test } from './helpers';

test.describe('tabs', () => {
  async function openTwo(page: Page) {
    const a = await makePdf([501, 502, 503].map((width) => ({ width })));
    const b = await makePdf([601, 602].map((width) => ({ width })));
    await page.getByTestId('file-input').setInputFiles([pdfFile('a.pdf', a), pdfFile('b.pdf', b)]);
    await expect(page.getByRole('tab')).toHaveCount(2);
  }
  const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

  test('opens every file in its own tab with its own pages and history', async ({ app: page }) => {
    await openTwo(page);
    await expect(tab(page, 'b.pdf')).toHaveAttribute('aria-selected', 'true');
    await expect(cards(page)).toHaveCount(2);

    await tab(page, 'a.pdf').click();
    await expect(cards(page)).toHaveCount(3);
    await card(page, 0).hover();
    await card(page, 0).getByRole('button', { name: /löschen/i }).click();
    await expect(cards(page)).toHaveCount(2);

    await tab(page, 'b.pdf').click();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Rückgängig/ })).toBeDisabled();
    await tab(page, 'a.pdf').click();
    await page.getByRole('button', { name: /Rückgängig/ }).click();
    await expect(cards(page)).toHaveCount(3);
  });

  test('never undoes the opening of a file', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }])));
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Rückgängig/ })).toBeDisabled();
    await page.keyboard.press('Control+z');
    await expect(cards(page)).toHaveCount(1);
  });

  test('asks before closing a tab with changes, but not one without', async ({ app: page }) => {
    await openTwo(page);
    page.once('dialog', (d) => {
      throw new Error(`unexpected dialog: ${d.message()}`);
    });
    await page.getByRole('button', { name: 'b.pdf schließen' }).click();
    await expect(page.getByRole('tab')).toHaveCount(1);
    page.removeAllListeners('dialog');

    await card(page, 0).hover();
    await card(page, 0).getByRole('button', { name: /löschen/i }).click();
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'a.pdf schließen' }).click();
    await expect(page.getByRole('tab')).toHaveCount(1);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'a.pdf schließen' }).click();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'PDF auswählen' })).toBeVisible();
  });

  test('merges chosen documents in the chosen order into a new tab, leaving the others as they are', async ({ app: page }) => {
    await openTwo(page);
    await page.getByTestId('merge').click();
    await page.getByRole('button', { name: 'b.pdf nach oben' }).click();
    await page.getByTestId('merge-submit').click();
    await expect(tab(page, 'Zusammengefügt')).toHaveAttribute('aria-selected', 'true');
    await expect(cards(page)).toHaveCount(5);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Zusammengefügt speichern/ }).click();
    expect(await widthsAndRotations(await downloadBytes(await download))).toEqual(
      ['601@0', '602@0', '501@0', '502@0', '503@0'],
    );
    await tab(page, 'a.pdf').click();
    await expect(cards(page)).toHaveCount(3);
  });

  test('keeps the files of a merged document after the original tabs are closed', async ({ app: page }) => {
    await openTwo(page);
    await page.getByTestId('merge').click();
    await page.getByTestId('merge-submit').click();
    await page.getByRole('button', { name: 'a.pdf schließen' }).click();
    await page.getByRole('button', { name: 'b.pdf schließen' }).click();
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(card(page, 0).locator('img')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Zusammengefügt speichern/ }).click();
    expect((await describePdf(await downloadBytes(await download))).map((p) => p.width)).toEqual([501, 502, 503, 601, 602]);
  });

  test('comes back to the place in the reading view when switching tabs', async ({ app: page }) => {
    await openTwo(page);
    await tab(page, 'a.pdf').click();
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await page.locator('.reader-scroll').focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('textbox', { name: /Seite/ })).toHaveValue('3');

    await tab(page, 'b.pdf').click();
    await expect(page.locator('.reader')).toHaveCount(0);
    await tab(page, 'a.pdf').click();
    await expect(page.locator('.reader')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Seite/ })).toHaveValue('3');
  });
});
