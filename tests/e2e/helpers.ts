import { expect, test as base, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { describePdf, makePdf } from '../fixtures';

export const pdfFile = (name: string, bytes: Uint8Array) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });

/** Joins all open documents into a new tab, in the order they were opened. */
export async function mergeOpenTabs(page: Page, count: number) {
  await expect(page.getByRole('tab')).toHaveCount(count);
  await page.getByTestId('merge').click();
  await page.getByTestId('merge-submit').click();
  await expect(page.getByRole('tab')).toHaveCount(count + 1);
}

// a.pdf: pages 501, 502, 503 wide. b.pdf: 601, 602 (landscape). The width identifies each page in the output.
// The two files open in two tabs and are merged into a third, which is what most tests work on.
export async function openFixtures(page: Page) {
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

export const cards = (page: Page) => page.locator('.card');
export const card = (page: Page, n: number) => cards(page).nth(n);

export async function downloadBytes(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}

export async function widthsAndRotations(bytes: Uint8Array) {
  return (await describePdf(bytes)).map((p) => `${p.width}@${p.rotation}`);
}

/**
 * Every test opens the app and, when it ends, checks the privacy guarantee:
 * the page only ever reads (GET) from its own origin, and nothing is logged as an error.
 * Anything else is blocked on the spot and fails the test, so no file content can leave the browser.
 */
export const test = base.extend<{ app: Page }>({
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
