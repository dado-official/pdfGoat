import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENTS } from './licenses';
import { missingDetails, OPERATOR, REQUIRED } from './operator';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };

describe('licence list', () => {
  it('names every package that goes into the site', () => {
    const listed = new Set(COMPONENTS.map((c) => c.name));
    for (const name of Object.keys(pkg.dependencies)) expect(listed, `${name} is missing in src/legal/licenses.ts`).toContain(name);
  });

  it('has a licence, a link and a text in both languages for every entry', () => {
    for (const c of COMPONENTS) {
      expect(c.license, c.name).not.toBe('');
      expect(c.url, c.name).toMatch(/^https:\/\//);
      expect(c.what.de.length, c.name).toBeGreaterThan(5);
      expect(c.what.en.length, c.name).toBeGreaterThan(5);
    }
  });
});

describe('operator details', () => {
  it('lists what is missing, so that a forgotten detail shows on the pages', () => {
    expect(missingDetails({ ...OPERATOR, name: '', street: 'x', city: 'y', country: 'z', email: 'a@b.c', sourceUrl: 'https://x' })).toEqual(['name']);
    expect(missingDetails({ ...OPERATOR, name: ' ', street: 'x', city: 'y', country: 'z', email: 'a@b.c', sourceUrl: 'https://x' })).toEqual(['name']);
    expect(missingDetails({ ...OPERATOR, name: 'n', street: 'x', city: 'y', country: 'z', email: 'a@b.c', sourceUrl: 'https://x' })).toEqual([]);
    expect(REQUIRED).not.toContain('phone');
  });
});
