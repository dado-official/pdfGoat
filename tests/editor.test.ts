import { describe, expect, it } from 'vitest';
import {
  editorReducer,
  HISTORY_LIMIT,
  initialState,
  selectedInOrder,
  type EditorAction,
  type EditorState,
} from '../src/lib/editor';
import type { PageRef } from '../src/lib/types';

const page = (id: string, rotation = 0): PageRef => ({ id, docId: 'd1', srcIndex: 0, rotation });
const ids = (s: EditorState) => s.pages.map((p) => p.id);
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, initialState);
const withPages = (...names: string[]) => run({ type: 'add', pages: names.map((n) => page(n)) });

describe('add', () => {
  it('appends pages and records an undo step', () => {
    const s = run({ type: 'add', pages: [page('a')] }, { type: 'add', pages: [page('b'), page('c')] });
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    expect(s.history).toHaveLength(2);
  });

  it('ignores an empty add', () => {
    expect(run({ type: 'add', pages: [] })).toBe(initialState);
  });
});

describe('rotate', () => {
  it('rotates only the given pages and wraps around 360°', () => {
    let s = withPages('a', 'b');
    s = editorReducer(s, { type: 'rotate', ids: ['a'], delta: 90 });
    s = editorReducer(s, { type: 'rotate', ids: ['a'], delta: 270 });
    s = editorReducer(s, { type: 'rotate', ids: ['b'], delta: -90 });
    expect(s.pages.map((p) => p.rotation)).toEqual([0, 270]);
  });

  it('does nothing without ids', () => {
    const s = withPages('a');
    expect(editorReducer(s, { type: 'rotate', ids: [], delta: 90 })).toBe(s);
  });
});

describe('remove', () => {
  it('removes pages and drops them from the selection', () => {
    let s = withPages('a', 'b', 'c');
    s = editorReducer(s, { type: 'toggleSelect', id: 'b' });
    s = editorReducer(s, { type: 'toggleSelect', id: 'c' });
    s = editorReducer(s, { type: 'remove', ids: ['b'] });
    expect(ids(s)).toEqual(['a', 'c']);
    expect([...s.selected]).toEqual(['c']);
  });

  it('does not record history when nothing matched', () => {
    const s = withPages('a');
    expect(editorReducer(s, { type: 'remove', ids: ['x'] })).toBe(s);
  });
});

describe('move', () => {
  it('swaps with the neighbour', () => {
    expect(ids(editorReducer(withPages('a', 'b', 'c'), { type: 'move', id: 'a', step: 1 }))).toEqual(['b', 'a', 'c']);
    expect(ids(editorReducer(withPages('a', 'b', 'c'), { type: 'move', id: 'c', step: -1 }))).toEqual(['a', 'c', 'b']);
  });

  it('stops at the edges', () => {
    const s = withPages('a', 'b');
    expect(editorReducer(s, { type: 'move', id: 'a', step: -1 })).toBe(s);
    expect(editorReducer(s, { type: 'move', id: 'b', step: 1 })).toBe(s);
  });
});

describe('moveTo (drag & drop)', () => {
  const s = withPages('a', 'b', 'c', 'd', 'e');

  it('drops before or after the target', () => {
    expect(ids(editorReducer(s, { type: 'moveTo', ids: ['e'], targetId: 'b', side: 'before' }))).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(ids(editorReducer(s, { type: 'moveTo', ids: ['a'], targetId: 'c', side: 'after' }))).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('moves several pages together, keeping their order', () => {
    expect(ids(editorReducer(s, { type: 'moveTo', ids: ['d', 'a'], targetId: 'e', side: 'after' }))).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  it('ignores drops onto a moving page or into the same place', () => {
    expect(editorReducer(s, { type: 'moveTo', ids: ['b', 'c'], targetId: 'c', side: 'after' })).toBe(s);
    expect(editorReducer(s, { type: 'moveTo', ids: ['b'], targetId: 'c', side: 'before' })).toBe(s);
  });
});

describe('reverse', () => {
  it('reverses the order', () => {
    expect(ids(editorReducer(withPages('a', 'b', 'c'), { type: 'reverse' }))).toEqual(['c', 'b', 'a']);
  });
});

describe('selection', () => {
  it('toggles single pages', () => {
    let s = withPages('a', 'b');
    s = editorReducer(s, { type: 'toggleSelect', id: 'a' });
    expect([...s.selected]).toEqual(['a']);
    s = editorReducer(s, { type: 'toggleSelect', id: 'a' });
    expect(s.selected.size).toBe(0);
  });

  it('selects a range with shift, in both directions', () => {
    let s = withPages('a', 'b', 'c', 'd');
    s = editorReducer(s, { type: 'toggleSelect', id: 'd' });
    s = editorReducer(s, { type: 'toggleSelect', id: 'b', range: true });
    expect(selectedInOrder(s)).toEqual(['b', 'c', 'd']);
  });

  it('selects all and clears, without touching history', () => {
    let s = withPages('a', 'b');
    const history = s.history;
    s = editorReducer(s, { type: 'selectAll' });
    expect(s.selected.size).toBe(2);
    s = editorReducer(s, { type: 'clearSelection' });
    expect(s.selected.size).toBe(0);
    expect(s.history).toBe(history);
  });

  it('reports the selection in page order, not click order', () => {
    let s = withPages('a', 'b', 'c');
    s = editorReducer(s, { type: 'toggleSelect', id: 'c' });
    s = editorReducer(s, { type: 'toggleSelect', id: 'a' });
    expect(selectedInOrder(s)).toEqual(['a', 'c']);
  });
});

describe('undo', () => {
  it('restores earlier page lists step by step', () => {
    let s = withPages('a', 'b', 'c');
    s = editorReducer(s, { type: 'remove', ids: ['b'] });
    s = editorReducer(s, { type: 'rotate', ids: ['a'], delta: 90 });
    s = editorReducer(s, { type: 'undo' });
    expect(s.pages[0].rotation).toBe(0);
    expect(ids(s)).toEqual(['a', 'c']);
    s = editorReducer(s, { type: 'undo' });
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    s = editorReducer(s, { type: 'undo' });
    expect(ids(s)).toEqual([]);
    expect(editorReducer(s, { type: 'undo' })).toBe(s);
  });

  it('keeps at most the history limit', () => {
    let s = withPages('a');
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = editorReducer(s, { type: 'rotate', ids: ['a'], delta: 90 });
    expect(s.history).toHaveLength(HISTORY_LIMIT);
  });

  it('drops selections of pages that the undo removes', () => {
    let s = withPages('a');
    s = editorReducer(s, { type: 'add', pages: [page('b')] });
    s = editorReducer(s, { type: 'toggleSelect', id: 'b' });
    s = editorReducer(s, { type: 'undo' });
    expect(s.selected.size).toBe(0);
  });
});

it('reset returns to the empty state', () => {
  expect(editorReducer(withPages('a'), { type: 'reset' })).toBe(initialState);
});
