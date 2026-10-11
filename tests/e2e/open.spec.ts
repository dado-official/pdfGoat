import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { describePdf, makeHalfBrokenPdf, makePdf, makeProtectedPdf } from '../fixtures';
import { pdfFile, cards, card, downloadBytes, widthsAndRotations, test } from './helpers';

test('shows a PDF with an embedded font and starts the PDF engine only when a file is opened', async ({ app: page }) => {
  const scripts = () => page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
  expect((await scripts()).some((name) => name.includes('view.worker'))).toBe(false);

  const bytes = await readFile(new URL('../files/embedded-font.pdf', import.meta.url));
  await page.getByTestId('file-input').setInputFiles(pdfFile('schrift.pdf', bytes));
  await expect(card(page, 0).locator('img')).toBeVisible();
  expect((await scripts()).some((name) => name.includes('view.worker'))).toBe(true);
});

test('a damaged page shows a placeholder, and the good pages can still be saved', async ({ page }) => {
  // Not the `app` fixture: the browser reports the damaged page in its console, which is expected here.
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(pdfFile('halb.pdf', await makeHalfBrokenPdf()));
  await expect(cards(page)).toHaveCount(2);
  await expect(card(page, 0).locator('img')).toBeVisible();
  await expect(card(page, 1)).toContainText('Keine Vorschau');

  await page.getByRole('button', { name: 'PDF speichern' }).click();
  await expect(page.getByRole('alert')).toContainText('Seite 2 von „halb.pdf“ ist beschädigt');

  await card(page, 1).getByLabel('Seite löschen').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF speichern' }).click();
  expect(await widthsAndRotations(await downloadBytes(await download))).toEqual(['501@0']);
});

test.describe('files handed over by the system', () => {
  // A stand-in for the File System Access API: handles that keep what is written into them.
  const fakeSystem = () => {
    const w = window as unknown as Record<string, unknown>;
    w.__written = null;
    // The browser has a launch queue of its own; this one replaces it.
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer: (cb: unknown) => (w.__launch = cb) } });
    w.__handle = (name: string, bytes: number[]) => ({
      kind: 'file',
      name,
      getFile: async () => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }),
      createWritable: async () => ({
        write: async (data: Uint8Array) => {
          w.__written = Array.from(data);
        },
        close: async () => undefined,
      }),
      requestPermission: async () => 'granted',
    });
  };

  test('opens a PDF that the system hands over and writes the changed document back into the same file', async ({ app: page }) => {
    await page.addInitScript(fakeSystem);
    await page.reload();
    await page.waitForFunction(() => typeof (window as unknown as { __launch?: unknown }).__launch === 'function');
    const original = Array.from(await makePdf([{ width: 501 }, { width: 502 }]));
    await page.evaluate((bytes) => {
      const w = window as unknown as { __launch: (p: { files: unknown[] }) => void; __handle: (n: string, b: number[]) => unknown };
      w.__launch({ files: [w.__handle('echt.pdf', bytes)] });
    }, original);
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'In der Datei speichern' })).toBeVisible();
    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('button', { name: 'Rechts drehen' }).click();
    await page.getByRole('button', { name: 'In der Datei speichern' }).click();
    await expect(page.getByText('Die Datei echt.pdf wird mit dem bearbeiteten Dokument überschrieben.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Überschreiben' }).click();
    await expect(page.getByText('Gespeichert in echt.pdf.')).toBeVisible();
    const written = await page.evaluate(() => (window as unknown as { __written: number[] }).__written);
    expect(await widthsAndRotations(new Uint8Array(written))).toEqual(['501@90', '502@0']);
  });

  test('offers no overwriting for a file that was opened without a handle', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('a.pdf', await makePdf([{ width: 300 }])));
    await expect(page.locator('.card img')).toBeVisible();
    await expect(page.getByRole('button', { name: 'In der Datei speichern' })).toHaveCount(0);
  });
});

test.describe('files that cannot be opened', () => {
  test('rejects files that are not PDFs', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('kaputt.pdf', Buffer.from('das ist kein pdf')));
    await expect(page.getByRole('alert')).toContainText('„kaputt.pdf“ konnte nicht als PDF gelesen werden');
    await expect(cards(page)).toHaveCount(0);
  });

  test('asks for the password of a protected PDF, retries after a wrong one and saves it unprotected', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('geheim.pdf', await makeProtectedPdf('geheim')));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('„geheim.pdf“ ist passwortgeschützt');

    await dialog.getByLabel('Passwort').fill('falsch');
    await dialog.getByRole('button', { name: 'Öffnen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Das Passwort stimmt nicht');

    await dialog.getByLabel('Passwort').fill('geheim');
    await dialog.getByRole('button', { name: 'Öffnen' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Schutz entfernt' })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /PDF speichern/ }).click()]);
    const bytes = await downloadBytes(download);
    expect(await widthsAndRotations(bytes)).toEqual(['400@0']);
    // An unprotected file opens without a password.
    expect(await describePdf(bytes)).toHaveLength(1);
  });

  test('skipping the password dialog opens nothing and shows no error', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('geheim.pdf', await makeProtectedPdf('geheim')));
    await page.getByRole('dialog').getByRole('button', { name: 'Überspringen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // Such a file opens without a password and is saved without protection.
  test('opens a PDF that is encrypted with an owner password only', async ({ app: page }) => {
    const bytes = await readFile(new URL('../files/owner-encrypted.pdf', import.meta.url));
    await page.getByTestId('file-input').setInputFiles(pdfFile('gesperrt.pdf', bytes));
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: 'Schutz entfernt' })).toBeVisible();
  });

  test('names every broken file and still opens the good ones', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles([
      pdfFile('eins.pdf', Buffer.from('kaputt')),
      pdfFile('gut.pdf', await makePdf([{ width: 300 }])),
      pdfFile('zwei.pdf', Buffer.from('auch kaputt')),
    ]);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('„eins.pdf“');
    await expect(alert).toContainText('„zwei.pdf“');
    await expect(cards(page)).toHaveCount(1);
  });
});
