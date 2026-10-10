import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppError } from './core/errors';
import { outputBase, partName } from './core/ranges';
import { toMegabytes } from './core/limits';
import { canUndo, initialState, selectedInOrder, type EditorAction } from './state/editor';
import {
  activeTab,
  clonePages,
  docsInUse,
  emptyWorkspace,
  workspaceReducer,
  type View,
} from './state/workspace';
import { zip } from './pdf/build';
import { buildPdf, CancelledError, type JobOptions } from './pdf/engine';
import { closePdf, openPdf, type OpenedPdf, type SourceDoc } from './pdf/view';
import { useI18n } from './i18n/context';
import { download } from './ui/download';
import GoatMark from './ui/GoatMark';
import { useFileDrop, useShortcuts } from './ui/useWindowEvents';
import DropZone from './features/open/DropZone';
import PasswordDialog from './features/open/PasswordDialog';
import Reader from './features/read/Reader';
import OcrDialog from './features/ocr/OcrDialog';
import { ocrWidth, recognizePages, type OcrLang } from './pdf/ocr';
import { ocrLines } from './core/ocr';
import { renderPageBytes } from './pdf/view';
import CompareDialog from './features/compare/CompareDialog';
import CompressDialog from './features/export/CompressDialog';
import { LEVELS, type CompressLevel } from './core/compress';
import ExportDialog, { type ExportFormat } from './features/export/ExportDialog';
import { toMarkdown, toParagraphs, toText } from './core/textExport';
import { buildDocx } from './core/docx';
import { renderFinalPng } from './pdf/render';
import { getText } from './pdf/view';
import ProtectDialog from './features/protect/ProtectDialog';
import { isCleaning, isProtected, noCleaning, type Cleaning, type Protection } from './core/protect';
import { finalSize } from './core/pages';
import { renderFinal } from './pdf/render';
import { imageToPdfFile, isImage } from './features/open/imageFile';
import PageTools from './features/edit/PageTools';
import MarkDialog from './features/edit/MarkDialog';
import CropDialog from './features/edit/CropDialog';
import ResizeDialog from './features/edit/ResizeDialog';
import { blankPdf } from './core/blank';
import { cropFromMargins, MM, paperSize, PAPERS } from './core/paper';
import type { PageRef } from './core/types';
import PageGrid from './features/organize/PageGrid';
import Preview from './features/organize/Preview';
import Toolbar from './features/organize/Toolbar';
import { useThumbnails } from './features/organize/useThumbnails';
import PrintSheet, { type PrintPage } from './features/print/PrintSheet';
import SplitDialog, { type SplitPlan } from './features/merge-split/SplitDialog';
import MergeDialog from './features/merge-split/MergeDialog';
import CommandPalette from './features/command/CommandPalette';
import type { Command } from './features/command/commands';
import TabBar from './features/workspace/TabBar';

const PRINT_DPI = 150;

