// Geometry of the invisible text layer and of search highlights, in page points.
// The layer is built in the page's own space and then scaled and turned as a whole by CSS,
// so zooming and rotating never has to place the text again.
import type { FontStyle } from './edits';
import type { Size } from './readerLayout';

export interface LineShape {
  text: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  length: number;
}

export type Box = [number, number, number, number];

/** One line of text on a page, in page points (y points down, as drawn). */
export interface TextLine {
  text: string;
  /** Start of the baseline. */
  x: number;
  y: number;
  /** Direction the text runs in, a unit vector. */
  dx: number;
  dy: number;
  /** Font size in points. */
  size: number;
  /** How far the line runs along its direction. */
  length: number;
  /** Colour of the first character, #rrggbb. */
  color: string;
  /** What the font of the first character looks like. */
  font: FontStyle;
}

/** Where the baseline sits inside a line box of height 1 em (typical for sans-serif fonts). */
export const BASELINE = 0.85;

/**
 * CSS for one line: its box starts above the baseline start, is turned to the text direction and
 * stretched sideways until the text is as long as in the file.
 * `naturalWidth` is the width of the text at the font size `size`.
 */
export function lineStyle(line: LineShape, naturalWidth: number) {
  const angle = (Math.atan2(line.dy, line.dx) * 180) / Math.PI;
  const stretch = naturalWidth > 0 ? line.length / naturalWidth : 1;
  return {
    left: line.x,
    top: line.y - BASELINE * line.size,
    fontSize: line.size,
    transformOrigin: `0 ${BASELINE * line.size}px`,
    transform: `rotate(${angle}deg) scaleX(${stretch})`,
  };
}

/** CSS transform that places a layer built in page space (`size`, unturned) on screen. */
export function overlayTransform(size: Size, rotation: number, scale: number): string {
  const w = size.width * scale;
  const h = size.height * scale;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return `translate(${h}px, 0) rotate(90deg) scale(${scale})`;
    case 180:
      return `translate(${w}px, ${h}px) rotate(180deg) scale(${scale})`;
    case 270:
      return `translate(0, ${w}px) rotate(270deg) scale(${scale})`;
    default:
      return `scale(${scale})`;
  }
}

/** A box in page space as a rectangle on the turned, scaled page, in pixels. */
export function boxOnScreen(box: Box, size: Size, rotation: number, scale: number) {
  const [x0, y0, x1, y1] = box;
  const { width: w, height: h } = size;
  let r: Box;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      r = [h - y1, x0, h - y0, x1];
      break;
    case 180:
      r = [w - x1, h - y1, w - x0, h - y0];
      break;
    case 270:
      r = [y0, w - x1, y1, w - x0];
      break;
    default:
      r = box;
  }
  return { left: r[0] * scale, top: r[1] * scale, width: (r[2] - r[0]) * scale, height: (r[3] - r[1]) * scale };
}
