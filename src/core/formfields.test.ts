import { describe, expect, it } from 'vitest';
import { FF_COMBO, FF_MULTILINE, FF_RADIO, FF_READONLY, FF_REQUIRED, fieldFlags, freeName, newField, uniqueNames } from './formfields';

describe('form field helpers', () => {
  it('finds a free name', () => {
    expect(freeName('Textfeld', new Set(['Textfeld 1', 'Textfeld 3']))).toBe('Textfeld 2');
    expect(freeName('Textfeld', new Set())).toBe('Textfeld 1');
  });

  it('makes names unique but keeps the name of a radio group', () => {
    const names = uniqueNames([
      { name: 'a', radio: false },
      { name: 'a', radio: false },
      { name: 'g', radio: true },
      { name: 'g', radio: true },
      { name: ' ', radio: false },
    ]);
    expect(names).toEqual(['a', 'a-2', 'g', 'g', 'Feld']);
  });

  it('avoids names that the page already has', () => {
    expect(uniqueNames([{ name: 'x', radio: false }], new Set(['x']))).toEqual(['x-2']);
  });

  it('sets the flags the standard asks for', () => {
    expect(fieldFlags(newField('text', 't'))).toBe(0);
    expect(fieldFlags({ ...newField('text', 't'), multiline: true, required: true, readOnly: true })).toBe(FF_MULTILINE | FF_REQUIRED | FF_READONLY);
    expect(fieldFlags(newField('radio', 'r')) & FF_RADIO).toBe(FF_RADIO);
    expect(fieldFlags(newField('choice', 'c')) & FF_COMBO).toBe(FF_COMBO);
    expect(fieldFlags({ ...newField('choice', 'c'), combo: false }) & FF_COMBO).toBe(0);
  });
});
