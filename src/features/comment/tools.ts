import { useEffect } from 'react';
import type { AnnotKind } from '../../core/annotations';

/** What the pointer does on a page: nothing special (select and read), or draw this kind. */
export type Tool = AnnotKind | null;

export const TOOLS = ['highlight', 'underline', 'strikeout', 'note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp'] as const;

const DRAWN: ReadonlySet<AnnotKind> = new Set(['note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp']);
export const isDrawTool = (tool: Tool): tool is AnnotKind => tool !== null && DRAWN.has(tool);

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
