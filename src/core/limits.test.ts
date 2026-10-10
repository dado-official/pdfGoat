import { describe, expect, it } from 'vitest';
import { checkFileSize, MAX_FILE_BYTES, toMegabytes, WARN_FILE_BYTES } from './limits';

describe('checkFileSize', () => {
  it('accepts normal files', () => {
    expect(checkFileSize(0)).toBe('ok');
    expect(checkFileSize(WARN_FILE_BYTES - 1)).toBe('ok');
  });

  it('warns from the warning size up to the maximum', () => {
    expect(checkFileSize(WARN_FILE_BYTES)).toBe('warn');
    expect(checkFileSize(MAX_FILE_BYTES)).toBe('warn');
  });

  it('rejects files above the maximum', () => {
    expect(checkFileSize(MAX_FILE_BYTES + 1)).toBe('reject');
  });
});

it('toMegabytes rounds and never reports 0', () => {
  expect(toMegabytes(10)).toBe(1);
  expect(toMegabytes(MAX_FILE_BYTES)).toBe(500);
  expect(toMegabytes(1.6 * 1024 * 1024)).toBe(2);
});
