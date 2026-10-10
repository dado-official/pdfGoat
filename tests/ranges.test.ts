import { describe, expect, it } from 'vitest';
import { chunk, outputBase, parseRanges, partName } from '../src/lib/ranges';

describe('parseRanges', () => {
  it('parses single pages, ranges and open ends', () => {
    expect(parseRanges('1-3, 5, 7-', 8)).toEqual([[0, 1, 2], [4], [6, 7]]);
    expect(parseRanges('-2', 5)).toEqual([[0, 1]]);
  });

  it('accepts spaces, semicolons and en dashes', () => {
    expect(parseRanges(' 1 – 2 ; 3 ', 3)).toEqual([[0, 1], [2]]);
  });

  it('rejects invalid input with a readable message', () => {
    expect(() => parseRanges('', 3)).toThrow('mindestens einen Bereich');
    expect(() => parseRanges('a-b', 3)).toThrow('kein gültiger Bereich');
    expect(() => parseRanges('0-2', 3)).toThrow('außerhalb von 1–3');
    expect(() => parseRanges('2-4', 3)).toThrow('außerhalb');
    expect(() => parseRanges('3-1', 3)).toThrow('außerhalb');
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
  it('uses the source name for one file and a generic name for several', () => {
    expect(outputBase(['Vertrag.PDF', 'Vertrag.PDF'])).toBe('Vertrag');
    expect(outputBase(['a.pdf', 'b.pdf'])).toBe('zusammengefuegt');
  });

  it('numbers parts and names their page range', () => {
    expect(partName('doc', 0, [0, 1, 2])).toBe('doc-01_S1-3.pdf');
    expect(partName('doc', 9, [4])).toBe('doc-10_S5.pdf');
  });
});
