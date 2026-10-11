import { expect, type Page } from '@playwright/test';
import { makeRichPdf } from '../fixtures';
import { pdfFile, mergeOpenTabs, openFixtures, cards, card, test } from './helpers';

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
