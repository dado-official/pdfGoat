import { expect } from '@playwright/test';
import { makePdf } from '../fixtures';
import { pdfFile, card, test } from './helpers';

test.describe('legal pages', () => {
  test('are reachable from the start page and from a document, and lead back', async ({ app: page }) => {
    await page.getByRole('link', { name: 'Datenschutz' }).click();
    await expect(page.getByRole('heading', { name: 'Datenschutz', level: 2 })).toBeVisible();
    await expect(page.getByText('Deine PDF-Dateien verlassen deinen Browser nicht.')).toBeVisible();
    await page.getByRole('link', { name: 'Impressum' }).click();
    await expect(page.getByRole('heading', { name: 'Impressum', level: 2 })).toBeVisible();
    await page.getByRole('link', { name: 'Lizenzen' }).click();
    await expect(page.getByRole('link', { name: 'mupdf', exact: true })).toBeVisible();
    await expect(page.getByText('AGPL-3.0-or-later')).toBeVisible();
    await page.getByRole('link', { name: 'Zurück zu PDFgoat' }).click();
    await expect(page.getByRole('heading', { name: 'Edit PDFs without uploading.' }).or(page.getByRole('heading', { name: /ohne Upload/ }))).toBeVisible();
  });

  test('keep the open document while they are read', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('bleibt.pdf', await makePdf([{ width: 300 }, { width: 301 }])));
    await expect(page.locator('.card')).toHaveCount(2);
    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('link', { name: 'Impressum' }).click();
    await expect(page.getByRole('heading', { name: 'Impressum', level: 2 })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.locator('.card.selected')).toHaveCount(1);
  });

  test('speak English when the language is switched, and show no warning now that the details are complete', async ({ app: page }) => {
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByText('Your PDF files never leave your browser.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'danielnagler1507@gmail.com' }).first()).toBeVisible();
  });

  test('serve the licence texts', async ({ app: page, request, baseURL }) => {
    const licence = await request.get(new URL('LICENSE.txt', baseURL!).href);
    expect(await licence.text()).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    const others = await (await request.get(new URL('third-party-licenses.txt', baseURL!).href)).text();
    for (const name of ['mupdf', 'react', 'tesseract.js', 'fflate', 'geist']) expect(others).toContain(name);
    void page;
  });
});
