import { useCallback, useReducer, useRef, useState } from 'react';
import { AppError } from './core/errors';
import { outputBase, partName } from './core/ranges';
import { toMegabytes } from './core/limits';
import { editorReducer, initialState, selectedInOrder } from './state/editor';
import { zip } from './pdf/build';
import { buildPdf, CancelledError, type JobOptions } from './pdf/engine';
import { closePdf, openPdf, type OpenedPdf, type SourceDoc } from './pdf/view';
import { useI18n } from './i18n/context';
import { download } from './ui/download';
import GoatMark from './ui/GoatMark';
import { useFileDrop, useShortcuts } from './ui/useWindowEvents';
import DropZone from './features/open/DropZone';
import PasswordDialog from './features/open/PasswordDialog';
import PageGrid from './features/organize/PageGrid';
import Preview from './features/organize/Preview';
import Toolbar from './features/organize/Toolbar';
import { useThumbnails } from './features/organize/useThumbnails';
import SplitDialog, { type SplitPlan } from './features/merge-split/SplitDialog';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export default function App() {
  const { lang, setLang, t, tn, errorText } = useI18n();
  const [state, dispatch] = useReducer(editorReducer, initialState);
  // Opened source files, by id. They stay in memory only; nothing is uploaded.
  const [docs, setDocs] = useState<Record<string, SourceDoc>>({});
  const { thumbs, failed: failedThumbs, request: requestThumb, clear: clearThumbs } = useThumbnails(docs);

  const [busy, setBusy] = useState('');
  // Set while a job in the engine can be cancelled, with how far it is (0 to 1).
  const [progress, setProgress] = useState<number | null>(null);
  const job = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [passwordAsk, setPasswordAsk] = useState<{ name: string; wrong: boolean; answer: (p: string | null) => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { pages, selected } = state;
  // Counted from the pages, so a file whose pages were all removed or undone no longer counts.
  const docCount = new Set(pages.map((p) => p.docId)).size;
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
      const files = [...list].filter(isPdf);
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
          const result = await openWithPassword(file);
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
      dispatch({ type: 'add', pages: opened.flatMap((o) => o.pages) });
    },
    [t, errorText, openWithPassword],
  );

  function closeAll() {
    if (pages.length && !confirm(t('confirm.closeAll'))) return;
    Object.values(docs).forEach(closePdf);
    setDocs({});
    clearThumbs();
    dispatch({ type: 'reset' });
    setError('');
    setNotice('');
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

  const base = () => outputBase(pages.map((p) => docs[p.docId].name), t('file.merged'));

  const save = () =>
    run(t('busy.saving'), async (job) => {
      download(await buildPdf(pages, docs, job), `${base()}.pdf`);
    });

  const split = (plan: SplitPlan) =>
    run(t('busy.splitting'), async (job) => {
      if (plan === 'selection') {
        const chosen = pages.filter((p) => selected.has(p.id));
        download(await buildPdf(chosen, docs, job), `${base()}-${t('file.selection')}.pdf`);
        return;
      }
      const files = [];
      for (const [i, group] of plan.entries()) {
        files.push({
          name: partName(base(), i, group, t('file.pageAbbr')),
          bytes: await buildPdf(group.map((k) => pages[k]), docs, {
            signal: job.signal,
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
    } else if (mod && key === 'a' && pages.length) {
      e.preventDefault();
      dispatch({ type: 'selectAll' });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      e.preventDefault();
      dispatch({ type: 'remove', ids: [...selected] });
    } else if (e.key === 'Escape') {
      dispatch({ type: 'clearSelection' });
    }
  }, !previewId && !splitOpen && !passwordAsk);

  const previewPage = previewIndex >= 0 ? pages[previewIndex] : null;
  const allSelected = pages.length > 0 && selected.size === pages.length;

  const editing = pages.length > 0;
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
        accept="application/pdf,.pdf"
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

            <Toolbar
              pageCount={pages.length}
              docCount={docCount}
              selectedCount={selected.size}
              canUndo={state.changes.length > 0}
              canRedo={state.undone.length > 0}
              busy={!!busy}
              onAdd={openFilePicker}
              onUndo={() => dispatch({ type: 'undo' })}
              onRedo={() => dispatch({ type: 'redo' })}
              onCloseAll={closeAll}
              onToggleAll={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
              onRotate={(delta) => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta })}
              onDelete={() => dispatch({ type: 'remove', ids: [...selected] })}
              onReverse={() => dispatch({ type: 'reverse' })}
              onSplit={() => setSplitOpen(true)}
              onSave={save}
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
          {pages.length > 0 && (
            <p className="status" aria-live="polite">
              {tn('status.pages', pages.length)}
              {docCount > 1 && t('status.fromFiles', { count: docCount })}
              {selected.size > 0 && t('status.selected', { count: selected.size })}
              <span className="tip">{t('status.tip')}</span>
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
            {pages.length > 0 ? (
              <PageGrid
                state={state}
                docs={docs}
                thumbs={thumbs}
                failedThumbs={failedThumbs}
                onNeedThumb={requestThumb}
                dispatch={dispatch}
                onPreview={setPreviewId}
              />
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

      {previewPage && (
        <Preview
          doc={docs[previewPage.docId]}
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
