import { describe, expect, it } from 'vitest';
import { AppError, type ErrorCode } from '../core/errors';
import type { MessageKey } from './de';
import { detectLang, errorText, LANGS, messages, translate, translatePlural } from './translate';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('messages', () => {
  it('every language has the same keys and the same placeholders', () => {
    const keys = Object.keys(messages.de) as MessageKey[];
    for (const lang of LANGS) {
      expect(Object.keys(messages[lang]).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(messages[lang][key], `${lang}:${key}`).not.toBe('');
        expect(placeholders(messages[lang][key]), `${lang}:${key}`).toEqual(placeholders(messages.de[key]));
      }
    }
  });

  it('has a text for every error code', () => {
    const codes: Record<ErrorCode, true> = {
      encrypted: true,
      notPdf: true,
      tooLarge: true,
      fileUnreadable: true,
      pageMissing: true,
      renderFailed: true,
      rangeInvalid: true,
      rangeOutOfBounds: true,
      rangeEmpty: true,
      noPages: true,
      sourceMissing: true,
    };
    for (const code of Object.keys(codes)) expect(messages.de).toHaveProperty([`error.${code}`]);
  });

  it('keeps file name parts free of spaces and special characters', () => {
    for (const lang of LANGS) {
      for (const key of ['file.merged', 'file.selection', 'file.split', 'file.pageAbbr'] as const) {
        expect(messages[lang][key]).toMatch(/^[A-Za-z]+$/);
      }
    }
  });
});

describe('detectLang', () => {
  it('prefers the stored choice', () => {
    expect(detectLang('en', ['de-AT'])).toBe('en');
    expect(detectLang('de', ['en-US'])).toBe('de');
  });

  it('falls back to the first supported browser language', () => {
    expect(detectLang(null, ['de-AT', 'en'])).toBe('de');
    expect(detectLang(null, ['fr-FR', 'en-GB', 'de'])).toBe('en');
    expect(detectLang('klingon', ['DE'])).toBe('de');
  });

  it('uses English when nothing matches', () => {
    expect(detectLang(null, ['fr', 'it'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
});

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('de', 'preview.position', { number: 2, total: 5 })).toBe('Seite 2 von 5');
    expect(translate('en', 'preview.position', { number: 2, total: 5 })).toBe('Page 2 of 5');
  });

  it('leaves unknown placeholders visible instead of printing "undefined"', () => {
    expect(translate('en', 'preview.position', { number: 2 })).toBe('Page 2 of {total}');
  });

  it('chooses singular and plural', () => {
    expect(translatePlural('de', 'status.pages', 1)).toBe('1 Seite');
    expect(translatePlural('de', 'status.pages', 5)).toBe('5 Seiten');
    expect(translatePlural('en', 'status.pages', 0)).toBe('0 pages');
  });
});

describe('errorText', () => {
  it('translates app errors with their details', () => {
    const err = new AppError('rangeOutOfBounds', { part: '2-9', count: 5 });
    expect(errorText('de', err)).toBe('„2-9“ liegt außerhalb von 1–5.');
    expect(errorText('en', err)).toBe('“2-9” is outside 1–5.');
  });

  it('wraps unexpected errors', () => {
    expect(errorText('en', new Error('boom'))).toBe('That did not work: boom');
    expect(errorText('de', 'kaputt')).toBe('Das hat nicht geklappt: kaputt');
  });
});
