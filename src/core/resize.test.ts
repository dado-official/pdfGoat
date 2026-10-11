import { describe, expect, it } from 'vitest';
import type { Annot } from './annotations';
import { clampShift, cursorOf, dragBox, dragHandle, dragLineEnd, gripOf, HANDLES, keepsRatio, MIN_SIZE, resizeAnnot } from './resize';
import type { Box } from './textLayer';

const SIZE = { width: 300, height: 500 };
const BOX: Box = [100, 100, 200, 150];
const FREE = { keepRatio: false, size: SIZE };
const KEEP = { keepRatio: true, size: SIZE };
const annot = (extra: Partial<Annot>): Annot => ({ id: 'a', kind: 'square', color: '#000000', contents: '', box: BOX, created: 1, ...extra });

describe('dragBox', () => {
  it('moves only the pulled sides and leaves the opposite ones', () => {
    expect(dragBox(BOX, 'e', [250, 400], FREE)).toEqual([100, 100, 250, 150]);
    expect(dragBox(BOX, 'n', [0, 60], FREE)).toEqual([100, 60, 200, 150]);
    expect(dragBox(BOX, 'nw', [80, 70], FREE)).toEqual([80, 70, 200, 150]);
    expect(dragBox(BOX, 'se', [260, 190], FREE)).toEqual([100, 100, 260, 190]);
  });

  it('turns a pulled-through side into the smallest size instead of flipping', () => {
    expect(dragBox(BOX, 'e', [50, 0], FREE)).toEqual([100, 100, 100 + MIN_SIZE, 150]);
    expect(dragBox(BOX, 'n', [0, 400], FREE)).toEqual([100, 142, 200, 150]);
  });

  it('stays on the page', () => {
    expect(dragBox(BOX, 'se', [900, 900], FREE)).toEqual([100, 100, 300, 500]);
    expect(dragBox(BOX, 'nw', [-50, -50], FREE)).toEqual([0, 0, 200, 150]);
  });

  it('keeps the shape: a corner follows the larger change', () => {
    const [x0, y0, x1, y1] = dragBox(BOX, 'se', [300, 160], KEEP); // box 100 x 50, ratio 2
    expect(x0).toBe(100);
    expect(y0).toBe(100);
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(2, 6);
    expect(x1 - x0).toBeCloseTo(200, 6);
  });

  it('keeps the shape: an edge grows the other direction around its middle', () => {
    const [x0, y0, x1, y1] = dragBox(BOX, 'e', [300, 0], KEEP);
    expect(x0).toBe(100);
    expect(x1).toBe(300);
    expect((y0 + y1) / 2).toBeCloseTo(125, 6);
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(2, 6);
  });

  it('keeps the shape and the page together', () => {
    const [x0, y0, x1, y1] = dragBox([100, 100, 200, 300], 'se', [900, 400], KEEP); // ratio 0.5, page 300 x 500
    expect(x1).toBeLessThanOrEqual(300);
    expect(y1).toBeLessThanOrEqual(500);
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(0.5, 6);
  });

  it('never goes below the smallest size when keeping the shape', () => {
    const [x0, y0, x1, y1] = dragBox(BOX, 'se', [101, 101], KEEP);
    expect(Math.min(x1 - x0, y1 - y0)).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(2, 6);
  });

  it('does not turn a box without width or height into NaN when keeping the shape', () => {
    const flat = dragBox([100, 100, 200, 100], 'se', [250, 150], KEEP);
    expect(flat.every(Number.isFinite)).toBe(true);
    expect(flat).toEqual([100, 100, 250, 150]);
  });

  it('lets a box that is thinner than the smallest size get smaller without growing first', () => {
    const [x0, , x1] = dragBox([100, 100, 200, 103], 'se', [150, 101], KEEP);
    expect(x1 - x0).toBeLessThan(100);
  });

  it.each(HANDLES)('handle %s: pulling it to where it already is changes nothing', (handle) => {
    const at: Record<string, [number, number]> = { w: [100, 125], e: [200, 125], n: [150, 100], s: [150, 150], nw: [100, 100], ne: [200, 100], sw: [100, 150], se: [200, 150] };
    expect(dragBox(BOX, handle, at[handle], FREE)).toEqual(BOX);
    dragBox(BOX, handle, at[handle], KEEP).forEach((v, i) => expect(v).toBeCloseTo(BOX[i], 6));
  });
});

