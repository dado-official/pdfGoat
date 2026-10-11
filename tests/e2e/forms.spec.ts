import { expect, type Page } from '@playwright/test';
import { annotationsOf, formFieldsOf, formValues2, fieldCount, formValues, makeFormPdf, makePdf } from '../fixtures';
import { pdfFile, downloadBytes, test } from './helpers';

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
