import { resolveBookmarks, type Bookmark } from '../core/bookmarks';
import { buildDocx } from '../core/docx';
import { ocrLines } from '../core/ocr';
import { finalSize } from '../core/pages';
import { outputBase, partName } from '../core/ranges';
import { toMarkdown, toParagraphs, toText, withoutCovered } from '../core/textExport';
import type { Cleaning, Protection } from '../core/protect';
import type { PageRef } from '../core/types';
import { useI18n } from '../i18n/context';
import { zip } from '../pdf/build';
import { buildPdf, CancelledError } from '../pdf/engine';
import { renderFinalPng } from '../pdf/render';
import { getText, type SourceDoc } from '../pdf/view';
import { download } from '../ui/download';
import { allowWriting, writeInto } from '../features/open/fileAccess';
import type { ExportFormat } from '../features/export/ExportDialog';
import type { SplitPlan } from '../features/merge-split/SplitDialog';
import type { RunJob } from './useJob';

interface Params {
  run: RunJob;
  setError: (text: string) => void;
  setNotice: (text: string) => void;
  pages: PageRef[];
  selected: ReadonlySet<string>;
  /** The pages the page tools and exports work on. */
  target: PageRef[];
  docs: Record<string, SourceDoc>;
  sizeOf: (p: PageRef) => { width: number; height: number } | null;
  bookmarks: Bookmark[] | null;
  flatten: boolean;
  date: string;
  protect: Protection | null;
  clean: Cleaning;
}

/** Everything that writes a file: save, save in place, split, and export as pictures or text. */
export function useSave({ run, setError, setNotice, pages, selected, target, docs, sizeOf, bookmarks, flatten, date, protect, clean }: Params) {
  const { t } = useI18n();
  // Pages that come from a generated file (a blank page) do not name the output.
  const ownPages = pages.filter((p) => !docs[p.docId]?.generated);
  const base = () => outputBase(ownPages.map((p) => docs[p.docId].name), t('file.merged'));

  /** What goes into every file that is written, with the bookmarks the user set up for these pages. */
  const optionsFor = (list: PageRef[]) => ({
    flatten,
    date,
    protect,
    clean,
    outline: bookmarks ? resolveBookmarks(bookmarks, list) : undefined,
  });

  /** After saving pages with redactions: say what a redaction does not reach. */
  const remindOfLeftovers = (list: PageRef[], before = '') => {
    if (list.some((p) => p.annots?.some((a) => a.kind === 'redact')) && !(clean.metadata && clean.attachments)) setNotice(`${before}${before ? ' ' : ''}${t('redact.leftover')}`);
    else if (before) setNotice(before);
  };

  const save = () =>
    run(t('busy.saving'), async (job) => {
      download(await buildPdf(pages, docs, { ...job, ...optionsFor(pages) }), `${base()}.pdf`);
      remindOfLeftovers(pages);
    });

  // The file on disk that the document of this tab came from, when it can be written back.
  const sourceDoc = new Set(ownPages.map((p) => p.docId)).size === 1 ? docs[ownPages[0].docId] : undefined;
  const overwriteTarget = sourceDoc?.handle ? sourceDoc : undefined;

  /** Writes the document into the file it was opened from. */
  async function overwrite() {
    const doc = overwriteTarget;
    if (!doc?.handle) return;
    // Permission needs a click that is still fresh, so it is asked for before the work starts.
    if (!(await allowWriting(doc.handle).catch(() => false))) {
      setError(t('overwrite.denied'));
      return;
    }
    await run(t('busy.saving'), async (job) => {
      const bytes = await buildPdf(pages, docs, { ...job, ...optionsFor(pages) });
      await writeInto(doc.handle!, bytes);
      remindOfLeftovers(pages, t('overwrite.done', { name: doc.name }));
    });
  }

  const split = (plan: SplitPlan) =>
    run(t('busy.splitting'), async (job) => {
      if (plan === 'selection') {
        const chosen = pages.filter((p) => selected.has(p.id));
        download(await buildPdf(chosen, docs, { ...job, ...optionsFor(chosen) }), `${base()}-${t('file.selection')}.pdf`);
        return;
      }
      const files = [];
      for (const [i, group] of plan.entries()) {
        const chosen = group.map((k) => pages[k]);
        files.push({
          name: partName(base(), i, group, t('file.pageAbbr')),
          bytes: await buildPdf(chosen, docs, {
            signal: job.signal,
            ...optionsFor(chosen),
            onProgress: (f) => job.onProgress?.((i + f) / plan.length),
          }),
        });
      }
      if (files.length === 1) download(files[0].bytes, files[0].name);
      else download(await zip(files), `${base()}-${t('file.split')}.zip`, 'application/zip');
    });

  /** Saves the pages as pictures, or the text of the pages as plain text or Markdown. */
  const exportPages = (format: ExportFormat, dpi: number) =>
    run(t('busy.exporting'), async (job) => {
      const name = base();
      if (format === 'png') {
        const files: { name: string; bytes: Uint8Array }[] = [];
        for (const [i, p] of target.entries()) {
          if (job.signal?.aborted) throw new CancelledError();
          const own = sizeOf(p);
          if (!own) continue;
          const shown = finalSize(p, own);
          const number = pages.indexOf(p) + 1;
          const bytes = await renderFinalPng(p, docs, { width: Math.round((shown.width * dpi) / 72), number, total: pages.length, date });
          files.push({ name: `${name}-${String(number).padStart(2, '0')}.png`, bytes });
          job.onProgress?.((i + 1) / target.length);
        }
        if (!files.length) return;
        if (files.length === 1) download(files[0].bytes, files[0].name, 'image/png');
        else download(await zip(files), `${name}-${t('export.images')}.zip`, 'application/zip');
        return;
      }
      const texts: ReturnType<typeof toParagraphs>[] = [];
      for (const [i, p] of target.entries()) {
        if (job.signal?.aborted) throw new CancelledError();
        const doc = docs[p.docId];
        const lines = [...(doc?.sizes[p.srcIndex] ? await getText(doc, p.srcIndex) : []), ...ocrLines(p.ocr ?? [])];
        // Text under a redaction must not come back through an export.
        const kept = withoutCovered(lines, (p.annots ?? []).filter((a) => a.kind === 'redact').map((a) => a.box));
        texts.push(toParagraphs(kept.map((l) => ({ text: l.text, x: l.x, y: l.y, size: l.size }))));
        job.onProgress?.((i + 1) / target.length);
      }
      const text = format === 'md' ? toMarkdown(texts) : toText(texts);
      if (format === 'docx' && texts.some((p) => p.length)) {
        download(buildDocx(texts), `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return;
      }
      if (!text.trim()) {
        setNotice(t('export.noText'));
        return;
      }
      download(new TextEncoder().encode(text), `${name}.${format}`, format === 'md' ? 'text/markdown' : 'text/plain');
    });

  return { save, overwrite, overwriteTarget, split, exportPages, optionsFor, base };
}
