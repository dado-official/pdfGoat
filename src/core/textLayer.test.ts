import { describe, expect, it } from 'vitest';
import { BASELINE, boxOnScreen, lineStyle, overlayTransform } from './textLayer';

const size = { width: 400, height: 200 };

describe('lineStyle', () => {
  const line = { text: 'abc', x: 50, y: 50, dx: 1, dy: 0, size: 20, length: 100 };

  it('puts the box above the baseline and stretches the text to its length', () => {
    const s = lineStyle(line, 50);
    expect(s.top).toBeCloseTo(50 - BASELINE * 20);
    expect(s.transform).toBe('rotate(0deg) scaleX(2)');
  });

  it('turns vertical text', () => {
    expect(lineStyle({ ...line, dx: 0, dy: 1 }, 100).transform).toBe('rotate(90deg) scaleX(1)');
  });

  it('does not divide by zero for text without width', () => {
    expect(lineStyle(line, 0).transform).toContain('scaleX(1)');
  });
});

describe('overlayTransform', () => {
  it('only scales an unturned page', () => {
    expect(overlayTransform(size, 0, 2)).toBe('scale(2)');
    expect(overlayTransform(size, 360, 2)).toBe('scale(2)');
  });

  it('moves a turned page back into view', () => {
    expect(overlayTransform(size, 90, 1)).toBe('translate(200px, 0) rotate(90deg) scale(1)');
    expect(overlayTransform(size, 180, 1)).toBe('translate(400px, 200px) rotate(180deg) scale(1)');
    expect(overlayTransform(size, 270, 1)).toBe('translate(0, 400px) rotate(270deg) scale(1)');
  });
});

describe('boxOnScreen', () => {
  const box: [number, number, number, number] = [10, 20, 60, 40];

  it('scales an unturned box', () => {
    expect(boxOnScreen(box, size, 0, 2)).toEqual({ left: 20, top: 40, width: 100, height: 40 });
  });

  it('follows the turn of the page', () => {
    // After 90° clockwise the page is 200 wide and 400 high; the top left corner becomes the top right.
    expect(boxOnScreen(box, size, 90, 1)).toEqual({ left: 160, top: 10, width: 20, height: 50 });
    expect(boxOnScreen(box, size, 180, 1)).toEqual({ left: 340, top: 160, width: 50, height: 20 });
    expect(boxOnScreen(box, size, 270, 1)).toEqual({ left: 20, top: 340, width: 20, height: 50 });
  });
});
