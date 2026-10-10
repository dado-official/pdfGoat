// Pure state logic for the editor: no DOM, no PDF. Everything here is unit-tested.
// The document is the change list; the page list is derived from it.
import { applyChange, normalizeRotation, replay, type Change } from '../core/changes';
import type { Bookmark } from '../core/bookmarks';
import type { PageRef } from '../core/types';

export { normalizeRotation };

export interface EditorState {
  /** Everything done to the document, oldest first. */
  changes: Change[];
  /** How many of the first changes cannot be undone: the pages the document was opened with. */
  locked: number;
  /** The page list after all changes, in output order. Derived from `changes`. */
  pages: PageRef[];
  selected: ReadonlySet<string>;
  /** Changes that were undone, for redo; the next one to restore is last. */
  undone: Change[];
  /** Anchor for shift-click range selection. */
  anchor: string | null;
}

export type EditorAction =
  | Change
  | { type: 'toggleSelect'; id: string; range?: boolean }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

export const initialState: EditorState = { changes: [], locked: 0, pages: [], selected: new Set(), undone: [], anchor: null };

function keepExisting(selected: ReadonlySet<string>, pages: PageRef[]): ReadonlySet<string> {
  const ids = new Set(pages.map((p) => p.id));
  const next = new Set([...selected].filter((id) => ids.has(id)));
  return next.size === selected.size ? selected : next;
}

/** Records a change, unless it has no effect. A new change ends the redo chain. */
function record(state: EditorState, change: Change): EditorState {
  const pages = applyChange(state.pages, change);
  // Bookmarks leave the pages as they are but are still a change.
  if (pages === state.pages && change.type !== 'outline') return state;
  return {
    ...state,
    changes: [...state.changes, change],
    pages,
    undone: [],
    selected: keepExisting(state.selected, pages),
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { pages } = state;
  switch (action.type) {
    case 'add':
    case 'rotate':
    case 'remove':
    case 'move':
    case 'moveTo':
    case 'reverse':
    case 'annotate':
    case 'fill':
    case 'mark':
    case 'unmark':
    case 'crop':
    case 'resize':
    case 'edit':
    case 'ocr':
    case 'outline':
    case 'dropFields':
      return record(state, action);

    case 'toggleSelect': {
      const next = new Set(state.selected);
      const a = state.anchor ? pages.findIndex((p) => p.id === state.anchor) : -1;
      const b = pages.findIndex((p) => p.id === action.id);
      if (b < 0) return state;
      if (action.range && a >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        for (let k = from; k <= to; k++) next.add(pages[k].id);
      } else if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return { ...state, selected: next, anchor: action.id };
    }

    case 'selectAll':
      return { ...state, selected: new Set(pages.map((p) => p.id)) };

    case 'clearSelection':
      return state.selected.size ? { ...state, selected: new Set(), anchor: null } : state;

    case 'undo': {
      const last = state.changes.at(-1);
      if (!last || state.changes.length <= state.locked) return state;
      const changes = state.changes.slice(0, -1);
      const prev = replay(changes);
      return {
        ...state,
        changes,
        pages: prev,
        undone: [...state.undone, last],
        selected: keepExisting(state.selected, prev),
      };
    }

    case 'redo': {
      const next = state.undone.at(-1);
      if (!next) return state;
      const redone = record({ ...state, undone: [] }, next);
      return { ...redone, undone: state.undone.slice(0, -1) };
    }

    case 'reset':
      return initialState;
  }
}

/** True when there is a change to undo. */
export const canUndo = (state: EditorState) => state.changes.length > state.locked;

/** Selected ids in page order (Set order is click order). */
export const selectedInOrder = (state: EditorState) =>
  state.pages.filter((p) => state.selected.has(p.id)).map((p) => p.id);

/** The bookmarks the user has set up, or null when the file's own are kept. */
export function bookmarksOf(state: EditorState): Bookmark[] | null {
  for (let i = state.changes.length - 1; i >= 0; i--) {
    const change = state.changes[i];
    if (change.type === 'outline') return change.items;
  }
  return null;
}
