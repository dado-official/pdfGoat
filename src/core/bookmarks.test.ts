import { describe, expect, it } from 'vitest';
import { mergeBookmarks, remapBookmarks, addBookmark, fromPlaced, flatten, indentBookmark, moveBookmark, outdentBookmark, removeBookmark, renameBookmark, resolveBookmarks, retarget, toPlaced, type Bookmark } from './bookmarks';
import type { PageRef } from './types';

const pages: PageRef[] = ['a', 'b', 'c'].map((id, i) => ({ id, docId: 'd', srcIndex: i, rotation: 0 }));
const b = (id: string, pageId: string | null, children: Bookmark[] = []): Bookmark => ({ id, title: id.toUpperCase(), pageId, children });
const tree = [b('x', 'a', [b('x1', 'b')]), b('y', 'c')];
const names = (items: Bookmark[]) => flatten(items).map(({ bookmark, depth }) => `${'-'.repeat(depth)}${bookmark.id}`);

describe('bookmark trees', () => {
  it('start from the placed bookmarks and follow pages by id', () => {
    let n = 0;
    const made = fromPlaced([{ title: 'Eins', target: 2, children: [{ title: 'Zwei', target: null, children: [] }] }], pages, () => `id${n++}`);
    expect(made).toEqual([{ id: 'id0', title: 'Eins', pageId: 'c', children: [{ id: 'id1', title: 'Zwei', pageId: null, children: [] }] }]);
  });

  it('resolve to page numbers of the saved list, and lose the target of pages that are not in it', () => {
    expect(resolveBookmarks(tree, [pages[2], pages[0]])).toEqual([
      { title: 'X', page: 1, children: [{ title: 'X1', page: null, children: [] }] },
      { title: 'Y', page: 0, children: [] },
    ]);
    expect(toPlaced(tree, pages)[0].children[0].target).toBe(1);
  });

  it('rename, retarget and remove at any depth without changing the original', () => {
    expect(flatten(renameBookmark(tree, 'x1', 'Neu')).map((f) => f.bookmark.title)).toEqual(['X', 'Neu', 'Y']);
    expect(flatten(retarget(tree, 'y', null)).at(-1)?.bookmark.pageId).toBeNull();
    expect(names(removeBookmark(tree, 'x'))).toEqual(['y']);
    expect(names(tree)).toEqual(['x', '-x1', 'y']);
  });

  it('move among neighbours and stop at the ends', () => {
    expect(names(moveBookmark(tree, 'y', -1))).toEqual(['y', 'x', '-x1']);
    expect(names(moveBookmark(tree, 'x', -1))).toEqual(['x', '-x1', 'y']);
    expect(names(moveBookmark(tree, 'y', 1))).toEqual(['x', '-x1', 'y']);
  });

  it('indent under the one above and outdent after the parent', () => {
    expect(names(indentBookmark(tree, 'y'))).toEqual(['x', '-x1', '-y']);
    expect(names(indentBookmark(tree, 'x'))).toEqual(['x', '-x1', 'y']);
    expect(names(outdentBookmark(tree, 'x1'))).toEqual(['x', 'x1', 'y']);
    expect(names(outdentBookmark(tree, 'y'))).toEqual(['x', '-x1', 'y']);
  });

  it('add a bookmark at the end', () => {
    expect(names(addBookmark(tree, b('z', 'a')))).toEqual(['x', '-x1', 'y', 'z']);
  });
});

describe('putting bookmarks of several documents together', () => {
  let n = 0;
  const id = () => `n${n++}`;
  it('points them at the copies of the pages', () => {
    const mapped = remapBookmarks(tree, new Map([['a', 'A'], ['b', 'B']]), id);
    expect(flatten(mapped).map((f) => f.bookmark.pageId)).toEqual(['A', 'B', null]);
    expect(flatten(mapped).map((f) => f.bookmark.id)).not.toContain('x');
  });

  it('gives each document an entry with its name, and leaves a single document as it is', () => {
    const merged = mergeBookmarks([{ title: 'Eins', items: [b('p', 'a')], firstPageId: 'a' }, { title: 'Leer', items: [], firstPageId: 'b' }, { title: 'Zwei', items: [b('q', 'c')], firstPageId: 'c' }], id);
    expect(merged.map((m) => [m.title, m.pageId, m.children.length])).toEqual([['Eins', 'a', 1], ['Zwei', 'c', 1]]);
    const one = [b('p', 'a')];
    expect(mergeBookmarks([{ title: 'Eins', items: one, firstPageId: 'a' }], id)).toBe(one);
  });
});
