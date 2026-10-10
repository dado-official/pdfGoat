// Levels for making a PDF smaller: pictures larger than `maxSide` pixels are scaled down and all
// pictures are stored again as JPEG with the given quality.

export type CompressLevel = 'light' | 'medium' | 'strong';

export interface Compression {
  maxSide: number;
  /** JPEG quality, 1 to 100. */
  quality: number;
}

export const LEVELS: Record<CompressLevel, Compression> = {
  light: { maxSide: 2400, quality: 85 },
  medium: { maxSide: 1600, quality: 75 },
  strong: { maxSide: 1000, quality: 60 },
};

/** The size of a picture after scaling it down so that its longest side is at most `maxSide`. */
export function scaledSize(width: number, height: number, maxSide: number): [number, number] {
  const k = Math.min(1, maxSide / Math.max(width, height));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

/** Bytes as "1,2 MB" or "340 KB" in the given language. */
export function formatBytes(bytes: number, locale: string): string {
  const fmt = (n: number, digits: number) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (bytes >= 1024 * 1024) return `${fmt(bytes / (1024 * 1024), 1)} MB`;
  if (bytes >= 1024) return `${fmt(bytes / 1024, 0)} KB`;
  return `${bytes} B`;
}

/** How much smaller the result is, in percent (0 when it is not smaller). */
export const savedPercent = (before: number, after: number): number => (before > 0 && after < before ? Math.round((1 - after / before) * 100) : 0);
