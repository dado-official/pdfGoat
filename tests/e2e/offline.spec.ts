import { expect, test } from '@playwright/test';
import { makePdf } from '../fixtures';

// Here the service worker is on: this is the test of the app working without a network.
test.use({ serviceWorkers: 'allow' });

test('can be installed: the manifest names the app, the icons and the PDF file type', async ({ page, request, baseURL }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href!, baseURL!).href)).json();
  expect(manifest).toMatchObject({ name: 'PDFgoat', display: 'standalone', start_url: './' });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`).sort()).toEqual(['192x192:any', '192x192:maskable', '512x512:any', '512x512:maskable']);
  expect(manifest.file_handlers[0].accept['application/pdf']).toEqual(['.pdf']);
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, new URL(href!, baseURL!)).href)).ok()).toBe(true);
});

test('keeps working without a network once a file has been opened', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  // Wait until the app's files are in the cache.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(async () => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0)), { timeout: 60_000 })
    .toBeGreaterThan(20);
  // The PDF engine is cached when the first file is opened.
  const file = { name: 'offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makePdf([{ width: 300 }, { width: 301 }])) };
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.locator('.card img')).toHaveCount(2);
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).includes('pdfgoat-engine') && (await (await caches.open('pdfgoat-engine')).keys()).length), { timeout: 30_000 }).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PDFgoat' })).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.locator('.card img')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF speichern' }).click();
  expect((await download).suggestedFilename()).toBe('offline.pdf');
});
