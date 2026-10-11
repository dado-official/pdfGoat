import { useCallback, useEffect, useReducer, useState } from 'react';
import { bookmarksOf, canUndo, initialState, selectedInOrder, type EditorAction } from './state/editor';
import {
  activeTab,
  clonePages,
  docsInUse,
  emptyWorkspace,
  workspaceReducer,
  type View,
} from './state/workspace';
import { buildPdf } from './pdf/engine';
import { closePdf, getOutline, openPdf, renderPageBytes, type SourceDoc } from './pdf/view';
import { useI18n } from './i18n/context';
import Icon from './ui/Icon';
import { useTheme } from './ui/theme';
import { download } from './ui/download';
import GoatMark from './ui/GoatMark';
import { useShortcuts } from './ui/useWindowEvents';
import DropZone from './features/open/DropZone';
import PasswordDialog from './features/open/PasswordDialog';
import Reader from './features/read/Reader';
import LegalPage, { LegalLinks } from './legal/LegalPage';
import { useLegalRoute } from './legal/useRoute';
import { registerOffline } from './pwa';
import PageDialog from './features/edit/PageDialog';
import BookmarksDialog from './features/bookmarks/BookmarksDialog';
import { fromPlaced, mergeBookmarks, remapBookmarks, type Bookmark } from './core/bookmarks';
import { placeOutline } from './core/outline';
import BatchDialog from './features/batch/BatchDialog';
import OcrDialog from './features/ocr/OcrDialog';
import { ocrWidth, recognizePages, type OcrLang } from './pdf/ocr';
import CompareDialog from './features/compare/CompareDialog';
import CompressDialog from './features/export/CompressDialog';
import { LEVELS, type CompressLevel } from './core/compress';
import ExportDialog from './features/export/ExportDialog';
import ProtectDialog from './features/protect/ProtectDialog';
import { isCleaning, isProtected, noCleaning, type Cleaning, type Protection } from './core/protect';
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
import PrintSheet from './features/print/PrintSheet';
import SplitDialog from './features/merge-split/SplitDialog';
import MergeDialog from './features/merge-split/MergeDialog';
import CommandPalette from './features/command/CommandPalette';
import type { Command } from './features/command/commands';
import TabBar from './features/workspace/TabBar';
import { useJob } from './app/useJob';
import { useOpenFiles } from './app/useOpenFiles';
import { usePrint } from './app/usePrint';
import { useSave } from './app/useSave';

type Dialog = 'split' | 'merge' | 'protect' | 'export' | 'compress' | 'compare' | 'ocr' | 'batch' | 'bookmarks' | 'overwrite' | 'mark' | 'crop' | 'resize' | null;

