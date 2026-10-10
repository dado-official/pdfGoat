import { useRef, type DragEvent, type MouseEvent } from 'react';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { useWhenVisible } from '../../ui/useWhenVisible';

interface Props {
  page: PageRef;
  number: number;
  thumb?: string;
  docName: string;
  showDoc: boolean;
  selected: boolean;
  dragging: boolean;
  dropSide: 'before' | 'after' | null;
  /** Called when the card is about to be seen and has no preview image yet. */
  onNeedThumb: () => void;
  onSelect: (e: MouseEvent) => void;
  onRotate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onMove: (step: number) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
}

export default function PageCard(props: Props) {
  const { t } = useI18n();
  const { page, number, thumb, docName, showDoc, selected, dragging, dropSide } = props;
  const root = useRef<HTMLDivElement>(null);
  useWhenVisible(root, !thumb, props.onNeedThumb);
  const classes = ['card', selected && 'selected', dragging && 'dragging', dropSide && `drop-${dropSide}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={root}
      className={classes}
      draggable
      role="listitem"
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >
      <button
        className="card-thumb"
        aria-pressed={selected}
        aria-label={t(selected ? 'card.deselect' : 'card.select', { number })}
        onClick={props.onSelect}
        onDoubleClick={props.onPreview}
      >
        {thumb ? (
          <img src={thumb} alt="" style={{ transform: `rotate(${page.rotation}deg)` }} draggable={false} />
        ) : (
          <span className="spinner" aria-hidden="true" />
        )}
        {selected && (
          <span className="check" aria-hidden="true">
            ✓
          </span>
        )}
      </button>

      <div className="card-meta">
        <span className="num">{number}</span>
        {showDoc && (
          <span className="doc" title={docName}>
            {docName}
          </span>
        )}
      </div>

      <div className="card-actions">
        <button title={t('card.moveLeft.title')} aria-label={t('card.moveLeft')} onClick={() => props.onMove(-1)}>←</button>
        <button title={t('card.rotate.title')} aria-label={t('card.rotate')} onClick={props.onRotate}>↻</button>
        <button title={t('card.preview.title')} aria-label={t('card.preview')} onClick={props.onPreview}>⤢</button>
        <button title={t('card.delete.title')} aria-label={t('card.delete')} className="danger" onClick={props.onDelete}>✕</button>
        <button title={t('card.moveRight.title')} aria-label={t('card.moveRight')} onClick={() => props.onMove(1)}>→</button>
      </div>
    </div>
  );
}
