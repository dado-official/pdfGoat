// The open documents as tabs. Each tab has its own page list, undo history, selection and
// reading position. Opened files (sources) are shared: several tabs can show pages of one file,
// for example after documents were merged.
import type { Zoom } from '../core/readerLayout';
import type { PageRef } from '../core/types';
import { editorReducer, initialState, type EditorAction, type EditorState } from './editor';

export type View = 'pages' | 'read';

/** Where a tab was left in the reading view, so coming back finds the same place. */
export interface ReaderMemory {
  /** Page at the top of the screen and how far into it the screen starts. */
  index: number;
  fraction: number;
  zoom: Zoom;
}

export interface Tab {
  id: string;
  title: string;
  editor: EditorState;
  view: View;
  memory: ReaderMemory | null;
}

export interface Workspace {
  tabs: Tab[];
  active: string | null;
}

export const emptyWorkspace: Workspace = { tabs: [], active: null };

export type WorkspaceAction =
  | { type: 'open'; id: string; title: string; pages: PageRef[] }
  | { type: 'close'; id: string }
  | { type: 'activate'; id: string }
  /** Applies an editor action to the active tab. */
  /** Changes the editor of a tab: the one given, or the active one. */
  | { type: 'editor'; action: EditorAction; id?: string }
  | { type: 'view'; view: View }
  | { type: 'memory'; id: string; memory: ReaderMemory }
  | { type: 'rename'; id: string; title: string }
  | { type: 'reset' };

const update = (ws: Workspace, id: string | null, fn: (tab: Tab) => Tab): Workspace => {
  const old = ws.tabs.find((t) => t.id === id);
  if (!old) return ws;
  const next = fn(old);
  return next === old ? ws : { ...ws, tabs: ws.tabs.map((t) => (t === old ? next : t)) };
};

export function workspaceReducer(ws: Workspace, action: WorkspaceAction): Workspace {
  switch (action.type) {
    case 'open': {
      // Opening is the starting point, not something to undo.
      const added = editorReducer(initialState, { type: 'add', pages: action.pages });
      const editor = { ...added, locked: added.changes.length };
      const tab: Tab = { id: action.id, title: action.title, editor, view: 'pages', memory: null };
      return { tabs: [...ws.tabs, tab], active: tab.id };
    }

    case 'close': {
      const i = ws.tabs.findIndex((t) => t.id === action.id);
      if (i < 0) return ws;
      const tabs = ws.tabs.filter((t) => t.id !== action.id);
      // The tab to the right takes over, or the one to the left when the last one is closed.
      const active = ws.active === action.id ? (tabs[i] ?? tabs[i - 1] ?? null)?.id ?? null : ws.active;
      return { tabs, active };
    }

    case 'activate':
      return ws.tabs.some((t) => t.id === action.id) ? { ...ws, active: action.id } : ws;

    case 'editor':
      return update(ws, action.id ?? ws.active, (t) => {
        const editor = editorReducer(t.editor, action.action);
        return editor === t.editor ? t : { ...t, editor };
      });

    case 'view':
      return update(ws, ws.active, (t) => (t.view === action.view ? t : { ...t, view: action.view }));

    case 'memory':
      return update(ws, action.id, (t) => ({ ...t, memory: action.memory }));

    case 'rename':
      return update(ws, action.id, (t) => ({ ...t, title: action.title }));

    case 'reset':
      return emptyWorkspace;
  }
}

export const activeTab = (ws: Workspace): Tab | null => ws.tabs.find((t) => t.id === ws.active) ?? null;

/**
 * Files that some tab still needs. Counted over the whole change list, not only the current
 * pages, because undo can bring back pages of a file that was removed from the list.
 */
export function docsInUse(ws: Workspace): Set<string> {
  const used = new Set<string>();
  for (const tab of ws.tabs) {
    for (const change of [...tab.editor.changes, ...tab.editor.undone]) {
      if (change.type === 'add') for (const p of change.pages) used.add(p.docId);
    }
  }
  return used;
}

/** Copies of pages with new ids, so a tab can start from the pages of other tabs. */
export const clonePages = (pages: PageRef[], newId: () => string): PageRef[] => pages.map((p) => ({ ...p, id: newId() }));
