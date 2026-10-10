// Bookmarks of the files, placed on the working page list. A bookmark points at a page of its
// file; what the user sees is the page list, so each bookmark is mapped to the position where
// that page is now, or to nothing when the page was deleted.

export interface OutlineSource {
  title: string;
  /** Page index in the file, or null. */
  page: number | null;
  children: OutlineSource[];
}

export interface PlacedOutline {
  title: string;
  /** Position in the page list, or null when the page is gone. */
  target: number | null;
  children: PlacedOutline[];
}

export interface FileOutline {
  docId: string;
  name: string;
  nodes: OutlineSource[];
}

/** `positions` maps "docId:pageIndex" to the first position of that page in the list. */
export function placeOutline(files: FileOutline[], positions: ReadonlyMap<string, number>): PlacedOutline[] {
  const place = (docId: string, nodes: OutlineSource[]): PlacedOutline[] =>
    nodes.map((n) => ({
      title: n.title,
      target: n.page === null ? null : (positions.get(`${docId}:${n.page}`) ?? null),
      children: place(docId, n.children),
    }));

  const placed = files.map((f) => ({ file: f, nodes: place(f.docId, f.nodes) }));
  // With one file the bookmarks stand on their own; with several, each file gets a heading.
  if (placed.length === 1) return placed[0].nodes;
  return placed
    .filter(({ nodes }) => nodes.length > 0)
    .map(({ file, nodes }) => ({ title: file.name, target: firstTarget(nodes), children: nodes }));
}

function firstTarget(nodes: PlacedOutline[]): number | null {
  const targets = nodes.flatMap(function collect(n): number[] {
    return [...(n.target === null ? [] : [n.target]), ...n.children.flatMap(collect)];
  });
  return targets.length ? Math.min(...targets) : null;
}

export const countOutline = (nodes: PlacedOutline[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countOutline(n.children), 0);

/** Only these kinds of addresses are opened from a link in a PDF; anything else (javascript:, file:) is ignored. */
export function safeExternalUrl(uri: string): string | null {
  try {
    const url = new URL(uri);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
