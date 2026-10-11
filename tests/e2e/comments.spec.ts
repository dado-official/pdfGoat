import { expect, type Page } from '@playwright/test';
import { annotationsOf, makeCommentedPdf, makePdf } from '../fixtures';
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
});
