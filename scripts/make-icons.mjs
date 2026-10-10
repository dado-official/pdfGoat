// Draws the app icons (PNG) from the logo with MuPDF. Run by hand when the logo changes; the
// results are kept in public/icons. The logo is 32 x 32 units: a dark tile with two white horns.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const INK = [20 / 255, 22 / 255, 26 / 255];
const WHITE = [1, 1, 1];

function tile(radius) {
  const path = new mupdf.Path();
  const k = radius * 0.5523;
  path.moveTo(radius, 0);
  path.lineTo(32 - radius, 0);
  path.curveTo(32 - radius + k, 0, 32, radius - k, 32, radius);
  path.lineTo(32, 32 - radius);
  path.curveTo(32, 32 - radius + k, 32 - radius + k, 32, 32 - radius, 32);
  path.lineTo(radius, 32);
  path.curveTo(radius - k, 32, 0, 32 - radius + k, 0, 32 - radius);
  path.lineTo(0, radius);
  path.curveTo(0, radius - k, radius - k, 0, radius, 0);
  path.closePath();
  return path;
}

function horn(left) {
  const path = new mupdf.Path();
  const x = (v) => (left ? v : 32 - v);
  path.moveTo(x(13), 27);
  path.curveTo(x(13), 16, x(10), 9, x(3), 5);
  return path;
}

/** The logo at `size` pixels; `inner` scales the horns around the middle (smaller for maskable icons). */
function render(size, radius, inner) {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, size, size], true);
  pixmap.clear(0);
  const k = size / 32;
  const device = new mupdf.DrawDevice([k, 0, 0, k, 0, 0], pixmap);
  device.fillPath(tile(radius), false, [1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, INK, 1);
  const stroke = new mupdf.StrokeState({ lineCap: 'Round', lineJoin: 'Round', lineWidth: 3, miterLimit: 4 });
  const into = [inner, 0, 0, inner, (32 - 32 * inner) / 2, (32 - 32 * inner) / 2];
  for (const left of [true, false]) device.strokePath(horn(left), stroke, into, mupdf.ColorSpace.DeviceRGB, WHITE, 1);
  device.close();
  return pixmap.asPNG();
}

for (const size of [192, 512]) {
  // "any": a round-cornered tile. "maskable": a full square with a smaller logo; the system cuts its own shape.
  await writeFile(join(out, `icon-${size}.png`), render(size, 8, 1));
  await writeFile(join(out, `maskable-${size}.png`), render(size, 0, 0.65));
}
await writeFile(join(out, 'apple-touch-icon.png'), render(180, 0, 0.65));
