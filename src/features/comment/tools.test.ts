import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/de';
import { en } from '../../i18n/en';
import { EDIT_TOOLS, FILL_TOOLS, INSERT_TOOLS, PROTECT_TOOLS, TOOLS } from './tools';

describe('tool labels', () => {
  const all = [...TOOLS, ...FILL_TOOLS, ...INSERT_TOOLS, ...EDIT_TOOLS, ...PROTECT_TOOLS];
  it.each([['de', de], ['en', en]] as const)('every tool has a label in %s', (_lang, texts) => {
    for (const tool of all) expect(Object.keys(texts), tool).toContain(`comment.tool.${tool}`);
  });
});
