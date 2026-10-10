import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { chunk, outputBase, parseRanges, partName } from './ranges';

/** Runs `fn` and returns the AppError it throws. */
function thrown(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected an AppError');
}

describe('parseRanges', () => {
  it('parses single pages, ranges and open ends', () => {
    expect(parseRanges('1-3, 5, 7-', 8)).toEqual([[0, 1, 2], [4], [6, 7]]);
    expect(parseRanges('-2', 5)).toEqual([[0, 1]]);
  });

  it('accepts spaces, semicolons and en dashes', () => {
    expect(parseRanges(' 1 – 2 ; 3 ', 3)).toEqual([[0, 1], [2]]);
  });

  it('rejects invalid input with an error code and the offending part', () => {
    expect(thrown(() => parseRanges('', 3)).code).toBe('rangeEmpty');
    expect(thrown(() => parseRanges('a-b', 3))).toMatchObject({ code: 'rangeInvalid', params: { part: 'a-b' } });
    expect(thrown(() => parseRanges('0-2', 3))).toMatchObject({
      code: 'rangeOutOfBounds',
      params: { part: '0-2', count: 3 },
    });
    expect(thrown(() => parseRanges('2-4', 3)).code).toBe('rangeOutOfBounds');
    expect(thrown(() => parseRanges('3-1', 3)).code).toBe('rangeOutOfBounds');
  });
});

describe('chunk', () => {
  it('splits into groups, last one smaller', () => {
    expect(chunk(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
    expect(chunk(3, 1)).toEqual([[0], [1], [2]]);
  });

  it('treats invalid sizes as 1', () => {
    expect(chunk(2, 0)).toEqual([[0], [1]]);
    expect(chunk(2, Number.NaN)).toEqual([[0], [1]]);
  });
});

describe('file names', () => {
  it('uses the source name for one file and the given name for several', () => {
    expect(outputBase(['Vertrag.PDF', 'Vertrag.PDF'], 'merged')).toBe('Vertrag');
    expect(outputBase(['a.pdf', 'b.pdf'], 'merged')).toBe('merged');
  });

  it('numbers parts and names their page range', () => {
    expect(partName('doc', 0, [0, 1, 2], 'S')).toBe('doc-01_S1-3.pdf');
    expect(partName('doc', 9, [4], 'p')).toBe('doc-10_p5.pdf');
  });
});
