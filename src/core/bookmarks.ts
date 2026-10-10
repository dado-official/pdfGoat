// Bookmarks that the user edits. Each one points at a page of the working list by its id, so it
// follows the page when pages are moved, and has no target when the page is deleted.
import type { PlacedOutline } from './outline';
import type { PageRef } from './types';

export interface Bookmark {
  id: string;
  title: string;
  pageId: string | null;
  children: Bookmark[];
}

/** A bookmark as written into a file: the number of the page in that file (from 0), or null. */
export interface ResolvedBookmark {
  title: string;
  page: number | null;
  children: ResolvedBookmark[];
}

/** The editable tree for the bookmarks as they stand now (`placed` points at positions in `pages`). */
export function fromPlaced(placed: PlacedOutline[], pages: readonly PageRef[], newId: () => string): Bookmark[] {
  return placed.map((n) => ({
    id: newId(),
    title: n.title,
    pageId: n.target === null ? null : (pages[n.target]?.id ?? null),
    children: fromPlaced(n.children, pages, newId),
  }));
}

/** The bookmarks for a list of pages that is saved: pages of other lists leave a bookmark without a target. */
export function resolveBookmarks(items: readonly Bookmark[], pages: readonly PageRef[]): ResolvedBookmark[] {
  const index = new Map(pages.map((p, i) => [p.id, i]));
  return items.map((b) => ({
    title: b.title,
    page: b.pageId === null ? null : (index.get(b.pageId) ?? null),
    children: resolveBookmarks(b.children, pages),
  }));
}

/** The tree for the sidebar of the reading view. */
export function toPlaced(items: readonly Bookmark[], pages: readonly PageRef[]): PlacedOutline[] {
  const index = new Map(pages.map((p, i) => [p.id, i]));
  return items.map((b) => ({ title: b.title, target: b.pageId === null ? null : (index.get(b.pageId) ?? null), children: toPlaced(b.children, pages) }));
}

export const countBookmarks = (items: readonly Bookmark[]): number => items.reduce((n, b) => n + 1 + countBookmarks(b.children), 0);

// Changes of a tree. Each returns a new tree and leaves the old one as it was.

const mapTree = (items: readonly Bookmark[], f: (b: Bookmark) => Bookmark | null): Bookmark[] =>
  items.flatMap((b) => {
    const next = f(b);
    return next ? [{ ...next, children: mapTree(next.children, f) }] : [];
  });

export const renameBookmark = (items: readonly Bookmark[], id: string, title: string) => mapTree(items, (b) => (b.id === id ? { ...b, title } : b));
export const retarget = (items: readonly Bookmark[], id: string, pageId: string | null) => mapTree(items, (b) => (b.id === id ? { ...b, pageId } : b));
export const removeBookmark = (items: readonly Bookmark[], id: string) => mapTree(items, (b) => (b.id === id ? null : b));

/** Where a bookmark sits: the list that holds it and its position there. */
function locate(items: Bookmark[], id: string): { list: Bookmark[]; index: number; parent: Bookmark | null } | null {
  const search = (list: Bookmark[], parent: Bookmark | null): ReturnType<typeof locate> => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, index: i, parent };
      const inner = search(list[i].children, list[i]);
      if (inner) return inner;
    }
    return null;
  };
  return search(items, null);
}

const clone = (items: readonly Bookmark[]): Bookmark[] => items.map((b) => ({ ...b, children: clone(b.children) }));

/** Moves a bookmark up or down among its neighbours. */
export function moveBookmark(items: readonly Bookmark[], id: string, step: -1 | 1): Bookmark[] {
  const tree = clone(items);
  const at = locate(tree, id);
  if (!at) return tree;
  const to = at.index + step;
  if (to < 0 || to >= at.list.length) return tree;
  [at.list[at.index], at.list[to]] = [at.list[to], at.list[at.index]];
  return tree;
}

/** Makes a bookmark a child of the one above it. */
export function indentBookmark(items: readonly Bookmark[], id: string): Bookmark[] {
  const tree = clone(items);
  const at = locate(tree, id);
  if (!at || at.index === 0) return tree;
  const [moved] = at.list.splice(at.index, 1);
  at.list[at.index - 1].children.push(moved);
  return tree;
}

/** Makes a bookmark a sibling of its parent, right after it. */
export function outdentBookmark(items: readonly Bookmark[], id: string): Bookmark[] {
  const tree = clone(items);
  const at = locate(tree, id);
  if (!at || !at.parent) return tree;
  const [moved] = at.list.splice(at.index, 1);
  const up = locate(tree, at.parent.id)!;
  up.list.splice(up.index + 1, 0, moved);
  return tree;
}

/** Adds a bookmark at the end of the top level. */
export const addBookmark = (items: readonly Bookmark[], b: Bookmark): Bookmark[] => [...clone(items), b];

/** The bookmarks in reading order with their depth, for a flat list on screen. */
export function flatten(items: readonly Bookmark[], depth = 0): { bookmark: Bookmark; depth: number }[] {
  return items.flatMap((b) => [{ bookmark: b, depth }, ...flatten(b.children, depth + 1)]);
}
