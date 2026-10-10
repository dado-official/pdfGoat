import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageRef } from '../../core/types';
import { renderPage, type SourceDoc } from '../../pdf/lazy';

type ThumbPage = Pick<PageRef, 'docId' | 'srcIndex'>;

export const thumbKey = (p: ThumbPage) => `${p.docId}:${p.srcIndex}`;

/**
 * Renders small previews on request, in the background and one at a time. The page grid asks
 * only for pages that are (nearly) on screen, so a PDF with hundreds of pages opens quickly.
 * Rotation is applied with CSS, so rotating never re-renders.
 */
export function useThumbnails(docs: Record<string, SourceDoc>, width = 180) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const requested = useRef(new Set<string>());
  const queue = useRef<ThumbPage[]>([]);
  const working = useRef(false);
  const urls = useRef(new Set<string>());
  const docsRef = useRef(docs);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  const work = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    for (let p = queue.current.shift(); p; p = queue.current.shift()) {
      const key = thumbKey(p);
      const doc = docsRef.current[p.docId];
      if (!doc) continue;
      try {
        const url = await renderPage(doc, p.srcIndex, { width });
        // The file was closed (and maybe this page asked for again) while rendering.
        if (docsRef.current[p.docId] !== doc || !requested.current.has(key)) {
          URL.revokeObjectURL(url);
          continue;
        }
        urls.current.add(url);
        setThumbs((t) => ({ ...t, [key]: url }));
      } catch (err) {
        // The card shows a placeholder instead; the page can still be exported.
        console.warn('Thumbnail failed', err);
        if (docsRef.current[p.docId] === doc) setFailed((f) => new Set(f).add(key));
      }
    }
    working.current = false;
  }, [width]);

  /** Asks for the preview of a page; repeated requests for the same page are ignored. */
  const request = useCallback(
    (page: ThumbPage) => {
      const key = thumbKey(page);
      if (requested.current.has(key)) return;
      requested.current.add(key);
      queue.current.push({ docId: page.docId, srcIndex: page.srcIndex });
      void work();
    },
    [work],
  );

  /** Frees all preview images, e.g. when every file is closed. */
  const clear = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    requested.current.clear();
    queue.current = [];
    setThumbs({});
    setFailed(new Set());
  }, []);

  useEffect(() => clear, [clear]);

  return { thumbs, failed, request, clear };
}
