// The change list: everything the user did to the document, as commands with data.
// The page list is derived from it, undo removes the last entry, and later milestones add
// commands for comments, form values and redactions that the engine applies when saving.
import type { Annot } from './annotations';
import type { Bookmark } from './bookmarks';
import type { Edit } from './edits';
import type { Mark } from './marks';
import type { OcrWord } from './ocr';
import type { Box } from './textLayer';
import type { PageRef } from './types';

export type Change =
  /** Adds pages at the end, or before the page at position `at`. */
  | { type: 'add'; pages: PageRef[]; at?: number }
  | { type: 'rotate'; ids: string[]; delta: number }
  | { type: 'remove'; ids: string[] }
  | { type: 'move'; id: string; step: number }
  | { type: 'moveTo'; ids: string[]; targetId: string; side: 'before' | 'after' }
  | { type: 'reverse' }
  /** Replaces the comments of one page: new ones, and which of the file's own were deleted. */
  | { type: 'annotate'; id: string; annots: Annot[]; removed: number[] }
  /** Replaces the form values of one page. */
  | { type: 'fill'; id: string; fields: Record<number, string> }
  /** Gives pages a header, footer, page number or watermark; `markId` removes one again. */
  | { type: 'mark'; ids: string[]; mark: Mark }
  | { type: 'unmark'; ids: string[]; markId: string }
  /** Sets the visible area of pages (null: all of the page), by page id. */
  | { type: 'crop'; crops: Record<string, Box | null> }
  /** Sets a new size for pages, in points as shown, by page id (null: keep the size). */
  | { type: 'resize'; sizes: Record<string, [number, number] | null> }
  /** Replaces the bookmarks of the whole document. */
  | { type: 'outline'; items: Bookmark[] | null }
  /** Sets the words found by text recognition, by page id (null: remove them). */
  | { type: 'ocr'; words: Record<string, OcrWord[] | null> }
  /** Replaces the edits of the existing text and pictures of one page. */
  | { type: 'edit'; id: string; edits: Edit[] };

export const normalizeRotation = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Applies one change to a page list. Returns the same array when the change has no effect,
 * so callers can tell that nothing happened and leave it out of the list.
 */
export function applyChange(pages: PageRef[], change: Change): PageRef[] {
  switch (change.type) {
    case 'add':
      if (!change.pages.length) return pages;
      if (change.at === undefined) return [...pages, ...change.pages];
      return [...pages.slice(0, change.at), ...change.pages, ...pages.slice(change.at)];

    case 'rotate': {
      if (!change.ids.length) return pages;
      const ids = new Set(change.ids);
      return pages.map((p) => (ids.has(p.id) ? { ...p, rotation: normalizeRotation(p.rotation + change.delta) } : p));
    }

    case 'remove': {
      const ids = new Set(change.ids);
      const next = pages.filter((p) => !ids.has(p.id));
      return next.length === pages.length ? pages : next;
    }

    case 'move': {
      const i = pages.findIndex((p) => p.id === change.id);
      const j = i + change.step;
      if (i < 0 || j < 0 || j >= pages.length) return pages;
      const next = [...pages];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }

    case 'moveTo': {
      const ids = new Set(change.ids);
      if (ids.has(change.targetId)) return pages;
      const moving = pages.filter((p) => ids.has(p.id));
      const rest = pages.filter((p) => !ids.has(p.id));
      let at = rest.findIndex((p) => p.id === change.targetId);
      if (at < 0 || !moving.length) return pages;
      if (change.side === 'after') at += 1;
      rest.splice(at, 0, ...moving);
      return rest.every((p, k) => p === pages[k]) ? pages : rest;
    }

    case 'reverse':
      return pages.length < 2 ? pages : [...pages].reverse();

    case 'annotate': {
      const i = pages.findIndex((p) => p.id === change.id);
      if (i < 0) return pages;
      const old = pages[i];
      const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) => (a ?? []).length === b.length && b.every((x, k) => a![k] === x);
      if (same(old.annots, change.annots) && same(old.removed, change.removed)) return pages;
      const next = [...pages];
      next[i] = { ...old, annots: change.annots, removed: change.removed };
      return next;
    }

    case 'mark': {
      const ids = new Set(change.ids);
      if (!pages.some((p) => ids.has(p.id))) return pages;
      return pages.map((p) => (ids.has(p.id) ? { ...p, marks: [...(p.marks ?? []), change.mark] } : p));
    }

    case 'unmark': {
      const ids = new Set(change.ids);
      if (!pages.some((p) => ids.has(p.id) && p.marks?.some((m) => m.id === change.markId))) return pages;
      return pages.map((p) => {
        if (!ids.has(p.id) || !p.marks) return p;
        const marks = p.marks.filter((m) => m.id !== change.markId);
        return { ...p, marks: marks.length ? marks : undefined };
      });
    }

    case 'crop': {
      let changed = false;
      const next = pages.map((p) => {
        if (!(p.id in change.crops)) return p;
        const crop = change.crops[p.id] ?? undefined;
        if (JSON.stringify(crop) === JSON.stringify(p.crop)) return p;
        changed = true;
        return { ...p, crop };
      });
      return changed ? next : pages;
    }

    case 'resize': {
      let changed = false;
      const next = pages.map((p) => {
        if (!(p.id in change.sizes)) return p;
        const size = change.sizes[p.id] ?? undefined;
        if (JSON.stringify(p.size) === JSON.stringify(size)) return p;
        changed = true;
        return { ...p, size };
      });
      return changed ? next : pages;
    }

    case 'outline':
      // Bookmarks belong to the document, not to a page.
      return pages;

    case 'ocr': {
      let changed = false;
      const next = pages.map((p) => {
        if (!(p.id in change.words)) return p;
        const ocr = change.words[p.id] ?? undefined;
        if (ocr === p.ocr) return p;
        changed = true;
        return { ...p, ocr };
      });
      return changed ? next : pages;
    }

    case 'edit': {
      const i = pages.findIndex((p) => p.id === change.id);
      if (i < 0) return pages;
      const old = pages[i].edits ?? [];
      if (old.length === change.edits.length && change.edits.every((e, k) => e === old[k])) return pages;
      const next = [...pages];
      next[i] = { ...pages[i], edits: change.edits.length ? change.edits : undefined };
      return next;
    }

    case 'fill': {
      const i = pages.findIndex((p) => p.id === change.id);
      if (i < 0) return pages;
      const old = pages[i].fields ?? {};
      const keys = Object.keys(change.fields);
      if (keys.length === Object.keys(old).length && keys.every((k) => old[Number(k)] === change.fields[Number(k)])) return pages;
      const next = [...pages];
      next[i] = { ...pages[i], fields: keys.length ? change.fields : undefined };
      return next;
    }
  }
}

/** The page list after all changes, from an empty document. */
export const replay = (changes: readonly Change[]): PageRef[] => changes.reduce(applyChange, []);
