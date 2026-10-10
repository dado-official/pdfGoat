import { useEffect, useState } from 'react';
import {
  addBookmark,
  flatten,
  fromPlaced,
  indentBookmark,
  moveBookmark,
  outdentBookmark,
  removeBookmark,
  renameBookmark,
  retarget,
  type Bookmark,
} from '../../core/bookmarks';
import { placeOutline, type FileOutline } from '../../core/outline';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { getOutline, type SourceDoc } from '../../pdf/view';
import PageDialog from '../edit/PageDialog';

interface Props {
  pages: PageRef[];
  docs: Record<string, SourceDoc>;
  /** The bookmarks the user has already set up, or null when the files' own are in use. */
  current: Bookmark[] | null;
  /** The new bookmarks; null goes back to the ones the files have. */
  onApply: (items: Bookmark[] | null) => void;
  onClose: () => void;
}

/** Edit the bookmarks of the document: rename, move, nest, point them at other pages, add and delete. */
export default function BookmarksDialog({ pages, docs, current, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<Bookmark[] | null>(current);
  const [selected, setSelected] = useState<string | null>(null);

  // Without bookmarks of the user's own, the editing starts from what the files have.
  useEffect(() => {
    if (current) return;
    let cancelled = false;
    const ids = [...new Set(pages.map((p) => p.docId))].filter((id) => docs[id] && !docs[id].generated);
    Promise.all(ids.map(async (id) => ({ docId: id, name: docs[id].name, nodes: await getOutline(docs[id]).catch(() => []) } satisfies FileOutline))).then((files) => {
      if (cancelled) return;
      const positions = new Map<string, number>();
      pages.forEach((p, i) => {
        const key = `${p.docId}:${p.srcIndex}`;
        if (!positions.has(key)) positions.set(key, i);
      });
      setItems(fromPlaced(placeOutline(files, positions), pages, () => crypto.randomUUID()));
    });
    return () => {
      cancelled = true;
    };
  }, [current, pages, docs]);

  const rows = items ? flatten(items) : [];
  const chosen = rows.find((r) => r.bookmark.id === selected)?.bookmark ?? null;
  const edit = (f: (list: Bookmark[]) => Bookmark[]) => setItems((l) => (l ? f(l) : l));
  const pageOf = (b: Bookmark) => {
    const i = pages.findIndex((p) => p.id === b.pageId);
    return i < 0 ? null : i + 1;
  };

  return (
    <PageDialog
      wide
      title={t('bookmarks.title')}
      scope={t('bookmarks.scope')}
      submitLabel={t('bookmarks.apply')}
      submitDisabled={items === null}
      onSubmit={() => {
        onApply(items);
        onClose();
      }}
      onClose={onClose}
      extra={
        current && (
          <button
            type="button"
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            {t('bookmarks.reset')}
          </button>
        )
      }
    >
      {items === null ? (
        <p className="dialog-hint">{t('bookmarks.loading')}</p>
      ) : (
        <div className="bookmarks-edit">
          <div className="edit-actions">
            <button
              type="button"
              onClick={() => {
                const made: Bookmark = { id: crypto.randomUUID(), title: t('bookmarks.newTitle'), pageId: pages[0]?.id ?? null, children: [] };
                edit((l) => addBookmark(l, made));
                setSelected(made.id);
              }}
            >
              {t('bookmarks.add')}
            </button>
            <button type="button" disabled={!chosen} onClick={() => chosen && edit((l) => moveBookmark(l, chosen.id, -1))} aria-label={t('batch.up')}>↑</button>
            <button type="button" disabled={!chosen} onClick={() => chosen && edit((l) => moveBookmark(l, chosen.id, 1))} aria-label={t('batch.down')}>↓</button>
            <button type="button" disabled={!chosen} onClick={() => chosen && edit((l) => outdentBookmark(l, chosen.id))} aria-label={t('bookmarks.outdent')}>←</button>
            <button type="button" disabled={!chosen} onClick={() => chosen && edit((l) => indentBookmark(l, chosen.id))} aria-label={t('bookmarks.indent')}>→</button>
            <button
              type="button"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                edit((l) => removeBookmark(l, chosen.id));
                setSelected(null);
              }}
            >
              {t('comment.delete')}
            </button>
          </div>
          <div className="compare-main">
            <ul className="compare-pages bookmarks-list" role="listbox" aria-label={t('bookmarks.title')}>
              {rows.length === 0 && <li className="side-empty">{t('bookmarks.none')}</li>}
              {rows.map(({ bookmark: b, depth }) => (
                <li key={b.id}>
                  <button type="button" role="option" aria-selected={selected === b.id} aria-pressed={selected === b.id} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => setSelected(b.id)}>
                    <span>{b.title}</span>
                    <span className="count">{pageOf(b) ?? '–'}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="compare-view">
              {chosen ? (
                <>
                  <label>
                    {t('bookmarks.titleField')}
                    <input value={chosen.title} onChange={(e) => edit((l) => renameBookmark(l, chosen.id, e.target.value))} />
                  </label>
                  <label>
                    {t('bookmarks.target')}
                    <select value={chosen.pageId ?? ''} onChange={(e) => edit((l) => retarget(l, chosen.id, e.target.value || null))}>
                      <option value="">{t('bookmarks.noTarget')}</option>
                      {pages.map((p, i) => (
                        <option key={p.id} value={p.id}>{t('compare.page', { number: i + 1 })}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <p className="dialog-hint">{t('bookmarks.pick')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </PageDialog>
  );
}
