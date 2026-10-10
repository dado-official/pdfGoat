// Page area and page size: cropping and scaling a page to a new paper size. Done in PDF space,
// where the content and the annotations of the page live.
import type { Matrix, PDFDocument, PDFObject, PDFPage, Rect } from 'mupdf';
import type { Box } from '../core/textLayer';
import type { Mupdf } from './mupdf';

/** The box that holds a rectangle after a matrix is applied to its corners. */
function transformRect(m: Matrix, [x0, y0, x1, y1]: readonly number[]): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Sets the page's visible area, given in PDF space. (`setPageBox` takes page space, which moves with every box.) */
const setBoxes = (doc: PDFDocument, page: PDFPage, rect: Rect) => {
  const obj = page.getObject();
  for (const key of ['MediaBox', 'CropBox']) {
    const list = doc.newArray();
    for (const v of rect) list.push(doc.newReal(v));
    obj.put(key, list);
  }
};

/** Puts text before and after the page's content, e.g. to scale all of it. */
function wrapContents(doc: PDFDocument, page: PDFPage, before: string, after: string) {
  const obj = page.getObject();
  const old = obj.get('Contents');
  const list = doc.newArray();
  list.push(doc.addStream(before, doc.newDictionary()));
  if (old.isArray()) for (let i = 0; i < old.length; i++) list.push(old.get(i));
  else if (!old.isNull()) list.push(old);
  list.push(doc.addStream(after, doc.newDictionary()));
  obj.put('Contents', list);
}

const POINT_LISTS = ['Rect', 'QuadPoints', 'L', 'Vertices', 'CL'];

/** Moves and scales the coordinates of a list of numbers that come in pairs. */
function mapPairs(list: PDFObject, f: (x: number, y: number) => [number, number]) {
  for (let i = 0; i + 1 < list.length; i += 2) {
    const a = list.get(i);
    const b = list.get(i + 1);
    if (!a.isNumber() || !b.isNumber()) continue;
    const [x, y] = f(a.asNumber(), b.asNumber());
    list.put(i, x);
    list.put(i + 1, y);
  }
}

/** Scales and moves every annotation of a page, links and form fields included. */
function transformAnnots(page: PDFPage, s: number, tx: number, ty: number) {
  const annots = page.getObject().get('Annots');
  if (!annots.isArray()) return;
  const f = (x: number, y: number): [number, number] => [x * s + tx, y * s + ty];
  for (let i = 0; i < annots.length; i++) {
    const annot = annots.get(i);
    if (!annot.isDictionary()) continue;
    for (const key of POINT_LISTS) {
      const list = annot.get(key);
      if (list.isArray()) mapPairs(list, f);
    }
    const ink = annot.get('InkList');
    if (ink.isArray()) for (let k = 0; k < ink.length; k++) if (ink.get(k).isArray()) mapPairs(ink.get(k), f);
  }
}

/**
 * Cuts a page down to `crop` (page points as shown) and/or scales what is visible to fit `size`
 * (points as shown), centred. Content outside the crop stays in the file, only hidden.
 */
export function applyPageBox(engine: Mupdf, doc: PDFDocument, page: PDFPage, crop: Box | undefined, size: [number, number] | undefined) {
  if (!crop && !size) return;
  const inv = engine.Matrix.invert(page.getTransform());
  const visible = transformRect(inv, crop ?? page.getBounds());
  if (!size) return setBoxes(doc, page, visible);

  const rotate = page.getObject().getInheritable('Rotate');
  const turned = rotate.isNumber() && Math.abs(rotate.asNumber()) % 180 !== 0;
  const [w, h] = turned ? [size[1], size[0]] : size;
  const vw = visible[2] - visible[0];
  const vh = visible[3] - visible[1];
  if (vw <= 0 || vh <= 0) return;
  const s = Math.min(w / vw, h / vh);
  const tx = (w - s * vw) / 2 - s * visible[0];
  const ty = (h - s * vh) / 2 - s * visible[1];
  wrapContents(doc, page, `q ${s} 0 0 ${s} ${tx} ${ty} cm\n`, 'Q\n');
  transformAnnots(page, s, tx, ty);
  setBoxes(doc, page, [0, 0, w, h]);
}
