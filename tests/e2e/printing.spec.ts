import { expect, type Page } from '@playwright/test';
import { makePdf } from '../fixtures';
import { pdfFile, openFixtures, cards, card, test } from './helpers';

test.describe('printing', () => {
  // The print dialog cannot be driven in a test, so print() only records what is on the page.
  test.beforeEach(async ({ app: page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { printed: { images: number; classes: string[] }[] };
      w.printed = [];
      window.print = () => {
        const images = [...document.querySelectorAll<HTMLImageElement>('.print-sheet img')];
        w.printed.push({ images: images.length, classes: images.map((i) => i.className) });
      };
    });
  });
  const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: unknown[] }).printed);

  test('draws the edited page list and prints it, then frees the images', async ({ app: page }) => {
    await openFixtures(page);
    await card(page, 1).hover();
    await card(page, 1).getByRole('button', { name: /löschen/i }).click();
    await page.getByRole('button', { name: /Drucken/ }).click();
    await expect.poll(() => printed(page)).toHaveLength(1);
    expect(await printed(page)).toEqual([{ images: 4, classes: [...Array(3).fill('print-page portrait'), 'print-page landscape'] }]);
    await expect(page.locator('.print-sheet img')).toHaveCount(4);

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('.print-sheet')).toHaveCount(0);
  });

  test('prints wide pages in landscape', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('quer.pdf', await makePdf([{ width: 800, height: 400 }, { width: 400 }])));
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Control+p');
    await expect.poll(() => printed(page)).toHaveLength(1);
    expect(await printed(page)).toEqual([{ images: 2, classes: ['print-page landscape', 'print-page portrait'] }]);
  });

  test('hides the editor when printing', async ({ app: page }) => {
    await openFixtures(page);
    await page.getByRole('button', { name: /Drucken/ }).click();
    await expect.poll(() => printed(page)).toHaveLength(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.shell')).toBeHidden();
    await expect(page.locator('.print-sheet')).toBeVisible();
  });
});
