import { describe, expect, it } from 'vitest';
import { applyChange } from './changes';
import { arrowHead, boundsOf, mergeLineBoxes, rgb, screenToPage, sortAnnots, type Annot } from './annotations';
import { boxOnScreen } from './textLayer';
import type { PageRef } from './types';

const SIZE = { width: 300, height: 500 };

describe('screenToPage', () => {
  it.each([0, 90, 180, 270])('undoes boxOnScreen at rotation %i', (rotation) => {
    const scale = 1.5;
    const box: [number, number, number, number] = [40, 60, 120, 90];
    const on = boxOnScreen(box, SIZE, rotation, scale);
    // Opposite corners of the box on screen map back to opposite corners of the box.
    const a = screenToPage(on.left, on.top, SIZE, rotation, scale);
    const b = screenToPage(on.left + on.width, on.top + on.height, SIZE, rotation, scale);
    const got = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    got.forEach((v, i) => expect(v).toBeCloseTo(box[i], 6));
  });
});

describe('mergeLineBoxes', () => {
  it('joins boxes on one line and keeps lines apart', () => {
    const merged = mergeLineBoxes([
      [10, 10, 30, 22],
      [32, 11, 60, 23],
      [10, 30, 50, 42],
    ]);
    expect(merged).toEqual([
      [10, 10, 60, 23],
      [10, 30, 50, 42],
    ]);
  });

  it('drops empty boxes', () => {
    expect(mergeLineBoxes([[10, 10, 10, 20], [10, 10, 30, 10.2]])).toEqual([]);
  });
});

it('computes bounds, colours and arrow heads', () => {
  expect(boundsOf([[1, 5], [4, 2]], 1)).toEqual([0, 1, 5, 6]);
  expect(rgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  const [l, r] = arrowHead([0, 0], [10, 0], 5);
  expect(l[0]).toBeLessThan(10);
  expect(l[1]).toBeCloseTo(-r[1], 6);
});

describe('annotate change', () => {
  const page = (id: string): PageRef => ({ id, docId: 'd', srcIndex: 0, rotation: 0 });
  const note: Annot = { id: 'n1', kind: 'note', color: '#f5c400', contents: 'hi', box: [1, 1, 21, 21], created: 1 };

  it('sets the comments of one page only', () => {
    const pages = [page('a'), page('b')];
    const next = applyChange(pages, { type: 'annotate', id: 'b', annots: [note], removed: [2] });
    expect(next[0]).toBe(pages[0]);
    expect(next[1]).toMatchObject({ annots: [note], removed: [2] });
  });

  it('ignores a change that sets what is already there and an unknown page', () => {
    const pages = [{ ...page('a'), annots: [note], removed: [1] }];
    expect(applyChange(pages, { type: 'annotate', id: 'a', annots: [note], removed: [1] })).toBe(pages);
    expect(applyChange(pages, { type: 'annotate', id: 'zz', annots: [], removed: [] })).toBe(pages);
  });
});

it('sorts comments top to bottom, then left to right', () => {
  const at = (id: string, x: number, y: number): Annot => ({ id, kind: 'note', color: '#000', contents: '', box: [x, y, x + 1, y + 1], created: 1 });
  expect(sortAnnots([at('c', 5, 9), at('b', 9, 1), at('a', 2, 1)]).map((a) => a.id)).toEqual(['a', 'b', 'c']);
});
