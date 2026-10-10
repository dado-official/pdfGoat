import { describe, expect, it } from 'vitest';
import { countOutline, placeOutline, safeExternalUrl, type FileOutline, type OutlineSource } from './outline';

const node = (title: string, page: number | null, ...children: OutlineSource[]): OutlineSource => ({ title, page, children });

describe('placeOutline', () => {
  const file: FileOutline = {
    docId: 'a',
    name: 'a.pdf',
    nodes: [node('Eins', 0), node('Drei', 2, node('Zwei innen', 1)), node('Nirgends', null)],
  };

  it('maps bookmarks to positions in the page list', () => {
    // The file's pages 0, 1, 2 now stand at 2, 0, 1.
    const positions = new Map([['a:0', 2], ['a:1', 0], ['a:2', 1]]);
    const out = placeOutline([file], positions);
    expect(out.map((n) => [n.title, n.target])).toEqual([['Eins', 2], ['Drei', 1], ['Nirgends', null]]);
    expect(out[1].children[0]).toMatchObject({ title: 'Zwei innen', target: 0 });
  });

  it('leaves the target empty for a deleted page but keeps the bookmark', () => {
    const out = placeOutline([file], new Map([['a:0', 0]]));
    expect(out[0].target).toBe(0);
    expect(out[1].target).toBeNull();
    expect(out[1].children[0].target).toBeNull();
  });

  it('gives each file a heading when several files are open', () => {
    const b: FileOutline = { docId: 'b', name: 'b.pdf', nodes: [node('Kapitel', 0)] };
    const empty: FileOutline = { docId: 'c', name: 'c.pdf', nodes: [] };
    const positions = new Map([['a:0', 3], ['a:2', 4], ['b:0', 1]]);
    const out = placeOutline([file, b, empty], positions);
    expect(out.map((n) => n.title)).toEqual(['a.pdf', 'b.pdf']);
    expect(out[0].target).toBe(3);
    expect(out[0].children).toHaveLength(3);
    expect(out[1].target).toBe(1);
  });

  it('counts all bookmarks', () => {
    expect(countOutline(placeOutline([file], new Map()))).toBe(4);
  });
});

describe('safeExternalUrl', () => {
  it('allows web, mail and phone addresses', () => {
    expect(safeExternalUrl('https://example.org/a?b=1')).toBe('https://example.org/a?b=1');
    expect(safeExternalUrl('mailto:a@example.org')).toBe('mailto:a@example.org');
    expect(safeExternalUrl('tel:+43123')).toBe('tel:+43123');
  });

  it('refuses everything else', () => {
    for (const uri of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', '#page=3', 'nonsense', '']) {
      expect(safeExternalUrl(uri)).toBeNull();
    }
  });
});
