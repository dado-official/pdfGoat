import { useEffect, useRef, useState } from 'react';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { renderFinal } from '../../pdf/render';
import type { SourceDoc } from '../../pdf/view';

interface Props {
  docs: Record<string, SourceDoc>;
  date: string;
  page: PageRef;
  number: number;
  total: number;
  onClose: () => void;
  onStep: (step: number) => void;
}

export default function Preview({ docs, date, page, number, total, onClose, onStep }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  // Remember which page/rotation the image belongs to, so a stale one is never shown.
  const key = `${page.id}:${page.rotation}`;
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null);
  const url = rendered?.key === key ? rendered.url : null;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    const width = Math.min(window.innerWidth - 64, 1000);
    renderFinal(page, docs, { width, number, total, date })
      .then((u) => {
        made = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setRendered({ key, url: u });
      })
      .catch((err) => {
        console.warn('Preview failed', err);
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
    // The page object stands for everything that is drawn: any change to the page replaces it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, page, number, total, date, key]);

  return (
    <dialog
      ref={dialog}
      className="preview"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onStep(-1);
        if (e.key === 'ArrowRight') onStep(1);
      }}
      aria-label={t('preview.label', { number })}
    >
      <header>
        <button onClick={() => onStep(-1)} disabled={number <= 1} aria-label={t('preview.prev')}>←</button>
        <span>{t('preview.position', { number, total })}</span>
        <button onClick={() => onStep(1)} disabled={number >= total} aria-label={t('preview.next')}>→</button>
        <button className="close" onClick={() => dialog.current?.close()} aria-label={t('preview.close')}>✕</button>
      </header>
      <div className="preview-body">
        {url ? <img src={url} alt={t('preview.alt', { number })} /> : <p>{t(failedKey === key ? 'preview.failed' : 'preview.rendering')}</p>}
      </div>
    </dialog>
  );
}
