import { useEffect, useRef, useState } from 'react';
import { renderPage, type SourceDoc } from '../lib/pdf';
import type { PageRef } from '../lib/types';

interface Props {
  doc: SourceDoc;
  page: PageRef;
  number: number;
  total: number;
  onClose: () => void;
  onStep: (step: number) => void;
}

export default function Preview({ doc, page, number, total, onClose, onStep }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Remember which page/rotation the image belongs to, so a stale one is never shown.
  const key = `${page.id}:${page.rotation}`;
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null);
  const url = rendered?.key === key ? rendered.url : null;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    const width = Math.min(window.innerWidth - 64, 1000);
    renderPage(doc, page.srcIndex, { width, rotation: page.rotation }).then((u) => {
      made = u;
      if (cancelled) URL.revokeObjectURL(u);
      else setRendered({ key, url: u });
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [doc, page.srcIndex, page.rotation, key]);

  return (
    <dialog
      ref={dialog}
      className="preview"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onStep(-1);
        if (e.key === 'ArrowRight') onStep(1);
      }}
      aria-label={`Vorschau Seite ${number}`}
    >
      <header>
        <button onClick={() => onStep(-1)} disabled={number <= 1} aria-label="Vorherige Seite">←</button>
        <span>Seite {number} von {total}</span>
        <button onClick={() => onStep(1)} disabled={number >= total} aria-label="Nächste Seite">→</button>
        <button className="close" onClick={() => dialog.current?.close()} aria-label="Schließen">✕</button>
      </header>
      <div className="preview-body">
        {url ? <img src={url} alt={`Seite ${number}`} /> : <p>Wird gerendert …</p>}
      </div>
    </dialog>
  );
}
