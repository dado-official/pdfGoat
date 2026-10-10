import { useCallback, useEffect, useRef, useState } from 'react';
import { renderPage, type SourceDoc } from '../lib/pdf';
import type { PageRef } from '../lib/types';

export const thumbKey = (p: Pick<PageRef, 'docId' | 'srcIndex'>) => `${p.docId}:${p.srcIndex}`;

/**
 * Renders a small preview for every page once, in the background and one at a time.
 * Rotation is applied with CSS, so rotating never re-renders.
 */
export function useThumbnails(docs: Record<string, SourceDoc>, pages: PageRef[], width = 180) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  const docsRef = useRef(docs);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    const todo = pages.filter((p) => !requested.current.has(thumbKey(p)));
    if (!todo.length) return;
    todo.forEach((p) => requested.current.add(thumbKey(p)));
    (async () => {
      for (const p of todo) {
        const doc = docsRef.current[p.docId];
        if (!doc) continue;
        try {
          const url = await renderPage(doc, p.srcIndex, { width });
          if (!docsRef.current[p.docId]) {
            URL.revokeObjectURL(url); // file was closed meanwhile
            continue;
          }
          urls.current.add(url);
          setThumbs((t) => ({ ...t, [thumbKey(p)]: url }));
        } catch (err) {
          // Leave the spinner; the page can still be exported.
          console.warn('Vorschau fehlgeschlagen', err);
        }
      }
    })();
  }, [pages, width]);

  /** Frees all preview images, e.g. when every file is closed. */
  const clear = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    requested.current.clear();
    setThumbs({});
  }, []);

  useEffect(() => clear, [clear]);

  return { thumbs, clear };
}
