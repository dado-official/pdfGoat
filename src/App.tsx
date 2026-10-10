import { useCallback, useReducer, useRef, useState } from 'react';
import { editorReducer, initialState, selectedInOrder } from './lib/editor';
import { closePdf, download, openPdf, type SourceDoc } from './lib/pdf';
import { buildPdf, zip } from './lib/build';
import { outputBase, partName } from './lib/ranges';
import { useThumbnails } from './hooks/useThumbnails';
import { useFileDrop, useShortcuts } from './hooks/useWindowEvents';
import Toolbar from './components/Toolbar';
import PageGrid from './components/PageGrid';
import DropZone from './components/DropZone';
import Preview from './components/Preview';
import SplitDialog, { type SplitPlan } from './components/SplitDialog';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  // Opened source files, by id. They stay in memory only; nothing is uploaded.
  const [docs, setDocs] = useState<Record<string, SourceDoc>>({});
  const { thumbs, clear: clearThumbs } = useThumbnails(docs, state.pages);

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { pages, selected } = state;
  const docCount = Object.keys(docs).length;
  const previewIndex = pages.findIndex((p) => p.id === previewId);
  const openFilePicker = () => fileInput.current?.click();

  const addFiles = useCallback(async (list: FileList | File[]) => {
    setError('');
    const files = [...list].filter(isPdf);
    if (!files.length) {
      setError('Bitte PDF-Dateien auswählen.');
      return;
    }
    const opened: Awaited<ReturnType<typeof openPdf>>[] = [];
    for (const file of files) {
      setBusy(`Öffne ${file.name} …`);
      try {
        opened.push(await openPdf(file));
      } catch (err) {
        setError((err as Error).message);
      }
    }
    setBusy('');
    if (!opened.length) return;
    setDocs((d) => ({ ...d, ...Object.fromEntries(opened.map((o) => [o.doc.id, o.doc])) }));
    dispatch({ type: 'add', pages: opened.flatMap((o) => o.pages) });
  }, []);

  function closeAll() {
    if (pages.length && !confirm('Alle Seiten schließen? Nicht gespeicherte Änderungen gehen verloren.')) return;
    Object.values(docs).forEach(closePdf);
    setDocs({});
    clearThumbs();
    dispatch({ type: 'reset' });
    setError('');
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await task();
    } catch (err) {
      console.error(err);
      setError(`Das hat nicht geklappt: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  const base = () => outputBase(pages.map((p) => docs[p.docId].name));

  const save = () =>
    run('Erstelle PDF …', async () => {
      download(await buildPdf(pages, docs), `${base()}.pdf`);
    });

  const split = (plan: SplitPlan) =>
    run('Teile auf …', async () => {
      if (plan === 'selection') {
        const chosen = pages.filter((p) => selected.has(p.id));
        download(await buildPdf(chosen, docs), `${base()}-auswahl.pdf`);
        return;
      }
      const files = [];
      for (const [i, group] of plan.entries()) {
        files.push({ name: partName(base(), i, group), bytes: await buildPdf(group.map((k) => pages[k]), docs) });
      }
      if (files.length === 1) download(files[0].bytes, files[0].name);
      else download(await zip(files), `${base()}-aufgeteilt.zip`, 'application/zip');
    });

  const fileDragging = useFileDrop(addFiles);

  useShortcuts((e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
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
  }, !previewId && !splitOpen);

  const previewPage = previewIndex >= 0 ? pages[previewIndex] : null;
  const allSelected = pages.length > 0 && selected.size === pages.length;

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

      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">🐐</span>
          <div>
            <h1>PDFgoat</h1>
            <p>Eats your PDFs. Never your data.</p>
          </div>
        </div>
        <span className="privacy" title="Alle Dateien werden nur in deinem Browser verarbeitet.">
          🔒 Nichts wird hochgeladen
        </span>
      </header>

      {pages.length > 0 && (
        <>
          <Toolbar
            pageCount={pages.length}
            docCount={docCount}
            selectedCount={selected.size}
            canUndo={state.history.length > 0}
            busy={!!busy}
            onAdd={openFilePicker}
            onUndo={() => dispatch({ type: 'undo' })}
            onCloseAll={closeAll}
            onToggleAll={() => dispatch({ type: allSelected ? 'clearSelection' : 'selectAll' })}
            onRotate={(delta) => dispatch({ type: 'rotate', ids: selectedInOrder(state), delta })}
            onDelete={() => dispatch({ type: 'remove', ids: [...selected] })}
            onReverse={() => dispatch({ type: 'reverse' })}
            onSplit={() => setSplitOpen(true)}
            onSave={save}
          />
          <p className="status" aria-live="polite">
            {pages.length} Seite{pages.length === 1 ? '' : 'n'}
            {docCount > 1 ? ` aus ${docCount} Dateien` : ''}
            {selected.size > 0 && ` · ${selected.size} ausgewählt`}
            <span className="tip">
              Klicken zum Auswählen, Shift+Klick für Bereiche, ziehen zum Sortieren, Doppelklick für Vorschau.
            </span>
          </p>
        </>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Meldung schließen">✕</button>
        </div>
      )}

      <main>
        {pages.length > 0 ? (
          <PageGrid state={state} docs={docs} thumbs={thumbs} dispatch={dispatch} onPreview={setPreviewId} />
        ) : (
          <DropZone onOpen={openFilePicker} />
        )}
      </main>

      {fileDragging && <div className="file-overlay" aria-hidden="true">PDF loslassen zum Hinzufügen</div>}
      {busy && <div className="busy" role="status">{busy}</div>}

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

      {splitOpen && (
        <SplitDialog
          total={pages.length}
          selectedCount={selected.size}
          onSplit={split}
          onClose={() => setSplitOpen(false)}
        />
      )}

      <footer>
        PDFgoat ist kostenlos und läuft komplett in deinem Browser. Verwendet{' '}
        <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener">PDF.js</a> (Apache 2.0) und{' '}
        <a href="https://pdf-lib.js.org/" target="_blank" rel="noopener">pdf-lib</a> (MIT).
      </footer>
    </>
  );
}
