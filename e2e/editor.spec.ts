import { expect, test as base, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { describePdf, makePdf } from '../tests/fixtures';

// a.pdf: pages 501, 502, 503 wide. b.pdf: 601, 602 (landscape). The width identifies each page in the output.
async function openFixtures(page: Page) {
  const a = await makePdf([501, 502, 503].map((width, i) => ({ width, label: `A${i + 1}` })));
  const b = await makePdf([
    { width: 601, label: 'B1' },
    { width: 602, height: 400, label: 'B2' },
  ]);
  await page.getByTestId('file-input').setInputFiles([
    { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from(a) },
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b) },
  ]);
  await expect(page.locator('.card')).toHaveCount(5);
  await expect(page.locator('.card img')).toHaveCount(5); // all previews rendered
}

const cards = (page: Page) => page.locator('.card');
const card = (page: Page, n: number) => cards(page).nth(n);

async function downloadBytes(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}

async function widthsAndRotations(bytes: Uint8Array) {
  return (await describePdf(bytes)).map((p) => `${p.width}@${p.rotation}`);
}

/**
 * Every test opens the app and, when it ends, checks the privacy guarantee:
 * no request to anything but the local server, and no console errors.
 */
const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      const local = ['localhost', '127.0.0.1'].includes(url.hostname) || ['blob:', 'data:'].includes(url.protocol);
      if (!local) external.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    await use(page);
    expect(external, 'external requests').toEqual([]);
    expect(errors, 'console errors').toEqual([]);
  },
});

test('shows the empty state with the privacy promise', async ({ app: page }) => {
  await expect(page.getByRole('heading', { name: 'PDFgoat' })).toBeVisible();
  await expect(page.getByText('Nichts wird hochgeladen')).toBeVisible();
  await expect(page.getByRole('button', { name: /PDF hier ablegen/ })).toBeVisible();
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

test('rejects files that are not PDFs', async ({ app: page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'kaputt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('das ist kein pdf'),
  });
  await expect(page.getByRole('alert')).toContainText('konnte nicht als PDF gelesen werden');
});
