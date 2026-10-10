import { turnedSize, type Size } from './readerLayout';
import type { PageRef } from './types';

/** True when saving writes new content into this page, so a faithful picture needs the finished page. */
export const changesContent = (p: PageRef): boolean =>
  !!p.annots?.some((a) => a.embed) || !!p.marks?.length || !!p.crop || !!p.size || !!p.edits?.length;

/** The size of a page as it will be saved and shown, in points: its own size, cropped, resized and turned. */
export function finalSize(p: PageRef, own: Size): Size {
  let size = own;
  if (p.crop) size = { width: p.crop[2] - p.crop[0], height: p.crop[3] - p.crop[1] };
  if (p.size) size = { width: p.size[0], height: p.size[1] };
  return turnedSize(size, p.rotation);
}
