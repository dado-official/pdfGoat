// Writing the bookmarks of a file: the old ones are removed and the given ones written, nested as given.
import type { PDFDocument } from 'mupdf';
import type { ResolvedBookmark } from '../core/bookmarks';

export function writeOutline(doc: PDFDocument, items: readonly ResolvedBookmark[]) {
  const iterator = doc.outlineIterator();
  for (let guard = 0; iterator.item() && guard < 100_000; guard++) iterator.delete();
  const count = doc.countPages();
  const uri = (page: number) => doc.formatLinkURI({ type: 'Fit', chapter: 0, page, x: 0, y: 0, width: 0, height: 0, zoom: 0 } as never);
  const write = (list: readonly ResolvedBookmark[]) => {
    for (const b of list) {
      iterator.insert({ title: b.title || '–', uri: b.page === null || b.page >= count ? undefined : uri(b.page), open: true } as never);
      if (b.children.length) {
        // After an insert the cursor stands behind the new item: step back, go down into it, and come back out.
        iterator.prev();
        iterator.down();
        write(b.children);
        iterator.up();
        iterator.next();
      }
    }
  };
  write(items);
}
