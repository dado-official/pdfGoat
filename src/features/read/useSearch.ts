import { useEffect, useState } from 'react';
import type { PageRef } from '../../core/types';
import { searchPage, type Box, type SourceDoc } from '../../pdf/view';

export interface Match {
  /** Index in the page list. */
  page: number;
  boxes: Box[];
}

export interface SearchState {
  /** The text these results belong to. */
  needle: string;
  status: 'idle' | 'searching' | 'done';
  matches: Match[];
  /** Pages searched so far, 0 to 1. */
  progress: number;
}

const idle: SearchState = { needle: '', status: 'idle', matches: [], progress: 0 };
export const MAX_MATCHES = 2000;

/** Searches the pages one after the other in the engine and reports matches as they come in. */
export function useSearch(pages: PageRef[], docs: Record<string, SourceDoc>, query: string): SearchState {
  const [state, setState] = useState<SearchState>(idle);
  const needle = query.trim();

  useEffect(() => {
    if (!needle) return;
    let cancelled = false;
    // A short wait while typing, so a long document is not searched for every letter.
    const timer = setTimeout(async () => {
      const matches: Match[] = [];
      setState({ needle, status: 'searching', matches, progress: 0 });
      for (let i = 0; i < pages.length && matches.length < MAX_MATCHES; i++) {
        const doc = docs[pages[i].docId];
        try {
          const found = doc ? await searchPage(doc, pages[i].srcIndex, needle) : [];
          if (cancelled) return;
          for (const boxes of found) matches.push({ page: i, boxes });
        } catch {
          // A page that cannot be read has no matches.
        }
        if (cancelled) return;
        if (i % 5 === 4 || i === pages.length - 1) {
          setState({ needle, status: 'searching', matches: [...matches], progress: (i + 1) / pages.length });
        }
      }
      if (!cancelled) setState({ needle, status: 'done', matches: [...matches], progress: 1 });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle, pages, docs]);

  // Results of an earlier text are not shown while the new search is still waiting to start.
  return needle && state.needle === needle ? state : idle;
}
