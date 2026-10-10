import type { Annot } from './annotations';
import type { Mark } from './marks';
import type { Edit } from './edits';
import type { OcrWord } from './ocr';

/** One page in the working list; points into a source document. */
export interface PageRef {
  id: string;
  docId: string;
  srcIndex: number;
  /** Extra clockwise rotation on top of the page's own, in degrees (0, 90, 180, 270). */
  rotation: number;
  /** Comments added to this page in PDFgoat. */
  annots?: Annot[];
  /** Values typed into form fields of this page, by the field's position among the page's widgets. Check boxes and radio buttons hold 'on' or 'off'. */
  fields?: Record<number, string>;
  /** Header, footer, page number and watermark texts for this page. */
  marks?: Mark[];
  /** Visible area in page points (page space, y down); the rest is cut off when saving. */
  crop?: [number, number, number, number];
  /** New page size in points (as shown); the content is scaled to fit and centred. */
  size?: [number, number];
  /** Words found by text recognition, written as invisible text when saving. */
  ocr?: OcrWord[];
  /** Changes to the page's existing text and pictures. */
  edits?: Edit[];
  /** Positions of the comments already in the file that were deleted (see `listComments`). */
  removed?: number[];
}
