// Making a PDF smaller: pictures are scaled down and stored again as JPEG. Only plain pictures are
// touched (grey or colour, 8 bit, no mask); everything else is left as it is.
import type { PDFDocument, PDFObject } from 'mupdf';
import { scaledSize, type Compression } from '../core/compress';
import type { Mupdf } from './mupdf';

/** The picture objects on the pages of a document, once each. */
function pictures(doc: PDFDocument): PDFObject[] {
  const seen = new Set<number>();
  const found: PDFObject[] = [];
  const count = doc.countPages();
  for (let i = 0; i < count; i++) {
    const res = doc.findPage(i).getInheritable('Resources');
    const xobjects = res.isDictionary() ? res.get('XObject') : null;
    if (!xobjects?.isDictionary()) continue;
    xobjects.forEach((value) => {
      if (!value.isIndirect()) return;
      const n = value.asIndirect();
      if (seen.has(n)) return;
      seen.add(n);
      // An indirect object answers like the object it points to.
      if (value.isStream() && value.get('Subtype').isName() && value.get('Subtype').asName() === 'Image') found.push(value);
    });
  }
  return found;
}

/** Scales and re-encodes the pictures of a document. Returns how many were replaced. */
export function compressPictures(engine: Mupdf, doc: PDFDocument, { maxSide, quality }: Compression): number {
  let replaced = 0;
  for (const ref of pictures(doc)) {
    try {
      const dict = ref;
      if (dict.get('ImageMask').isBoolean() && dict.get('ImageMask').asBoolean()) continue;
      if (!dict.get('SMask').isNull() || !dict.get('Mask').isNull() || !dict.get('Decode').isNull()) continue;
      const image = doc.loadImage(ref);
      const comps = image.getNumberOfComponents();
      if ((comps !== 1 && comps !== 3) || image.getBitsPerComponent() !== 8 || image.getImageMask()) continue;
      const w = image.getWidth();
      const h = image.getHeight();
      const [nw, nh] = scaledSize(w, h, maxSide);
      const space = comps === 1 ? engine.ColorSpace.DeviceGray : engine.ColorSpace.DeviceRGB;
      const target = new engine.Pixmap(space, [0, 0, nw, nh], false);
      target.clear(255);
      // The picture fills the pixmap: an image is drawn into the unit square, scaled to the pixmap here.
      const device = new engine.DrawDevice([1, 0, 0, 1, 0, 0], target);
      device.fillImage(image, [nw, 0, 0, nh, 0, 0], 1);
      device.close();
      const jpeg = target.asJPEG(quality, false);
      const old = dict.readRawStream().asUint8Array().length;
      if (jpeg.length >= old) continue;
      dict.writeRawStream(jpeg);
      dict.put('Filter', doc.newName('DCTDecode'));
      dict.delete('DecodeParms');
      dict.put('Width', nw);
      dict.put('Height', nh);
      dict.put('BitsPerComponent', 8);
      dict.put('ColorSpace', doc.newName(comps === 1 ? 'DeviceGray' : 'DeviceRGB'));
      replaced++;
    } catch {
      // A picture that cannot be handled stays as it is.
    }
  }
  return replaced;
}
