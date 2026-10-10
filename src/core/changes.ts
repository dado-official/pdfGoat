// The change list: everything the user did to the document, as commands with data.
// The page list is derived from it, undo removes the last entry, and later milestones add
// commands for comments, form values and redactions that the engine applies when saving.
import type { PageRef } from './types';

export type Change =
  | { type: 'add'; pages: PageRef[] }
  | { type: 'rotate'; ids: string[]; delta: number }
  | { type: 'remove'; ids: string[] }
  | { type: 'move'; id: string; step: number }
  | { type: 'moveTo'; ids: string[]; targetId: string; side: 'before' | 'after' }
  | { type: 'reverse' };

export const normalizeRotation = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Applies one change to a page list. Returns the same array when the change has no effect,
 * so callers can tell that nothing happened and leave it out of the list.
 */
export function applyChange(pages: PageRef[], change: Change): PageRef[] {
  switch (change.type) {
    case 'add':
      return change.pages.length ? [...pages, ...change.pages] : pages;

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
  }
}

/** The page list after all changes, from an empty document. */
export const replay = (changes: readonly Change[]): PageRef[] => changes.reduce(applyChange, []);
