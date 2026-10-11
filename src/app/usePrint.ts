import { useCallback, useRef, useState } from 'react';
import { finalSize } from '../core/pages';
import type { PageRef } from '../core/types';
import { CancelledError } from '../pdf/engine';
import { useI18n } from '../i18n/context';
import { renderFinal } from '../pdf/render';
import type { SourceDoc } from '../pdf/view';
import type { PrintPage } from '../features/print/PrintSheet';
import type { RunJob } from './useJob';

const PRINT_DPI = 150;

interface Params {
  run: RunJob;
  pages: PageRef[];
  docs: Record<string, SourceDoc>;
  date: string;
  setNotice: (text: string) => void;
}

/** Prints the pages: the browser prints what is on the page, so they are drawn as images (150 dpi) first. */
export function usePrint({ run, pages, docs, date, setNotice }: Params) {
  const { t } = useI18n();
  const [printPages, setPrintPages] = useState<PrintPage[] | null>(null);
  // The images are freed when the print dialog closes or when everything is closed.
  const printed = useRef<PrintPage[]>([]);
  const freePrint = useCallback(() => {
    printed.current.forEach((p) => URL.revokeObjectURL(p.url));
    printed.current = [];
    setPrintPages(null);
  }, []);

  const print = () =>
    run(t('busy.printing'), async (job) => {
      const made: PrintPage[] = [];
      let skipped = 0;
      try {
        for (const [i, p] of pages.entries()) {
          if (job.signal?.aborted) throw new CancelledError();
          const size = docs[p.docId].sizes[p.srcIndex];
          if (!size) {
            skipped++;
            continue;
          }
          const turned = finalSize(p, { width: size[0], height: size[1] });
          const url = await renderFinal(p, docs, {
            width: Math.round((turned.width * PRINT_DPI) / 72),
            dpr: 1,
            number: i + 1,
            total: pages.length,
            date,
          });
          made.push({ url, landscape: turned.width > turned.height });
          job.onProgress?.((i + 1) / pages.length);
        }
      } catch (err) {
        made.forEach((m) => URL.revokeObjectURL(m.url));
        throw err;
      }
      if (skipped) setNotice(t('warning.printSkipped', { count: skipped }));
      freePrint();
      if (made.length) {
        printed.current = made;
        setPrintPages(made);
      }
    });

  return { printPages, print, freePrint };
}
