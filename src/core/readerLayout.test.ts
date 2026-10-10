import { describe, expect, it } from 'vitest';
import {
  GAP,
  layoutPages,
  MAX_SCALE,
  PAD,
  pageAt,
  percentOf,
  PX_PER_PT,
  scaleFor,
  stepZoom,
  turnedSize,
  type Size,
} from './readerLayout';

const a4: Size = { width: 595, height: 842 };
const viewport: Size = { width: 1000, height: 800 };

describe('turnedSize', () => {
  it('swaps width and height for quarter turns only', () => {
    expect(turnedSize(a4, 0)).toBe(a4);
    expect(turnedSize(a4, 180)).toBe(a4);
    expect(turnedSize(a4, 90)).toEqual({ width: 842, height: 595 });
    expect(turnedSize(a4, 270)).toEqual({ width: 842, height: 595 });
  });
});

describe('scaleFor', () => {
  it('treats 100 % as the real print size on screen', () => {
    expect(scaleFor({ kind: 'percent', value: 100 }, [a4], viewport)).toBeCloseTo(PX_PER_PT);
  });

  it('fits the widest page to the width', () => {
    const wide: Size = { width: 1000, height: 400 };
    const scale = scaleFor({ kind: 'width' }, [a4, wide], viewport);
    expect(scale * 1000).toBeCloseTo(viewport.width - 2 * PAD);
  });

  it('fits the whole page when it is taller than wide', () => {
    const scale = scaleFor({ kind: 'page' }, [a4], viewport);
    expect(scale * a4.height).toBeCloseTo(viewport.height - 2 * PAD);
    expect(scale * a4.width).toBeLessThan(viewport.width);
  });

  it('keeps the scale within limits', () => {
    expect(scaleFor({ kind: 'percent', value: 100000 }, [a4], viewport)).toBe(MAX_SCALE);
    expect(scaleFor({ kind: 'width' }, [], viewport)).toBe(PX_PER_PT);
  });

  it('reports the percentage of a scale', () => {
    expect(percentOf(PX_PER_PT * 1.5)).toBe(150);
  });
});

describe('stepZoom', () => {
  it('moves to the next step in either direction and stops at the ends', () => {
    expect(stepZoom(100, 1)).toBe(125);
    expect(stepZoom(100, -1)).toBe(75);
    expect(stepZoom(110, 1)).toBe(125);
    expect(stepZoom(110, -1)).toBe(100);
    expect(stepZoom(400, 1)).toBe(400);
    expect(stepZoom(25, -1)).toBe(25);
  });
});

describe('layoutPages and pageAt', () => {
  const layout = layoutPages([a4, a4, { width: 100, height: 50 }], 1);

  it('stacks the pages with padding and gaps', () => {
    expect(layout.tops).toEqual([PAD, PAD + 842 + GAP, PAD + 2 * (842 + GAP)]);
    expect(layout.total).toBe(PAD + 842 + GAP + 842 + GAP + 50 + PAD);
  });

  it('finds the page at a position', () => {
    expect(pageAt(layout, 0)).toBe(0);
    expect(pageAt(layout, layout.tops[1] + 10)).toBe(1);
    expect(pageAt(layout, layout.total + 500)).toBe(2);
  });

  it('picks the nearer page inside a gap', () => {
    const endOfFirst = layout.tops[0] + layout.heights[0];
    expect(pageAt(layout, endOfFirst + 2)).toBe(0);
    expect(pageAt(layout, layout.tops[1] - 2)).toBe(1);
  });

  it('handles an empty document', () => {
    expect(pageAt(layoutPages([], 1), 100)).toBe(0);
  });
});
