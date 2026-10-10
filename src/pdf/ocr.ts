// Text recognition with Tesseract, running in its own worker. The engine and the language data
// are served from this site (see scripts/copy-ocr.mjs) and are only fetched when the user starts a
// recognition. Nothing leaves the browser.
import { MIN_CONFIDENCE, type OcrWord } from '../core/ocr';

export type OcrLang = 'deu' | 'eng' | 'deu+eng';
export const OCR_LANGS: readonly OcrLang[] = ['deu', 'eng', 'deu+eng'];

/** Thrown when the user cancels. */
export class OcrCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'OcrCancelled';
  }
}

export interface PageImage {
  png: Uint8Array;
  /** Width of the page in points, to turn pixels back into points. */
  pointsWide: number;
}

/** Pixels wide for a page that is `pointsWide` points wide: 300 dpi, at most 3200 pixels. */
export const ocrWidth = (pointsWide: number) => Math.min(3200, Math.round((pointsWide * 300) / 72));

const url = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;

/**
 * Recognises the text of `count` pages. `getImage(i)` hands over the picture of a page (null for a
 * page that cannot be drawn). Returns the words of every page, or null where there was no picture.
 */
export async function recognizePages(
  lang: OcrLang,
  count: number,
  getImage: (index: number) => Promise<PageImage | null>,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<(OcrWord[] | null)[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang.split('+'), 1, {
    workerPath: url('ocr/worker.min.js'),
    corePath: url('ocr'),
    langPath: url('ocr/lang'),
    workerBlobURL: false,
    gzip: true,
  });
  const results: (OcrWord[] | null)[] = [];
  try {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new OcrCancelled();
      onProgress(i, count);
      const image = await getImage(i);
      if (!image) {
        results.push(null);
        continue;
      }
      const bitmap = await createImageBitmap(new Blob([image.png as BlobPart], { type: 'image/png' }));
      const k = image.pointsWide / bitmap.width;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      if (signal?.aborted) throw new OcrCancelled();
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? [])
        for (const paragraph of block.paragraphs)
          for (const line of paragraph.lines)
            for (const w of line.words) {
              const text = w.text.trim();
              if (!text || w.confidence < MIN_CONFIDENCE) continue;
              words.push({ text, box: [w.bbox.x0 * k, w.bbox.y0 * k, w.bbox.x1 * k, w.bbox.y1 * k] });
            }
      results.push(words);
    }
    onProgress(count, count);
  } finally {
    await worker.terminate();
  }
  return results;
}
