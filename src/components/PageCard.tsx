import type { DragEvent, MouseEvent } from 'react';
import type { PageRef } from '../lib/types';

interface Props {
  page: PageRef;
  number: number;
  thumb?: string;
  docName: string;
  showDoc: boolean;
  selected: boolean;
  dragging: boolean;
  dropSide: 'before' | 'after' | null;
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
  const { page, number, thumb, docName, showDoc, selected, dragging, dropSide } = props;
  const classes = ['card', selected && 'selected', dragging && 'dragging', dropSide && `drop-${dropSide}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div
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
        aria-label={`Seite ${number} ${selected ? 'abwählen' : 'auswählen'}`}
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
        <button title="Nach links" aria-label="Nach links verschieben" onClick={() => props.onMove(-1)}>←</button>
        <button title="Drehen" aria-label="Im Uhrzeigersinn drehen" onClick={props.onRotate}>↻</button>
        <button title="Vorschau" aria-label="Große Vorschau" onClick={props.onPreview}>⤢</button>
        <button title="Löschen" aria-label="Seite löschen" className="danger" onClick={props.onDelete}>✕</button>
        <button title="Nach rechts" aria-label="Nach rechts verschieben" onClick={() => props.onMove(1)}>→</button>
      </div>
    </div>
  );
}
