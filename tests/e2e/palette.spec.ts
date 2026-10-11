import { expect, type Page } from '@playwright/test';
import { makePdf } from '../fixtures';
import { pdfFile, cards, card, test } from './helpers';

test.describe('command palette', () => {
  const palette = (page: Page) => page.getByRole('dialog', { name: 'Befehle' });
  const box = (page: Page) => palette(page).getByRole('combobox');

  test('opens with Ctrl+K, filters while typing and runs the chosen command with Enter', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }, { width: 400 }])));
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await box(page).fill('lesen');
    await expect(palette(page).getByRole('option')).toHaveCount(1);
    await box(page).press('Enter');
    await expect(palette(page)).toHaveCount(0);
    await expect(page.locator('.reader')).toBeVisible();
  });

  test('only offers commands that can run now', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }, { width: 400 }])));
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Control+k');
    await box(page).fill('drehen');
    await expect(palette(page)).toContainText('Kein passender Befehl');
    await page.keyboard.press('Escape');

    await card(page, 0).getByRole('button', { name: /Seite 1 auswählen/ }).click();
    await page.keyboard.press('Control+k');
    await box(page).fill('rechts dreh');
    await box(page).press('Enter');
    await expect(card(page, 0).locator('img')).toHaveCSS('transform', /matrix\(0, 1, -1, 0/);
  });

  test('moves through the list with the arrow keys and closes with Escape', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }])));
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Control+k');
    const options = palette(page).getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await box(page).press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await box(page).press('Escape');
    await expect(palette(page)).toHaveCount(0);
  });

  test('is available on the start page too', async ({ app: page }) => {
    await page.keyboard.press('Control+k');
    await box(page).fill('öffnen');
    await expect(palette(page).getByRole('option')).toHaveCount(1);
  });

  test('finds commands in English as well', async ({ app: page }) => {
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }])));
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('print');
    await expect(page.getByRole('option', { name: /Print/ })).toBeVisible();
  });
});