describe('resizeAnnot', () => {
  it('only changes the box of a plain shape', () => {
    expect(resizeAnnot(annot({}), [0, 0, 50, 50]).box).toEqual([0, 0, 50, 50]);
  });

  it('maps freehand strokes into the new box and makes the box follow them', () => {
    const ink = annot({ kind: 'ink', box: [98.5, 98.5, 201.5, 151.5], strokes: [[[100, 100], [200, 150]]], width: 2 });
    const out = resizeAnnot(ink, [0, 0, 100, 100]);
    const [[a, b]] = out.strokes!;
    // Saving writes the strokes, not the box: they must have moved.
    expect(a[0]).toBeLessThan(100);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(out.box).toEqual([a[0] - 1.5, a[1] - 1.5, b[0] + 1.5, b[1] + 1.5]);
    expect(out.width).toBe(2);
  });

  it('maps both ends of a line', () => {
    const line = annot({ kind: 'line', box: [98, 98, 202, 152], line: [[100, 100], [200, 150]] });
    const out = resizeAnnot(line, [0, 0, 104, 54]);
    expect(out.line![0][0]).toBeCloseTo(2, 6);
    expect(out.line![1][0]).toBeCloseTo(102, 6);
  });
});

describe('dragLineEnd', () => {
  const line = annot({ kind: 'arrow', box: [98, 98, 202, 152], line: [[100, 100], [200, 150]] });

  it('moves one end and fits the box around the line', () => {
    const out = dragLineEnd(line, 'end', [250, 300], SIZE);
    expect(out.line).toEqual([[100, 100], [250, 300]]);
    expect(out.box).toEqual([98, 98, 252, 302]);
  });

  it('keeps the line on the page and above the smallest length', () => {
    expect(dragLineEnd(line, 'start', [-40, 900], SIZE).line).toEqual([[0, 500], [200, 150]]);
    expect(dragLineEnd(line, 'start', [199, 149], SIZE)).toBe(line);
  });
});

describe('dragHandle', () => {
  it('keeps the shape of stamps, tick boxes and round buttons, and Shift lets it go', () => {
    const stamp = annot({ kind: 'stamp' });
    expect(keepsRatio(stamp)).toBe(true);
    expect(keepsRatio(annot({ kind: 'field', field: { type: 'radio' } as Annot['field'] }))).toBe(true);
    expect(keepsRatio(annot({}))).toBe(false);
    const kept = dragHandle(stamp, 'se', [300, 100], { shift: false, size: SIZE }).box;
    expect((kept[2] - kept[0]) / (kept[3] - kept[1])).toBeCloseTo(2, 6);
    expect(dragHandle(stamp, 'se', [300, 100], { shift: true, size: SIZE }).box[3]).toBe(108);
    // For a plain shape it is the other way round.
    expect(dragHandle(annot({}), 'se', [300, 100], { shift: false, size: SIZE }).box[3]).toBe(108);
  });

  it('offers handles only where they make sense', () => {
    expect(gripOf(annot({ kind: 'highlight' }))).toBeNull();
    expect(gripOf(annot({ kind: 'note' }))).toBeNull();
    expect(gripOf(annot({ kind: 'arrow' }))).toBe('ends');
    expect(gripOf(annot({ kind: 'ink' }))).toBe('box');
    expect(gripOf(annot({ kind: 'text' }))).toBe('box');
  });
});

describe('clampShift', () => {
  it('stops a box at the edges of the page', () => {
    expect(clampShift(BOX, -500, 900, SIZE)).toEqual([-100, 350]);
    expect(clampShift(BOX, 20, -30, SIZE)).toEqual([20, -30]);
  });

  it('does not push a box that sticks out onto the page, but lets it come back', () => {
    const out: Box = [-50, 100, 50, 150];
    expect(clampShift(out, 0, -10, SIZE)).toEqual([0, -10]);
    expect(clampShift(out, -20, 0, SIZE)).toEqual([0, 0]); // not further out
    expect(clampShift(out, 80, 0, SIZE)).toEqual([80, 0]); // back in
  });
});

describe('cursorOf', () => {
  it('follows the turn of the page', () => {
    expect(cursorOf('se', 0)).toBe('nwse-resize');
    expect(cursorOf('ne', 0)).toBe('nesw-resize');
    expect(cursorOf('e', 0)).toBe('ew-resize');
    expect(cursorOf('se', 90)).toBe('nesw-resize');
    expect(cursorOf('e', 270)).toBe('ns-resize');
    expect(cursorOf('se', 180)).toBe('nwse-resize');
  });
});
