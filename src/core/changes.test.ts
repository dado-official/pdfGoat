import { describe, expect, it } from 'vitest';
import { applyChange, replay, type Change } from './changes';
import type { PageRef } from './types';

const page = (id: string, rotation = 0): PageRef => ({ id, docId: 'd1', srcIndex: 0, rotation });
const ids = (pages: PageRef[]) => pages.map((p) => p.id);

describe('applyChange', () => {
  const pages = [page('a'), page('b'), page('c')];

  it('returns the same list when a change has no effect', () => {
    const noops: Change[] = [
      { type: 'add', pages: [] },
      { type: 'rotate', ids: [], delta: 90 },
      { type: 'remove', ids: ['x'] },
      { type: 'move', id: 'a', step: -1 },
      { type: 'moveTo', ids: ['a'], targetId: 'a', side: 'before' },
      { type: 'moveTo', ids: ['a'], targetId: 'b', side: 'before' },
    ];
    for (const change of noops) expect(applyChange(pages, change)).toBe(pages);
    const single = [page('a')];
    expect(applyChange(single, { type: 'reverse' })).toBe(single);
  });

  it('does not change the list it is given', () => {
    const before = [...pages];
    applyChange(pages, { type: 'reverse' });
    applyChange(pages, { type: 'rotate', ids: ['a'], delta: 90 });
    expect(pages).toEqual(before);
  });
});

describe('replay', () => {
  it('builds the page list from the changes alone', () => {
    const changes: Change[] = [
      { type: 'add', pages: [page('a'), page('b'), page('c')] },
      { type: 'remove', ids: ['b'] },
      { type: 'rotate', ids: ['a'], delta: 90 },
      { type: 'reverse' },
    ];
    const pages = replay(changes);
    expect(ids(pages)).toEqual(['c', 'a']);
    expect(pages[1].rotation).toBe(90);
  });

  it('gives an empty document for no changes', () => {
    expect(replay([])).toEqual([]);
  });
});