const isOpenable = (f: File) => isPdf(f) || isImage(f);
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export default function App() {
  const { lang, setLang, t, tn, errorText } = useI18n();
  const [ws, dispatchWs] = useReducer(workspaceReducer, emptyWorkspace);
  const tab = activeTab(ws);
  const state = tab?.editor ?? initialState;
  const view: View = tab?.view ?? 'pages';
  const dispatch = useCallback((action: EditorAction) => dispatchWs({ type: 'editor', action }), []);
  const nextTab = useRef(1);
  // Opened source files, by id. They stay in memory only; nothing is uploaded.
  const [docs, setDocs] = useState<Record<string, SourceDoc>>({});
  const { thumbs, failed: failedThumbs, request: requestThumb, clear: clearThumbs, release: releaseThumbs } = useThumbnails(docs);

  const [busy, setBusy] = useState('');
  // Set while a job in the engine can be cancelled, with how far it is (0 to 1).
  const [progress, setProgress] = useState<number | null>(null);
  const job = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [protectOpen, setProtectOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [compressOpen, setCompressOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  // Protection and cleaning apply to everything that is saved, in every tab.
  const [protect, setProtect] = useState<Protection | null>(null);
  const [clean, setClean] = useState<Cleaning>(noCleaning);
  const protectActive = isProtected(protect) || isCleaning(clean);
  const [pageDialog, setPageDialog] = useState<'mark' | 'crop' | 'resize' | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [passwordAsk, setPasswordAsk] = useState<{ name: string; wrong: boolean; answer: (p: string | null) => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { pages, selected } = state;
  // Counted from the pages, so a file whose pages were all removed or undone no longer counts.
  const ownPages = pages.filter((p) => !docs[p.docId]?.generated);
  const docCount = new Set(ownPages.map((p) => p.docId)).size;
  // Page tools work on the selected pages, or on all of them when none is selected.
  const target = selected.size ? pages.filter((p) => selected.has(p.id)) : pages;
  const scope = selected.size
    ? tn('dialog.scope.selected', target.length)
    : tn('dialog.scope.all', target.length);
  const sizeOf = (p: PageRef) => {
    const s = docs[p.docId]?.sizes[p.srcIndex];
    return s ? { width: s[0], height: s[1] } : null;
  };

  /** Inserts an empty page after the last selected page, or at the end, in the shape of its neighbour. */
  async function insertBlank() {
    if (!tab) return;
    const at = selected.size ? Math.max(...pages.map((p, i) => (selected.has(p.id) ? i : -1))) + 1 : pages.length;
    const reference = pages[Math.max(0, at - 1)];
    const ref = reference ? sizeOf(reference) : null;
    const [w, h] = ref ? [ref.width, ref.height] : PAPERS.a4;
    try {
      const file = new File([blankPdf(w, h) as BlobPart], `${t('blank.name')}.pdf`, { type: 'application/pdf' });
      const opened = await openPdf(file);
      opened.doc.generated = true;
      setDocs((d) => ({ ...d, [opened.doc.id]: opened.doc }));
      dispatch({ type: 'add', pages: opened.pages, at });
    } catch (err) {
      console.error(err);
      setError(t('blank.failed'));
    }
  }

  const previewIndex = pages.findIndex((p) => p.id === previewId);
  const openFilePicker = () => fileInput.current?.click();

  /** Opens a file; protected files ask for their password until it fits or the user skips them. */
  const openWithPassword = useCallback(async (file: File): Promise<OpenedPdf | null> => {
    let password: string | undefined;
    for (;;) {
      try {
        return await openPdf(file, password);
      } catch (err) {
        if (!(err instanceof AppError) || (err.code !== 'passwordRequired' && err.code !== 'passwordWrong')) throw err;
        const wrong = err.code === 'passwordWrong';
        const answer = await new Promise<string | null>((resolve) =>
          setPasswordAsk({ name: file.name, wrong, answer: resolve }),
        );
        setPasswordAsk(null);
        if (answer === null) return null;
        password = answer;
      }
    }
  }, []);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      setError('');
      setNotice('');
      const files = [...list].filter(isOpenable);
      if (!files.length) {
        setError(t('error.noPdfSelected'));
        return;
      }
      const opened: OpenedPdf[] = [];
      const errors: string[] = [];
      const notices: string[] = [];
      for (const file of files) {
        setBusy(t('busy.opening', { name: file.name }));
        try {
          // A picture becomes a PDF of one page first.
          const result = await openWithPassword(isImage(file) ? await imageToPdfFile(file) : file);
          if (!result) continue;
          opened.push(result);
          if (result.encrypted) notices.push(t('warning.encrypted', { name: file.name }));
          if (result.large) notices.push(t('warning.large', { name: file.name, size: toMegabytes(file.size) }));
        } catch (err) {
          errors.push(errorText(err));
        }
      }
      setBusy('');
      setError(errors.join(' '));
      setNotice(notices.join(' '));
      if (!opened.length) return;
      setDocs((d) => ({ ...d, ...Object.fromEntries(opened.map((o) => [o.doc.id, o.doc])) }));
      // Every file gets its own tab; the last one opened is shown.
      for (const o of opened) {
        dispatchWs({ type: 'open', id: `tab${nextTab.current++}`, title: o.doc.name, pages: o.pages });
      }
    },
    [t, errorText, openWithPassword, setError, setNotice],
  );

  const hasEdits = (t: NonNullable<typeof tab>) => t.editor.changes.length > t.editor.locked;

  /** Closes files that no tab needs any more. */
  function dropUnusedDocs(remaining: typeof ws) {
    const inUse = docsInUse(remaining);
    const unused = Object.keys(docs).filter((id) => !inUse.has(id));
    if (!unused.length) return;
    unused.forEach((id) => void closePdf(docs[id]));
    setDocs((d) => Object.fromEntries(Object.entries(d).filter(([id]) => inUse.has(id))));
    releaseThumbs(unused);
  }

  function closeTab(id: string) {
    const target = ws.tabs.find((x) => x.id === id);
    if (!target || (hasEdits(target) && !confirm(t('confirm.closeTab', { title: target.title })))) return;
    const remaining = workspaceReducer(ws, { type: 'close', id });
    dispatchWs({ type: 'close', id });
    dropUnusedDocs(remaining);
    setPreviewId(null);
    if (!remaining.tabs.length) {
      freePrint();
      setError('');
      setNotice('');
    }
  }

  function closeAll() {
    if (ws.tabs.some(hasEdits) && !confirm(t('confirm.closeAll'))) return;
    freePrint();
    Object.values(docs).forEach((d) => void closePdf(d));
    setDocs({});
    clearThumbs();
    dispatchWs({ type: 'reset' });
    setError('');
    setNotice('');
  }

  function mergeTabs(ids: string[]) {
    const id = `tab${nextTab.current++}`;
    let n = 0;
    const pages = ids.flatMap((from) => clonePages(ws.tabs.find((x) => x.id === from)?.editor.pages ?? [], () => `${id}-p${n++}`));
    dispatchWs({ type: 'open', id, title: t('tab.merged'), pages });
  }

  async function run(label: string, task: (job: JobOptions) => Promise<void>) {
    const controller = new AbortController();
    job.current = controller;
    setBusy(label);
    setProgress(0);
    setError('');
    try {
      await task({ signal: controller.signal, onProgress: setProgress });
    } catch (err) {
      // Cancelling is the user's choice, not a failure.
      if (!(err instanceof CancelledError)) {
        console.error(err);
        setError(errorText(err));
      }
    } finally {
      job.current = null;
      setBusy('');
      setProgress(null);
    }
  }

  const base = () => outputBase(ownPages.map((p) => docs[p.docId].name), t('file.merged'));

  const save = () =>
    run(t('busy.saving'), async (job) => {
      download(await buildPdf(pages, docs, { ...job, flatten, date, protect, clean }), `${base()}.pdf`);
    });

  // Today's date for header and footer texts that contain {date}.
  const [today] = useState(() => new Date());
  const date = today.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB');
  // "Flatten form" applies to everything that is saved, in every tab.
  const [flatten, setFlatten] = useState(false);
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
        texts.push(toParagraphs(lines.map((l) => ({ text: l.text, x: l.x, y: l.y, size: l.size }))));
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

  const [printPages, setPrintPages] = useState<PrintPage[] | null>(null);

  // The images are freed when the print dialog closes or when everything is closed.
  const printed = useRef<PrintPage[]>([]);
  const freePrint = useCallback(() => {
    printed.current.forEach((p) => URL.revokeObjectURL(p.url));
    printed.current = [];
    setPrintPages(null);
  }, [setPrintPages]);

  // The browser prints what is on the page, so the pages are drawn as images (150 dpi) first.
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

  const split = (plan: SplitPlan) =>
    run(t('busy.splitting'), async (job) => {
      if (plan === 'selection') {
        const chosen = pages.filter((p) => selected.has(p.id));
        download(await buildPdf(chosen, docs, { ...job, flatten, date, protect, clean }), `${base()}-${t('file.selection')}.pdf`);
        return;
      }
      const files = [];
      for (const [i, group] of plan.entries()) {
        files.push({
          name: partName(base(), i, group, t('file.pageAbbr')),
          bytes: await buildPdf(group.map((k) => pages[k]), docs, {
            signal: job.signal,
            flatten,
            date,
            protect,
            clean,
            onProgress: (f) => job.onProgress?.((i + f) / plan.length),
          }),
        });
      }
      if (files.length === 1) download(files[0].bytes, files[0].name);
      else download(await zip(files), `${base()}-${t('file.split')}.zip`, 'application/zip');
    });

  const fileDragging = useFileDrop(addFiles);

  useShortcuts((e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      dispatch({ type: 'redo' });
    } else if (mod && key === 'z') {
      e.preventDefault();
      dispatch({ type: 'undo' });
    } else if (mod && key === 'p' && pages.length) {
      e.preventDefault();
      if (!busy) print();
    } else if (view === 'read') {
      return;
    } else if (mod && key === 'a' && pages.length) {
      e.preventDefault();
      dispatch({ type: 'selectAll' });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      e.preventDefault();
      dispatch({ type: 'remove', ids: [...selected] });
    } else if (e.key === 'Escape') {
      dispatch({ type: 'clearSelection' });
    }
  }, !previewId && !splitOpen && !passwordAsk && !paletteOpen && !mergeOpen);

  // Ctrl+K works everywhere, also while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasPages = pages.length > 0;
  const idle = !busy;
  const commands: Command[] = [
    { id: 'open', label: t('cmd.open'), keywords: t('cmd.open.kw'), enabled: true, run: openFilePicker },
    { id: 'save', label: t('cmd.save'), keywords: t('cmd.save.kw'), enabled: hasPages && idle, run: save },
    { id: 'print', label: t('cmd.print'), keywords: t('cmd.print.kw'), shortcut: 'Strg+P', enabled: hasPages && idle, run: print },
    { id: 'undo', label: t('cmd.undo'), keywords: t('cmd.undo.kw'), shortcut: 'Strg+Z', enabled: canUndo(state), run: () => dispatch({ type: 'undo' }) },
    { id: 'redo', label: t('cmd.redo'), keywords: t('cmd.redo.kw'), shortcut: 'Strg+Y', enabled: state.undone.length > 0, run: () => dispatch({ type: 'redo' }) },
    { id: 'read', label: t('cmd.read'), keywords: t('cmd.read.kw'), enabled: !!tab && view !== 'read', run: () => dispatchWs({ type: 'view', view: 'read' }) },
    { id: 'pages', label: t('cmd.pages'), keywords: t('cmd.pages.kw'), enabled: !!tab && view !== 'pages', run: () => dispatchWs({ type: 'view', view: 'pages' }) },
    { id: 'blank', label: t('cmd.blank'), keywords: t('cmd.blank.kw'), enabled: !!tab, run: insertBlank },
    { id: 'mark', label: t('cmd.mark'), keywords: t('cmd.mark.kw'), enabled: hasPages, run: () => setPageDialog('mark') },
    { id: 'crop', label: t('cmd.crop'), keywords: t('cmd.crop.kw'), enabled: hasPages, run: () => setPageDialog('crop') },
    { id: 'resize', label: t('cmd.resize'), keywords: t('cmd.resize.kw'), enabled: hasPages, run: () => setPageDialog('resize') },
    { id: 'protect', label: t('cmd.protect'), keywords: t('cmd.protect.kw'), enabled: !!tab, run: () => setProtectOpen(true) },
    { id: 'ocr', label: t('cmd.ocr'), keywords: t('cmd.ocr.kw'), enabled: hasPages, run: () => setOcrOpen(true) },
    { id: 'compare', label: t('cmd.compare'), keywords: t('cmd.compare.kw'), enabled: ws.tabs.length > 1, run: () => setCompareOpen(true) },
    { id: 'compress', label: t('cmd.compress'), keywords: t('cmd.compress.kw'), enabled: hasPages, run: () => setCompressOpen(true) },
    { id: 'export', label: t('cmd.export'), keywords: t('cmd.export.kw'), enabled: hasPages, run: () => setExportOpen(true) },
    { id: 'selectAll', label: t('cmd.selectAll'), enabled: hasPages && selected.size < pages.length, run: () => dispatch({ type: 'selectAll' }) },
    { id: 'selectNone', label: t('cmd.selectNone'), enabled: selected.size > 0, run: () => dispatch({ type: 'clearSelection' }) },
    { id: 'rotateRight', label: t('cmd.rotateRight'), keywords: t('cmd.rotate.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta: 90 }) },
    { id: 'rotateLeft', label: t('cmd.rotateLeft'), keywords: t('cmd.rotate.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta: -90 }) },
    { id: 'delete', label: t('cmd.delete'), keywords: t('cmd.delete.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'remove', ids: [...selected] }) },
    { id: 'reverse', label: t('cmd.reverse'), enabled: pages.length > 1, run: () => dispatch({ type: 'reverse' }) },
    { id: 'split', label: t('cmd.split'), keywords: t('cmd.split.kw'), enabled: hasPages, run: () => setSplitOpen(true) },
    { id: 'merge', label: t('cmd.merge'), keywords: t('cmd.merge.kw'), enabled: ws.tabs.length > 1, run: () => setMergeOpen(true) },
    { id: 'closeTab', label: t('cmd.closeTab'), enabled: !!tab, run: () => tab && closeTab(tab.id) },
    { id: 'closeAll', label: t('cmd.closeAll'), enabled: ws.tabs.length > 0, run: closeAll },
    { id: 'language', label: t('cmd.language'), keywords: t('cmd.language.kw'), enabled: true, run: () => setLang(lang === 'de' ? 'en' : 'de') },
  ];

  const previewPage = previewIndex >= 0 ? pages[previewIndex] : null;
  const allSelected = pages.length > 0 && selected.size === pages.length;

  const editing = ws.tabs.length > 0;
  const brand = (
    <div className="brand">
      <GoatMark />
      <div>
        <h1>PDFgoat</h1>
        <p>{t('brand.tagline')}</p>
      </div>
    </div>
  );
  const meta = (
    <>
      <p className="privacy" title={t('privacy.title')}>{t('privacy.badge')}</p>
      <button
        className="lang"
        title={t('lang.switch')}
        lang={lang === 'de' ? 'en' : 'de'}
        onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
      >
        {t('lang.other')}
      </button>
    </>
  );

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          if (e.currentTarget.files) addFiles(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />

      <div className={editing ? 'shell editing' : 'shell'}>
        {editing ? (
          <aside className="rail">
            {brand}

            <button className="commands" onClick={() => setPaletteOpen(true)}>
              <span>{t('command.open')}</span>
              <kbd>Strg+K</kbd>
            </button>

            <Toolbar
              pageCount={pages.length}
              docCount={docCount}
              selectedCount={selected.size}
              canUndo={canUndo(state)}
              canRedo={state.undone.length > 0}
              busy={!!busy}
              view={view}
              onView={(v) => dispatchWs({ type: 'view', view: v })}
              tabCount={ws.tabs.length}
              onMerge={() => setMergeOpen(true)}
              onAdd={openFilePicker}
              onUndo={() => dispatch({ type: 'undo' })}
              onRedo={() => dispatch({ type: 'redo' })}
              onCloseTab={() => tab && closeTab(tab.id)}
              onToggleAll={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
              onRotate={(delta) => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta })}
              onDelete={() => dispatch({ type: 'remove', ids: [...selected] })}
              onReverse={() => dispatch({ type: 'reverse' })}
              onSplit={() => setSplitOpen(true)}
              flatten={flatten}
              onFlatten={setFlatten}
              onSave={save}
              onPrint={print}
            />

            <div className="rail-foot">{meta}</div>
          </aside>
        ) : (
          <header className="top">
            {brand}
            <div className="top-end">{meta}</div>
          </header>
        )}

        <div className="work">
          {editing && (
            <TabBar
              tabs={ws.tabs}
              active={ws.active}
              onActivate={(id) => dispatchWs({ type: 'activate', id })}
              onClose={closeTab}
              onOpen={openFilePicker}
            />
          )}

          {tab && (
            <p className="status" aria-live="polite">
              {tn('status.pages', pages.length)}
              {docCount > 1 && t('status.fromFiles', { count: docCount })}
              {selected.size > 0 && t('status.selected', { count: selected.size })}
              {view === 'pages' && <span className="tip">{t('status.tip')}</span>}
            </p>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label={t('alert.close')}>✕</button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice('')} aria-label={t('alert.close')}>✕</button>
            </div>
          )}

          <main>
            {tab && !hasPages ? (
              <p className="empty-tab">{t('tab.empty')}</p>
            ) : tab && view === 'read' ? (
              <Reader
                key={tab.id}
                pages={pages}
                docs={docs}
                thumbs={thumbs}
                failedThumbs={failedThumbs}
                onNeedThumb={requestThumb}
                memory={tab.memory}
                onMemory={(memory) => dispatchWs({ type: 'memory', id: tab.id, memory })}
                onAnnotate={(id, annots, removed) => dispatch({ type: 'annotate', id, annots, removed })}
                onFill={(id, fields) => dispatch({ type: 'fill', id, fields })}
                onEdit={(id, edits) => dispatch({ type: 'edit', id, edits })}
                onProtect={() => setProtectOpen(true)}
                protectActive={protectActive}
              />
            ) : tab ? (
              <>
              <PageTools
                disabled={!hasPages}
                onBlank={insertBlank}
                onMark={() => setPageDialog('mark')}
                onCrop={() => setPageDialog('crop')}
                onResize={() => setPageDialog('resize')}
                onProtect={() => setProtectOpen(true)}
                protectActive={protectActive}
                onExport={() => setExportOpen(true)}
                onCompress={() => setCompressOpen(true)}
                onOcr={() => setOcrOpen(true)}
                canCompare={ws.tabs.length > 1}
                onCompare={() => setCompareOpen(true)}
              />
              <PageGrid
                key={tab.id}
                state={state}
                docs={docs}
                thumbs={thumbs}
                failedThumbs={failedThumbs}
                onNeedThumb={requestThumb}
                dispatch={dispatch}
                onPreview={setPreviewId}
              />
              </>
            ) : (
              <DropZone onOpen={openFilePicker} />
            )}
          </main>

          <footer>
            {t('footer.intro')}{' '}
            <a href="https://mupdf.com/" target="_blank" rel="noopener noreferrer">MuPDF</a> (AGPL).
          </footer>
        </div>
      </div>

      {fileDragging && <div className="file-overlay" aria-hidden="true">{t('drop.overlay')}</div>}
      {busy && (
        <div className="busy" role="status">
          {busy}
          {progress !== null && progress > 0 && ` ${Math.round(progress * 100)} %`}
          {progress !== null && (
            <button onClick={() => job.current?.abort()}>{t('busy.cancel')}</button>
          )}
        </div>
      )}

      {printPages && <PrintSheet key={printPages[0].url} pages={printPages} onDone={freePrint} />}

      {previewPage && (
        <Preview
          docs={docs}
          date={date}
          page={previewPage}
          number={previewIndex + 1}
          total={pages.length}
          onClose={() => setPreviewId(null)}
          onStep={(step) => {
            const next = pages[previewIndex + step];
            if (next) setPreviewId(next.id);
          }}
        />
      )}

      {passwordAsk && (
        <PasswordDialog name={passwordAsk.name} wrong={passwordAsk.wrong} onResult={passwordAsk.answer} />
      )}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {mergeOpen && (
        <MergeDialog tabs={ws.tabs} onMerge={mergeTabs} onClose={() => setMergeOpen(false)} />
      )}

      {ocrOpen && (
        <OcrDialog
          scope={scope}
          hasText={target.some((p) => p.ocr?.length)}
          onRun={async (lang: OcrLang, onProgress, signal) => {
            const found = await recognizePages(
              lang,
              target.length,
              async (i) => {
                const p = target[i];
                const own = sizeOf(p);
                if (!own || !docs[p.docId]) return null;
                const png = await renderPageBytes(docs[p.docId], p.srcIndex, { width: ocrWidth(own.width), rotation: 0, hidden: p.removed });
                return { png, pointsWide: own.width };
              },
              onProgress,
              signal,
            );
            dispatch({ type: 'ocr', words: Object.fromEntries(target.map((p, i) => [p.id, found[i]?.length ? found[i] : null])) });
            return found.reduce((n, w) => n + (w?.length ?? 0), 0);
          }}
          onRemove={() => dispatch({ type: 'ocr', words: Object.fromEntries(target.map((p) => [p.id, null])) })}
          onClose={() => setOcrOpen(false)}
        />
      )}
      {compareOpen && <CompareDialog tabs={ws.tabs} docs={docs} onClose={() => setCompareOpen(false)} />}
      {compressOpen && (
        <CompressDialog
          scope={scope}
          onCompress={async (level: CompressLevel) => {
            const options = { flatten, date, protect, clean };
            const before = await buildPdf(target, docs, options);
            const bytes = await buildPdf(target, docs, { ...options, compress: LEVELS[level] });
            return { before: before.length, after: bytes.length, bytes };
          }}
          onSave={(bytes) => download(bytes, `${base()}-${t('file.compressed')}.pdf`)}
          onClose={() => setCompressOpen(false)}
        />
      )}
      {exportOpen && <ExportDialog scope={scope} onExport={exportPages} onClose={() => setExportOpen(false)} />}
      {protectOpen && (
        <ProtectDialog
          protect={protect}
          clean={clean}
          docs={[...new Set(pages.map((p) => p.docId))].filter((id) => docs[id] && !docs[id].generated).map((id) => docs[id])}
          onApply={(p, c) => {
            setProtect(p);
            setClean(c);
          }}
          onClose={() => setProtectOpen(false)}
        />
      )}
      {pageDialog === 'mark' && (
        <MarkDialog
          scope={scope}
          target={target}
          onAdd={(mark) => dispatch({ type: 'mark', ids: target.map((p) => p.id), mark })}
          onRemove={(markId) => dispatch({ type: 'unmark', ids: target.map((p) => p.id), markId })}
          onClose={() => setPageDialog(null)}
        />
      )}
      {pageDialog === 'crop' && (
        <CropDialog
          scope={scope}
          hasCrop={target.some((p) => p.crop)}
          onCrop={(m) => {
            const crops: Record<string, [number, number, number, number] | null> = {};
            for (const p of target) {
              const size = sizeOf(p);
              if (!size) continue;
              crops[p.id] = cropFromMargins(size, p.rotation, { top: m.top * MM, right: m.right * MM, bottom: m.bottom * MM, left: m.left * MM });
            }
            dispatch({ type: 'crop', crops });
          }}
          onReset={() => dispatch({ type: 'crop', crops: Object.fromEntries(target.map((p) => [p.id, null])) })}
          onClose={() => setPageDialog(null)}
        />
      )}
      {pageDialog === 'resize' && (
        <ResizeDialog
          scope={scope}
          hasSize={target.some((p) => p.size)}
          onResize={(paper, orientation) => {
            const sizes: Record<string, [number, number] | null> = {};
            for (const p of target) {
              const own = sizeOf(p);
              if (!own) continue;
              const shown = p.rotation % 180 === 0 ? own : { width: own.height, height: own.width };
              const [w, h] = paperSize(paper, orientation, shown);
              // Stored in the page's own orientation; the extra turn is applied on top.
              sizes[p.id] = p.rotation % 180 === 0 ? [w, h] : [h, w];
            }
            dispatch({ type: 'resize', sizes });
          }}
          onReset={() => dispatch({ type: 'resize', sizes: Object.fromEntries(target.map((p) => [p.id, null])) })}
          onClose={() => setPageDialog(null)}
        />
      )}

      {splitOpen && (
        <SplitDialog
          total={pages.length}
          selectedCount={selected.size}
          onSplit={split}
          onClose={() => setSplitOpen(false)}
        />
      )}
    </>
  );
}
