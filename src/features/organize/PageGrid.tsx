import { useState, type DragEvent } from 'react';
import type { PageRef } from '../../core/types';
import type { SourceDoc } from '../../pdf/lazy';
import type { EditorAction, EditorState } from '../../state/editor';
import { thumbKey } from './useThumbnails';
import PageCard from './PageCard';

interface Props {
  state: EditorState;
  docs: Record<string, SourceDoc>;
  thumbs: Record<string, string>;
  failedThumbs: ReadonlySet<string>;
  onNeedThumb: (page: PageRef) => void;
  dispatch: (action: EditorAction) => void;
  onPreview: (id: string) => void;
}

type DropTarget = { id: string; side: 'before' | 'after' } | null;

/** The page cards, including drag & drop reordering (dragging a selected page moves the whole selection). */
export default function PageGrid({ state, docs, thumbs, failedThumbs, onNeedThumb, dispatch, onPreview }: Props) {
  const { pages, selected } = state;
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const showDoc = new Set(pages.map((p) => p.docId)).size > 1;

  function dragStart(page: PageRef, e: DragEvent) {
    setDragIds(selected.has(page.id) ? pages.filter((p) => selected.has(p.id)).map((p) => p.id) : [page.id]);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', page.id);
  }

  function dragOver(page: PageRef, e: DragEvent) {
    if (!dragIds.length) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    const target: DropTarget = dragIds.includes(page.id) ? null : { id: page.id, side };
    if (target?.id !== dropTarget?.id || target?.side !== dropTarget?.side) setDropTarget(target);
  }

  function drop(e: DragEvent) {
    if (!dragIds.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropTarget) dispatch({ type: 'moveTo', ids: dragIds, targetId: dropTarget.id, side: dropTarget.side });
    dragEnd();
  }

  function dragEnd() {
    setDragIds([]);
    setDropTarget(null);
  }

  return (
    <div className="grid" role="list">
      {pages.map((page, i) => (
        <PageCard
          key={page.id}
          page={page}
          number={i + 1}
          thumb={thumbs[thumbKey(page)]}
          thumbFailed={failedThumbs.has(thumbKey(page))}
          docName={docs[page.docId]?.name ?? ''}
          showDoc={showDoc}
          selected={selected.has(page.id)}
          dragging={dragIds.includes(page.id)}
          dropSide={dropTarget?.id === page.id ? dropTarget.side : null}
          onNeedThumb={() => onNeedThumb(page)}
          onSelect={(e) => dispatch({ type: 'toggleSelect', id: page.id, range: e.shiftKey })}
          onRotate={() => dispatch({ type: 'rotate', ids: [page.id], delta: 90 })}
          onDelete={() => dispatch({ type: 'remove', ids: [page.id] })}
          onPreview={() => onPreview(page.id)}
          onMove={(step) => dispatch({ type: 'move', id: page.id, step })}
          onDragStart={(e) => dragStart(page, e)}
          onDragOver={(e) => dragOver(page, e)}
          onDrop={drop}
          onDragEnd={dragEnd}
        />
      ))}
    </div>
  );
}
