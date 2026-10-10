// The pictures on a page. A picture is taken out as it appears on the page: with the turn, flip and
// transparency it has there, not as the raw data of the file (which can be upside down, have its
// transparency in a separate mask or use colours that a PNG cannot hold).
import type { PDFPage } from 'mupdf';
import type { Box } from '../core/textLayer';
import type { Mupdf } from './mupdf';

interface Found {
  box: Box;
  matrix: [number, number, number, number, number, number];
  image: import('mupdf').Image;
}

function find(page: PDFPage, each: (f: Found, index: number) => void) {
  const text = page.toStructuredText('preserve-images');
  try {
    let n = 0;
    text.walk({
      onImageBlock(bbox, matrix, image) {
        each({ box: [bbox[0], bbox[1], bbox[2], bbox[3]], matrix: matrix as Found['matrix'], image }, n++);
      },
    });
  } finally {
    text.destroy();
  }
}

/** The boxes of the pictures of a page, in the order they are found. */
export function pictureBoxes(page: PDFPage): Box[] {
  const boxes: Box[] = [];
  find(page, (f) => boxes.push(f.box));
  return boxes;
}

/**
 * One picture as PNG, as it looks on the page (turned, flipped, with its transparency), as sharp as
 * the file has it. Null when there is none at that place. The pixels are placed by hand: drawing the
 * picture again with the engine would leave its transparency out.
 */
export function pictureAsPng(engine: Mupdf, page: PDFPage, index: number): Uint8Array | null {
  let png: Uint8Array | null = null;
  find(page, (f, n) => {
    if (n !== index) return;
    const [x0, y0, x1, y1] = f.box;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    // The picture's own pixels, and how see-through each is.
    const color = f.image.toPixmap().convertToColorSpace(engine.ColorSpace.DeviceRGB, true);
    const iw = color.getWidth();
    const ih = color.getHeight();
    const n4 = color.getNumberOfComponents();
    const hasAlpha = color.getAlpha() > 0;
    const src = color.getPixels();
    const stride = color.getStride();
    const mask = hasAlpha ? null : f.image.getMask();
    const grey = mask ? mask.toPixmap().convertToColorSpace(engine.ColorSpace.DeviceGray, false) : null;
    const greyPixels = grey?.getPixels();

    // Pixels per point: the picture keeps its own resolution (never more than 4000 pixels wide).
    const along = Math.hypot(f.matrix[0], f.matrix[1]) || w;
    const k = Math.min(4000 / w, Math.max(0.5, iw / along));
    const width = Math.max(1, Math.round(w * k));
    const height = Math.max(1, Math.round(h * k));
    const out = new engine.Pixmap(engine.ColorSpace.DeviceRGB, [0, 0, width, height], true);
    try {
      const dst = out.getPixels();
      const ds = out.getStride();
      const back = engine.Matrix.invert(f.matrix);
      for (let Y = 0; Y < height; Y++) {
        for (let X = 0; X < width; X++) {
          // The page point of this pixel, then where it lies in the picture's unit square.
          const px = x0 + ((X + 0.5) * w) / width;
          const py = y0 + ((Y + 0.5) * h) / height;
          const u = back[0] * px + back[2] * py + back[4];
          const v = back[1] * px + back[3] * py + back[5];
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          const sx = Math.min(iw - 1, Math.floor(u * iw));
          const sy = Math.min(ih - 1, Math.floor(v * ih));
          const i = sy * stride + sx * n4;
          let a = 255;
          if (hasAlpha) a = src[i + n4 - 1];
          else if (grey && greyPixels) a = greyPixels[Math.min(grey.getHeight() - 1, Math.floor(v * grey.getHeight())) * grey.getStride() + Math.min(grey.getWidth() - 1, Math.floor(u * grey.getWidth())) * grey.getNumberOfComponents()];
          const o = Y * ds + X * 4;
          // The engine keeps colours multiplied with the alpha, and so do the pixels of `color` when it has one.
          const mul = hasAlpha ? 1 : a / 255;
          dst[o] = src[i] * mul;
          dst[o + 1] = src[i + 1] * mul;
          dst[o + 2] = src[i + 2] * mul;
          dst[o + 3] = a;
        }
      }
      png = out.asPNG().slice();
    } finally {
      out.destroy();
    }
  });
  return png;
}
