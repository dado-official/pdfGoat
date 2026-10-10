// Pure state logic for the page list: no DOM, no PDF. Everything here is unit-tested.
import type { PageRef } from '../core/types';

export interface EditorState {
  /** The working list, in output order. */
  pages: PageRef[];
  selected: ReadonlySet<string>;
  /** Earlier page lists for undo, oldest first. */
  history: PageRef[][];
  /** Page lists that were undone, for redo; the next one to restore is last. */
  future: PageRef[][];
  /** Anchor for shift-click range selection. */
  anchor: string | null;
}

export type EditorAction =
  | { type: 'add'; pages: PageRef[] }
  | { type: 'rotate'; ids: string[]; delta: number }
  | { type: 'remove'; ids: string[] }
  | { type: 'move'; id: string; step: number }
  | { type: 'moveTo'; ids: string[]; targetId: string; side: 'before' | 'after' }
  | { type: 'reverse' }
  | { type: 'toggleSelect'; id: string; range?: boolean }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

export const HISTORY_LIMIT = 50;

export const initialState: EditorState = { pages: [], selected: new Set(), history: [], future: [], anchor: null };

/** Replaces the page list, records an undo step, clears redo and drops selections of pages that are gone. */
function commit(state: EditorState, pages: PageRef[]): EditorState {
  if (pages === state.pages) return state;
  return {
    ...state,
    pages,
    history: [...state.history, state.pages].slice(-HISTORY_LIMIT),
    future: [],
    selected: keepExisting(state.selected, pages),
  };
}

function keepExisting(selected: ReadonlySet<string>, pages: PageRef[]): ReadonlySet<string> {
  const ids = new Set(pages.map((p) => p.id));
  const next = new Set([...selected].filter((id) => ids.has(id)));
  return next.size === selected.size ? selected : next;
}

export const normalizeRotation = (deg: number) => ((deg % 360) + 360) % 360;

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { pages } = state;
  switch (action.type) {
    case 'add':
      return action.pages.length ? commit(state, [...pages, ...action.pages]) : state;

    case 'rotate': {
      if (!action.ids.length) return state;
      const ids = new Set(action.ids);
      return commit(
        state,
        pages.map((p) => (ids.has(p.id) ? { ...p, rotation: normalizeRotation(p.rotation + action.delta) } : p)),
      );
    }

    case 'remove': {
      const ids = new Set(action.ids);
      const next = pages.filter((p) => !ids.has(p.id));
      return next.length === pages.length ? state : commit(state, next);
    }

    case 'move': {
      const i = pages.findIndex((p) => p.id === action.id);
      const j = i + action.step;
      if (i < 0 || j < 0 || j >= pages.length) return state;
      const next = [...pages];
      [next[i], next[j]] = [next[j], next[i]];
      return commit(state, next);
    }

    case 'moveTo': {
      const ids = new Set(action.ids);
      if (ids.has(action.targetId)) return state;
      const moving = pages.filter((p) => ids.has(p.id));
      const rest = pages.filter((p) => !ids.has(p.id));
      let at = rest.findIndex((p) => p.id === action.targetId);
      if (at < 0 || !moving.length) return state;
      if (action.side === 'after') at += 1;
      rest.splice(at, 0, ...moving);
      const unchanged = rest.every((p, k) => p === pages[k]);
      return unchanged ? state : commit(state, rest);
    }

    case 'reverse':
      return pages.length < 2 ? state : commit(state, [...pages].reverse());

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
      const prev = state.history.at(-1);
      if (!prev) return state;
      return {
        ...state,
        pages: prev,
        history: state.history.slice(0, -1),
        future: [...state.future, state.pages],
        selected: keepExisting(state.selected, prev),
      };
    }

    case 'redo': {
      const next = state.future.at(-1);
      if (!next) return state;
      return {
        ...state,
        pages: next,
        history: [...state.history, state.pages].slice(-HISTORY_LIMIT),
        future: state.future.slice(0, -1),
        selected: keepExisting(state.selected, next),
      };
    }

    case 'reset':
      return initialState;
  }
}

/** Selected ids in page order (Set order is click order). */
export const selectedInOrder = (state: EditorState) =>
  state.pages.filter((p) => state.selected.has(p.id)).map((p) => p.id);
