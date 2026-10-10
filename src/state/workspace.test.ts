import { describe, expect, it } from 'vitest';
import type { PageRef } from '../core/types';
import { activeTab, clonePages, docsInUse, emptyWorkspace, workspaceReducer, type WorkspaceAction } from './workspace';

const page = (id: string, docId = 'd1'): PageRef => ({ id, docId, srcIndex: 0, rotation: 0 });
const run = (...actions: WorkspaceAction[]) => actions.reduce(workspaceReducer, emptyWorkspace);
const open = (id: string, ...pages: PageRef[]): WorkspaceAction => ({ type: 'open', id, title: id, pages });

describe('open and activate', () => {
  it('adds a tab with the pages of the file and makes it the active one', () => {
    const ws = run(open('a', page('p1'), page('p2')), open('b', page('p3', 'd2')));
    expect(ws.tabs.map((t) => t.id)).toEqual(['a', 'b']);
    expect(ws.active).toBe('b');
    expect(activeTab(ws)!.editor.pages.map((p) => p.id)).toEqual(['p3']);
  });

  it('switches tabs and ignores unknown ids', () => {
    const ws = run(open('a', page('p1')), open('b', page('p2')), { type: 'activate', id: 'a' });
    expect(ws.active).toBe('a');
    expect(workspaceReducer(ws, { type: 'activate', id: 'x' })).toBe(ws);
  });
});

describe('close', () => {
  const three = () => run(open('a', page('1')), open('b', page('2')), open('c', page('3')));

  it('activates the tab to the right, or the left one for the last tab', () => {
    let ws = workspaceReducer({ ...three(), active: 'b' }, { type: 'close', id: 'b' });
    expect(ws.active).toBe('c');
    ws = workspaceReducer(ws, { type: 'close', id: 'c' });
    expect(ws.active).toBe('a');
    ws = workspaceReducer(ws, { type: 'close', id: 'a' });
    expect(ws).toEqual(emptyWorkspace);
  });

  it('keeps the active tab when another one is closed', () => {
    const ws = workspaceReducer({ ...three(), active: 'c' }, { type: 'close', id: 'a' });
    expect(ws.active).toBe('c');
  });
});

describe('editing', () => {
  it('changes only the active tab, each with its own history', () => {
    let ws = run(open('a', page('1'), page('2')), open('b', page('3'), page('4')));
    ws = workspaceReducer(ws, { type: 'editor', action: { type: 'remove', ids: ['3'] } });
    ws = workspaceReducer(ws, { type: 'activate', id: 'a' });
    expect(ws.tabs[0].editor.pages).toHaveLength(2);
    expect(ws.tabs[1].editor.pages).toHaveLength(1);
    ws = workspaceReducer(ws, { type: 'editor', action: { type: 'rotate', ids: ['1'], delta: 90 } });
    ws = workspaceReducer(ws, { type: 'editor', action: { type: 'undo' } });
    expect(ws.tabs[0].editor.pages[0].rotation).toBe(0);
    expect(ws.tabs[1].editor.pages).toHaveLength(1);
  });

  it('does not undo the opening of the file', () => {
    const ws = run(open('a', page('1')));
    expect(ws.tabs[0].editor.locked).toBe(1);
    expect(workspaceReducer(ws, { type: 'editor', action: { type: 'undo' } })).toBe(ws);
  });

  it('keeps the same state object when nothing changes', () => {
    const ws = run(open('a', page('1')));
    expect(workspaceReducer(ws, { type: 'editor', action: { type: 'undo' } })).toBe(ws);
    expect(workspaceReducer(ws, { type: 'view', view: 'pages' })).toBe(ws);
  });

  it('remembers the view and the reading place per tab', () => {
    let ws = run(open('a', page('1')), open('b', page('2')));
    ws = workspaceReducer(ws, { type: 'view', view: 'read' });
    ws = workspaceReducer(ws, { type: 'memory', id: 'a', memory: { index: 3, fraction: 0.5, zoom: { kind: 'width' } } });
    expect(ws.tabs[1].view).toBe('read');
    expect(ws.tabs[0].view).toBe('pages');
    expect(ws.tabs[0].memory?.index).toBe(3);
  });
});

describe('docsInUse', () => {
  it('counts files in the whole change list, so undo can still bring their pages back', () => {
    let ws = run(open('a', page('1', 'd1')), open('b', page('2', 'd2')));
    ws = workspaceReducer(ws, { type: 'editor', action: { type: 'remove', ids: ['2'] } });
    expect([...docsInUse(ws)].sort()).toEqual(['d1', 'd2']);
    ws = workspaceReducer(ws, { type: 'close', id: 'b' });
    expect([...docsInUse(ws)]).toEqual(['d1']);
  });

  it('keeps a file while a merged tab still uses it', () => {
    let ws = run(open('a', page('1', 'd1')));
    ws = workspaceReducer(ws, open('m', ...clonePages([page('1', 'd1')], () => 'x')));
    ws = workspaceReducer(ws, { type: 'close', id: 'a' });
    expect([...docsInUse(ws)]).toEqual(['d1']);
  });
});

describe('clonePages', () => {
  it('gives new ids and keeps everything else', () => {
    let n = 0;
    const copy = clonePages([{ id: 'p1', docId: 'd', srcIndex: 4, rotation: 90 }], () => `n${n++}`);
    expect(copy).toEqual([{ id: 'n0', docId: 'd', srcIndex: 4, rotation: 90 }]);
  });
});

describe('editor action aimed at a tab', () => {
  it('changes the tab it names, not the active one', async () => {
    const { workspaceReducer, emptyWorkspace } = await import('./workspace');
    const page = (id: string) => ({ id, docId: 'd', srcIndex: 0, rotation: 0 });
    let ws = workspaceReducer(emptyWorkspace, { type: 'open', id: 'a', title: 'A', pages: [page('a1')] });
    ws = workspaceReducer(ws, { type: 'open', id: 'b', title: 'B', pages: [page('b1')] });
    expect(ws.active).toBe('b');
    ws = workspaceReducer(ws, { type: 'editor', id: 'a', action: { type: 'outline', items: [] } });
    expect(ws.tabs.find((t) => t.id === 'a')!.editor.changes.at(-1)?.type).toBe('outline');
    expect(ws.tabs.find((t) => t.id === 'b')!.editor.changes.at(-1)?.type).not.toBe('outline');
  });
});
