import { useEffect } from 'react';
import type { AnnotKind } from '../../core/annotations';

/** What the pointer does on a page: nothing special (select and read), or draw this kind. */
export type Tool = AnnotKind | 'date' | 'check' | 'signature' | 'initials' | 'embedText' | 'embedImage' | 'editText' | 'editImage' | 'redact' | 'fieldText' | 'fieldCheck' | 'fieldRadio' | 'fieldChoice' | null;

/** A picture the user made (signature or initials), ready to be placed. */
export interface Picture {
  bytes: Uint8Array;
  /** Width divided by height. */
  ratio: number;
}

export const FILL_TOOLS = ['date', 'check', 'signature', 'initials'] as const;

/** Tools that write into the page itself or add a link. */
export const INSERT_TOOLS = ['embedText', 'embedImage', 'link'] as const;

/** Tools that change what the page already contains. */
export const EDIT_TOOLS = ['editText', 'editImage'] as const;

/** Tools that add form fields. */
export const FIELD_TOOLS = ['fieldText', 'fieldCheck', 'fieldRadio', 'fieldChoice'] as const;

/** Tools that take things out of the file for good. */
export const PROTECT_TOOLS = ['redact'] as const;

export const TOOLS = ['highlight', 'underline', 'strikeout', 'note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp'] as const;

const DRAWN: ReadonlySet<string> = new Set(['note', 'text', 'ink', 'square', 'circle', 'line', 'arrow', 'stamp', 'date', 'check', 'signature', 'initials', 'embedText', 'embedImage', 'link', 'redact', 'fieldText', 'fieldCheck', 'fieldRadio', 'fieldChoice']);
export const isDrawTool = (tool: Tool): tool is Exclude<Tool, null | 'highlight' | 'underline' | 'strikeout'> => tool !== null && DRAWN.has(tool);

/** Deselect when the pointer ends up on the page itself, not on a comment. */
export function useClearSelection(onSelect: (id: string | null) => void) {
  useEffect(() => {
    const clear = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-annot], .annot-shape, .comment-panel, .comment-bar, .panel-toggle')) return;
      // A text that is being typed is taken over before the field goes away, so a quick click on Save already sees it.
      (document.activeElement as HTMLElement | null)?.blur();
      onSelect(null);
    };
    document.addEventListener('pointerdown', clear);
    return () => document.removeEventListener('pointerdown', clear);
  }, [onSelect]);
}
