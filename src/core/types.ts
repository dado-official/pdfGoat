import type { Annot } from './annotations';

/** One page in the working list; points into a source document. */
export interface PageRef {
  id: string;
  docId: string;
  srcIndex: number;
  /** Extra clockwise rotation on top of the page's own, in degrees (0, 90, 180, 270). */
  rotation: number;
  /** Comments added to this page in PDFgoat. */
  annots?: Annot[];
  /** Positions of the comments already in the file that were deleted (see `listComments`). */
  removed?: number[];
}