export default function App() {
  const { lang, setLang, t, tn, errorText } = useI18n();
  const [theme, toggleTheme] = useTheme();
  const [ws, dispatchWs] = useReducer(workspaceReducer, emptyWorkspace);
  const tab = activeTab(ws);
  const state = tab?.editor ?? initialState;
  const view: View = tab?.view ?? 'pages';
  const dispatch = useCallback((action: EditorAction) => dispatchWs({ type: 'editor', action }), []);
  // Opened source files, by id. They stay in memory only; nothing is uploaded.
  const [docs, setDocs] = useState<Record<string, SourceDoc>>({});
  const { thumbs, failed: failedThumbs, request: requestThumb, clear: clearThumbs, release: releaseThumbs } = useThumbnails(docs);

  const { busy, setBusy, progress, error, setError, run, cancel } = useJob(errorText);
  const [notice, setNotice] = useState('');
  // Set when a new version of the app is ready to be loaded.
  const [updateApply, setUpdateApply] = useState<(() => Promise<void>) | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Protection and cleaning apply to everything that is saved, in every tab.
  const [protect, setProtect] = useState<Protection | null>(null);
  const [clean, setClean] = useState<Cleaning>(noCleaning);
  const protectActive = isProtected(protect) || isCleaning(clean);
  // Today's date for header and footer texts that contain {date}.
  const [today] = useState(() => new Date());
  const date = today.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB');
  // "Flatten form" applies to everything that is saved, in every tab.
  const [flatten, setFlatten] = useState(false);
  // The dialog that is open, if any; only one at a time.
  const [dialog, setDialog] = useState<Dialog>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const { addFiles, openFilePicker, fileInput, passwordAsk, fileDragging, newTabId } = useOpenFiles({ dispatchWs, setDocs, setBusy, setError, setNotice });
  const bookmarks = bookmarksOf(state);
  const { printPages, print, freePrint } = usePrint({ run, pages, docs, date, setNotice });
  const { save, overwrite, overwriteTarget, split, exportPages, optionsFor, base } = useSave({
    run, setError, setNotice, pages, selected, target, docs, sizeOf, bookmarks, flatten, date, protect, clean,
  });

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
  useEffect(() => {
    const apply = registerOffline(() => setUpdateApply(() => apply));
  }, []);

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

  async function mergeTabs(ids: string[]) {
    const id = newTabId();
    let n = 0;
    const sources = ids.flatMap((from) => ws.tabs.filter((x) => x.id === from));
    // The copies of the pages, and which copy stands for which page.
    const groups = sources.map((src) => ({ src, copies: clonePages(src.editor.pages, () => `${id}-p${n++}`) }));
    dispatchWs({ type: 'open', id, title: t('tab.merged'), pages: groups.flatMap((g) => g.copies) });

    // Bookmarks that were edited in a tab are carried over. Without any, the bookmarks of the files
    // are taken over by saving, as before.
    if (!groups.some((g) => bookmarksOf(g.src.editor))) return;
    const newId = () => crypto.randomUUID();
    const merged = await Promise.all(
      groups.map(async ({ src, copies }) => {
        const idMap = new Map(src.editor.pages.map((p, i) => [p.id, copies[i].id]));
        const custom = bookmarksOf(src.editor);
        let items: Bookmark[];
        if (custom) items = remapBookmarks(custom, idMap, newId);
        else {
          // This tab kept the bookmarks of its files: read them as they stand on its pages.
          const docIds = [...new Set(src.editor.pages.map((p) => p.docId))].filter((d) => docs[d] && !docs[d].generated);
          const files = await Promise.all(docIds.map(async (d) => ({ docId: d, name: docs[d].name, nodes: await getOutline(docs[d]).catch(() => []) })));
          const positions = new Map<string, number>();
          src.editor.pages.forEach((p, i) => positions.has(`${p.docId}:${p.srcIndex}`) || positions.set(`${p.docId}:${p.srcIndex}`, i));
          items = fromPlaced(placeOutline(files, positions), copies, newId);
        }
        return { title: src.title, items, firstPageId: copies[0]?.id ?? null };
      }),
    );
    // Aimed at the new tab by its id: the user may have switched to another one meanwhile.
    dispatchWs({ type: 'editor', id, action: { type: 'outline', items: mergeBookmarks(merged, newId) } });
  }

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
  }, !previewId && dialog !== 'split' && dialog !== 'merge' && !passwordAsk && !paletteOpen);

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
    { id: 'mark', label: t('cmd.mark'), keywords: t('cmd.mark.kw'), enabled: hasPages, run: () => setDialog('mark') },
    { id: 'crop', label: t('cmd.crop'), keywords: t('cmd.crop.kw'), enabled: hasPages, run: () => setDialog('crop') },
    { id: 'resize', label: t('cmd.resize'), keywords: t('cmd.resize.kw'), enabled: hasPages, run: () => setDialog('resize') },
    { id: 'protect', label: t('cmd.protect'), keywords: t('cmd.protect.kw'), enabled: !!tab, run: () => setDialog('protect') },
    { id: 'bookmarks', label: t('cmd.bookmarks'), keywords: t('cmd.bookmarks.kw'), enabled: hasPages, run: () => setDialog('bookmarks') },
    { id: 'batch', label: t('cmd.batch'), keywords: t('cmd.batch.kw'), enabled: true, run: () => setDialog('batch') },
    { id: 'ocr', label: t('cmd.ocr'), keywords: t('cmd.ocr.kw'), enabled: hasPages, run: () => setDialog('ocr') },
    { id: 'compare', label: t('cmd.compare'), keywords: t('cmd.compare.kw'), enabled: ws.tabs.length > 1, run: () => setDialog('compare') },
    { id: 'compress', label: t('cmd.compress'), keywords: t('cmd.compress.kw'), enabled: hasPages, run: () => setDialog('compress') },
    { id: 'export', label: t('cmd.export'), keywords: t('cmd.export.kw'), enabled: hasPages, run: () => setDialog('export') },
    { id: 'selectAll', label: t('cmd.selectAll'), enabled: hasPages && selected.size < pages.length, run: () => dispatch({ type: 'selectAll' }) },
    { id: 'selectNone', label: t('cmd.selectNone'), enabled: selected.size > 0, run: () => dispatch({ type: 'clearSelection' }) },
    { id: 'rotateRight', label: t('cmd.rotateRight'), keywords: t('cmd.rotate.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta: 90 }) },
    { id: 'rotateLeft', label: t('cmd.rotateLeft'), keywords: t('cmd.rotate.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta: -90 }) },
    { id: 'delete', label: t('cmd.delete'), keywords: t('cmd.delete.kw'), enabled: selected.size > 0, run: () => dispatch({ type: 'remove', ids: [...selected] }) },
    { id: 'reverse', label: t('cmd.reverse'), enabled: pages.length > 1, run: () => dispatch({ type: 'reverse' }) },
    { id: 'split', label: t('cmd.split'), keywords: t('cmd.split.kw'), enabled: hasPages, run: () => setDialog('split') },
    { id: 'merge', label: t('cmd.merge'), keywords: t('cmd.merge.kw'), enabled: ws.tabs.length > 1, run: () => setDialog('merge') },
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
  const legalRoute = useLegalRoute();
  // A legal page replaces the app for as long as it is open; everything the app holds stays as it is.
  if (legalRoute) return <LegalPage route={legalRoute} />;

  const meta = (
    <>
      <p className="privacy" title={t('privacy.title')}>{t('privacy.badge')}</p>
      <span className="meta-controls">
      <button
        className="lang"
        title={t('lang.switch')}
        lang={lang === 'de' ? 'en' : 'de'}
        onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
      >
        {t('lang.other')}
      </button>
      <button
        className="theme-toggle"
        title={t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
        aria-label={t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
        onClick={toggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      </span>
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
              onMerge={() => setDialog('merge')}
              onAdd={openFilePicker}
              onUndo={() => dispatch({ type: 'undo' })}
              onRedo={() => dispatch({ type: 'redo' })}
              onCloseTab={() => tab && closeTab(tab.id)}
              onToggleAll={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
              onRotate={(delta) => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta })}
              onDelete={() => dispatch({ type: 'remove', ids: [...selected] })}
              onReverse={() => dispatch({ type: 'reverse' })}
              onSplit={() => setDialog('split')}
              overwriteName={overwriteTarget?.name}
              onOverwrite={() => setDialog('overwrite')}
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
          {updateApply && (
            <div className="notice" role="status">
              <span>
                {t('update.ready')}
                {ws.tabs.some((x) => x.editor.changes.length > x.editor.locked) && ` ${t('update.unsaved')}`}
              </span>
              <span className="notice-actions">
                <button onClick={() => void updateApply()}>{t('update.now')}</button>
                <button onClick={() => setUpdateApply(null)} aria-label={t('alert.close')}>✕</button>
              </span>
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
                onProtect={() => setDialog('protect')}
                protectActive={protectActive}
                bookmarks={bookmarks}
                onDropFields={(id, indices) => dispatch({ type: 'dropFields', id, indices })}
              />
            ) : tab ? (
              <>
              <PageTools
                disabled={!hasPages}
                onBlank={insertBlank}
                onMark={() => setDialog('mark')}
                onCrop={() => setDialog('crop')}
                onResize={() => setDialog('resize')}
                onProtect={() => setDialog('protect')}
                protectActive={protectActive}
                onExport={() => setDialog('export')}
                onCompress={() => setDialog('compress')}
                onOcr={() => setDialog('ocr')}
                onBatch={() => setDialog('batch')}
                onBookmarks={() => setDialog('bookmarks')}
                canCompare={ws.tabs.length > 1}
                onCompare={() => setDialog('compare')}
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
            <LegalLinks />
          </footer>
        </div>
      </div>

      {fileDragging && <div className="file-overlay" aria-hidden="true">{t('drop.overlay')}</div>}
      {busy && (
        <div className="busy" role="status">
          {busy}
          {progress !== null && progress > 0 && ` ${Math.round(progress * 100)} %`}
          {progress !== null && (
            <button onClick={() => cancel()}>{t('busy.cancel')}</button>
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

      {dialog === 'merge' && (
        <MergeDialog tabs={ws.tabs} onMerge={mergeTabs} onClose={() => setDialog(null)} />
      )}

      {dialog === 'overwrite' && overwriteTarget && (
        <PageDialog
          title={t('overwrite.title')}
          scope={t('overwrite.text', { name: overwriteTarget.name })}
          submitLabel={t('overwrite.apply')}
          onSubmit={() => {
            setDialog(null);
            void overwrite();
          }}
          onClose={() => setDialog(null)}
        >
          <p className="dialog-hint">{t('overwrite.hint')}</p>
        </PageDialog>
      )}
      {dialog === 'bookmarks' && (
        <BookmarksDialog pages={pages} docs={docs} current={bookmarks} onApply={(items) => dispatch({ type: 'outline', items })} onClose={() => setDialog(null)} />
      )}
      {dialog === 'batch' && <BatchDialog date={date} onClose={() => setDialog(null)} />}
      {dialog === 'ocr' && (
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
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'compare' && <CompareDialog tabs={ws.tabs} docs={docs} onClose={() => setDialog(null)} />}
      {dialog === 'compress' && (
        <CompressDialog
          scope={scope}
          onCompress={async (level: CompressLevel) => {
            const options = optionsFor(target);
            const before = await buildPdf(target, docs, options);
            const bytes = await buildPdf(target, docs, { ...options, compress: LEVELS[level] });
            return { before: before.length, after: bytes.length, bytes };
          }}
          onSave={(bytes) => download(bytes, `${base()}-${t('file.compressed')}.pdf`)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && <ExportDialog scope={scope} onExport={exportPages} onClose={() => setDialog(null)} />}
      {dialog === 'protect' && (
        <ProtectDialog
          protect={protect}
          clean={clean}
          docs={[...new Set(pages.map((p) => p.docId))].filter((id) => docs[id] && !docs[id].generated).map((id) => docs[id])}
          onApply={(p, c) => {
            setProtect(p);
            setClean(c);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'mark' && (
        <MarkDialog
          scope={scope}
          target={target}
          onAdd={(mark) => dispatch({ type: 'mark', ids: target.map((p) => p.id), mark })}
          onRemove={(markId) => dispatch({ type: 'unmark', ids: target.map((p) => p.id), markId })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'crop' && (
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
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'resize' && (
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
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'split' && (
        <SplitDialog
          total={pages.length}
          selectedCount={selected.size}
          onSplit={split}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
