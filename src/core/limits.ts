// File size limits. Everything is held in browser memory, so very large files end in a crashed tab.

const MB = 1024 * 1024;

/** From this size on the user is told that opening and saving may be slow. */
export const WARN_FILE_BYTES = 100 * MB;
/** Larger files are refused with a clear message. */
export const MAX_FILE_BYTES = 500 * MB;

export type SizeVerdict = 'ok' | 'warn' | 'reject';

export function checkFileSize(bytes: number): SizeVerdict {
  if (bytes > MAX_FILE_BYTES) return 'reject';
  return bytes >= WARN_FILE_BYTES ? 'warn' : 'ok';
}

/** Size in whole megabytes for messages, at least 1. */
export const toMegabytes = (bytes: number) => Math.max(1, Math.round(bytes / MB));
