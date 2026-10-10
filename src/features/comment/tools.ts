import { useEffect } from 'react';
import type { AnnotKind } from '../../core/annotations';

/** What the pointer does on a page: nothing special (select and read), or draw this kind. */
export type Tool = AnnotKind | 'date' | 'check' | 'signature' | 'initials' | 'embedText' | 'embedImage' | null;

/** A picture the user made (signature or initials), ready to be placed. */
export interface Picture {
  bytes: Uint8Array;
  /** Width divided by height. */
  ratio: number;
}

export const FILL_TOOLS = ['date', 'check', 'signature', 'initials'] as const;

/** Tools that write into the page itself or add a link. */
export const INSERT_TOOLS = ['embedText', 'embedImage', 'link'] as const;

export const TOOLS = ['highlight', 'underline', 'strikeout', 'note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp'] as const;

const DRAWN: ReadonlySet<string> = new Set(['note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp', 'date', 'check', 'signature', 'initials', 'embedText', 'embedImage', 'link']);
export const isDrawTool = (tool: Tool): tool is Exclude<Tool, null | 'highlight' | 'underline' | 'strikeout'> => tool !== null && DRAWN.has(tool);

/** Deselect when the pointer ends up on the page itself, not on a comment. */
export function useClearSelection(onSelect: (id: string | null) => void) {
  useEffect(() => {
    const clear = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-annot], .annot-shape, .comment-panel, .comment-bar, .panel-toggle')) onSelect(null);
    };
    document.addEventListener('pointerdown', clear);
    return () => document.removeEventListener('pointerdown', clear);
  }, [onSelect]);
}
