import { expect, type Page } from '@playwright/test';
import { annotationsOf, makeCommentedPdf, makePdf, tinyPng } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

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

  test('keeps a text that is still being typed when Save is clicked at once', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
    await tool(page, 'Textfeld').click();
    await sheet(page).click({ position: { x: 200, y: 120 } });
    await panelButton(page).click();
    await page.getByRole('textbox', { name: 'Kommentartext' }).fill('Sofort gespeichert');
    // No pause and no leaving the field: the click on Save is the only thing that follows.
    expect(await save(page)).toEqual([[{ type: 'FreeText', contents: 'Sofort gespeichert' }]]);
  });

  test('moves the chosen shape with the arrow keys instead of turning the page', async ({ app: page }) => {
    await page.getByTestId('file-input').setInputFiles(pdfFile('doc.pdf', await makePdf([{ width: 595 }, { width: 595 }])));
    await expect(page.locator('.card img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Lesen', exact: true }).click();
    await expect(page.locator('.read-page img').first()).toBeVisible();
    const shape = page.locator('.annot-layer svg rect.annot-shape').first();
    const at = async () => ({ x: Number(await shape.getAttribute('x')), y: Number(await shape.getAttribute('y')) });
    await tool(page, 'Rechteck').click();
    await drag(page, [100, 100], [220, 160]);
    const start = await at();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const moved = await at();
    expect(moved.x - start.x).toBeCloseTo(1, 1);
    expect(moved.y - start.y).toBeCloseTo(10, 1);
    await expect(page.locator('.page-field input')).toHaveValue('1');
  });

  test('grabs a line a few pixels beside it', async ({ app: page }) => {
    await openOne(page, await makePdf([{ width: 595 }]));
    await tool(page, 'Linie').click();
    await drag(page, [100, 200], [300, 200]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.annot-ring')).toHaveCount(0);
    await sheet(page).click({ position: { x: 200, y: 204 } });
    await expect(page.locator('.annot-ring')).toHaveCount(1);
  });

  test.describe('handles', () => {
    // Tall enough that the whole page is in view, so the mouse can reach every handle.
    test.beforeEach(async ({ app: page }) => page.setViewportSize({ width: 1280, height: 1500 }));

    const handle = async (page: Page, name: string) => {
      const box = (await page.locator(`[data-handle="${name}"]`).first().boundingBox())!;
      return [box.x + box.width / 2, box.y + box.height / 2] as const;
    };
    /** Pulls a handle by a distance in screen pixels. */
    async function pull(page: Page, name: string, dx: number, dy: number, shift = false) {
      const [x, y] = await handle(page, name);
      await page.mouse.move(x, y);
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
      await page.mouse.move(x + dx, y + dy, { steps: 3 });
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
    }
    const geometry = async (page: Page, selector: string, names: string[]) => {
      const el = page.locator(selector).last();
      return Promise.all(names.map(async (n) => Number(await el.getAttribute(n))));
    };
    const rect = (page: Page) => geometry(page, '.annot-layer svg rect.annot-shape:not(.annot-handle)', ['x', 'y', 'width', 'height']);

    test('pulls a rectangle bigger with its corner and keeps its shape with Shift', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await tool(page, 'Rechteck').click();
      await drag(page, [100, 100], [220, 160]);
      await expect(page.locator('[data-handle]')).toHaveCount(8);
      const [x, y, w, h] = await rect(page);
      await pull(page, 'se', 60, 10);
      const [x2, y2, w2, h2] = await rect(page);
      expect([x2, y2]).toEqual([x, y]); // the opposite corner stays
      expect(w2).toBeGreaterThan(w);
      expect(h2).toBeGreaterThan(h);
      await pull(page, 'se', 40, 0, true);
      const [, , w3, h3] = await rect(page);
      expect(w3 / h3).toBeCloseTo(w2 / h2, 2);
      // One pull is one step back.
      await page.keyboard.press('Control+z');
      expect(await rect(page)).toEqual([x2, y2, w2, h2]);
    });

    test('keeps a picture in shape, and lets go of it with Shift', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await page.getByTestId('picture-input').setInputFiles({ name: 'bild.png', mimeType: 'image/png', buffer: tinyPng() });
      await sheet(page).click({ position: { x: 150, y: 200 } });
      const size = () => geometry(page, '.annot-layer svg image', ['width', 'height']);
      const [w, h] = await size();
      await pull(page, 'se', 40, 200);
      const [w2, h2] = await size();
      expect(w2).toBeGreaterThan(w);
      expect(w2 / h2).toBeCloseTo(w / h, 3);
      await pull(page, 'se', -30, 100, true);
      const [w3, h3] = await size();
      expect(Math.abs(w3 / h3 - w2 / h2)).toBeGreaterThan(0.05);
    });

    test('keeps what is pulled on the page and above the smallest size', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await tool(page, 'Rechteck').click();
      await drag(page, [100, 100], [220, 160]);
      await pull(page, 'se', 3000, 3000);
      const [x, y, w, h] = await rect(page);
      expect(x + w).toBeCloseTo(595, 0);
      expect(y + h).toBeCloseTo(842, 0);
      await pull(page, 'nw', 5000, 5000);
      const [, , w2, h2] = await rect(page);
      expect(w2).toBeCloseTo(8, 0);
      expect(h2).toBeCloseTo(8, 0);
    });

    test('moves the end of a line and shows no handles for markings and notes', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595, label: 'Hallo' }]));
      await tool(page, 'Linie').click();
      await drag(page, [100, 200], [300, 230]);
      await expect(page.locator('[data-handle]')).toHaveCount(2);
      const [x1, y1, x2, y2] = await geometry(page, '.annot-layer svg line.annot-shape:not(.annot-handle)', ['x1', 'y1', 'x2', 'y2']);
      await pull(page, 'end', 40, -60);
      const moved = await geometry(page, '.annot-layer svg line.annot-shape:not(.annot-handle)', ['x1', 'y1', 'x2', 'y2']);
      expect(moved.slice(0, 2)).toEqual([x1, y1]);
      expect(moved[2]).toBeGreaterThan(x2);
      expect(moved[3]).toBeLessThan(y2);
      await tool(page, 'Notiz').click();
      await sheet(page).click({ position: { x: 400, y: 300 } });
      await expect(page.locator('.annot-ring')).toHaveCount(1);
      await expect(page.locator('[data-handle]')).toHaveCount(0);
    });

    test('finishes a pull that makes the box too small for the edge handles', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await tool(page, 'Rechteck').click();
      await drag(page, [100, 100], [220, 160]);
      const before = await rect(page);
      // The edge handle disappears on the way, while the mouse button is still down.
      await pull(page, 'e', -600, 0);
      const [, , w] = await rect(page);
      expect(w).toBeCloseTo(8, 0);
      await page.keyboard.press('Control+z');
      expect(await rect(page)).toEqual(before); // one step back, so the pull was recorded
    });

    test('pulls a freehand drawing bigger, and the text box wider', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await tool(page, 'Zeichnen').click();
      await drag(page, [100, 200], [200, 260]);
      const width = async () => {
        const points = ((await page.locator('.annot-layer svg polyline.annot-shape:not(.annot-handle)').last().getAttribute('points')) ?? '').split(' ').map((p) => Number(p.split(',')[0]));
        return Math.max(...points) - Math.min(...points);
      };
      const w = await width();
      await pull(page, 'e', 100, 0);
      expect(await width()).toBeGreaterThan(w * 1.5);
      await page.keyboard.press('Escape');
      await tool(page, 'Text einfügen').click();
      await sheet(page).click({ position: { x: 100, y: 400 } });
      const text = page.locator('.annot-text').last();
      const wide = (await text.boundingBox())!.width;
      await pull(page, 'e', 120, 0);
      expect((await text.boundingBox())!.width).toBeGreaterThan(wide + 100);
      expect(await text.evaluate((e) => getComputedStyle(e).fontSize)).toBe('12px'); // the writing stays the same size
    });

    test('pulls the right side of a rectangle on a page that is turned', async ({ app: page }) => {
      await page.getByTestId('file-input').setInputFiles(pdfFile('doc.pdf', await makePdf([{ width: 595 }])));
      await expect(page.locator('.card img')).toHaveCount(1);
      await page.getByRole('button', { name: 'Im Uhrzeigersinn drehen' }).first().click();
      await page.getByRole('button', { name: 'Lesen', exact: true }).click();
      await expect(page.locator('.read-page img')).toBeVisible();
      await tool(page, 'Rechteck').click();
      await drag(page, [200, 200], [300, 260]);
      const [, , w, h] = await rect(page);
      // The page's own east edge is at the bottom of the screen; it shows the handle for up and down.
      await expect(page.locator('[data-handle="e"]')).toHaveCSS('cursor', 'ns-resize');
      await pull(page, 'e', 0, 80);
      const [, , w2, h2] = await rect(page);
      expect(w2).toBeGreaterThan(w + 20);
      expect(h2).toBeCloseTo(h, 1);
    });

    test('keeps the selection when a handle is only pressed', async ({ app: page }) => {
      await openOne(page, await makePdf([{ width: 595 }]));
      await tool(page, 'Rechteck').click();
      await drag(page, [100, 100], [220, 160]);
      const [x, y] = await handle(page, 'ne');
      await page.mouse.click(x, y);
      await expect(page.locator('.annot-ring')).toHaveCount(1);
    });
  });
});
