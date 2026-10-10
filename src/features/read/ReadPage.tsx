import { useEffect, useRef, useState } from 'react';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { renderPage, type SourceDoc } from '../../pdf/view';
import { useNearViewport } from '../../ui/useNearViewport';

interface Props {
  page: PageRef;
  doc: SourceDoc;
  number: number;
  /** Size on screen in CSS pixels. */
  width: number;
  height: number;
  /** The page is damaged and cannot be drawn. */
  damaged: boolean;
}

// Images wider than this are stretched: very large zoom levels would need too much memory.
const MAX_RENDER_WIDTH = 2400;

/** One page of the reading view. It has its final size from the start and draws itself while it is near the screen. */
export default function ReadPage({ page, doc, number, width, height, damaged }: Props) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const near = useNearViewport(root);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<string | null>(null);
  const renderWidth = Math.min(width, MAX_RENDER_WIDTH);

  const show = (url: string | null) => {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = url;
    setImage(url);
  };

  useEffect(() => {
    if (damaged) return;
    // A page far away gives its image back; it is drawn again when it comes close.
    if (!near) return show(null);
    let cancelled = false;
    // The delay saves drawing at every step while the zoom is being changed.
    const timer = setTimeout(() => {
      renderPage(doc, page.srcIndex, { width: renderWidth, rotation: page.rotation })
        .then((url) => {
          if (cancelled) URL.revokeObjectURL(url);
          else show(url);
        })
        .catch((err) => {
          console.warn('Page render failed', err);
          if (!cancelled) setFailed(true);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `show` only touches refs and state setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [near, damaged, doc, page.srcIndex, page.rotation, renderWidth]);

  useEffect(() => () => {
    if (current.current) URL.revokeObjectURL(current.current);
  }, []);

  const problem = damaged || failed;
  return (
    <div
      ref={root}
      className="read-page"
      style={{ width, height }}
      role="img"
      aria-label={t('read.pageLabel', { number })}
      data-page={number}
    >
      {image && !problem && <img src={image} alt="" draggable={false} />}
      {problem && (
        <span className="thumb-failed">
          <span aria-hidden="true">⚠</span>
          {t('card.previewFailed')}
        </span>
      )}
    </div>
  );
}
