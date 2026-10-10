/** One page in the working list; points into a source document. */
export interface PageRef {
  id: string;
  docId: string;
  srcIndex: number;
  /** Extra clockwise rotation on top of the page's own, in degrees (0, 90, 180, 270). */
  rotation: number;
}
