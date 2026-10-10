import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annot } from '../../core/annotations';
import { safeExternalUrl } from '../../core/outline';
import { unsupportedChars } from '../../core/winansi';
import type { PageRef } from '../../core/types';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import type { FileComment } from '../../pdf/view';

/** Comments that a file already had, by `docId:srcIndex`. */
export type FileComments = Record<string, FileComment[]>;

interface Props {
  pages: PageRef[];
  fileComments: FileComments;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGo: (pageIndex: number) => void;
  onChange: (pageIndex: number, annots: Annot[]) => void;
  onRemoveFile: (pageIndex: number, index: number) => void;
}

type Entry =
  | { key: string; page: number; top: number; mine: Annot }
  | { key: string; page: number; top: number; file: FileComment };

const FILE_KINDS: Record<string, MessageKey> = {
  Highlight: 'comment.kind.highlight',
  Underline: 'comment.kind.underline',
  StrikeOut: 'comment.kind.strikeout',
  Text: 'comment.kind.note',
  FreeText: 'comment.kind.text',
  Ink: 'comment.kind.ink',
  Square: 'comment.kind.square',
  Circle: 'comment.kind.circle',
  Line: 'comment.kind.line',
  Stamp: 'comment.kind.stamp',
};

const kindLabel = (a: Annot): MessageKey =>
  a.embed && a.kind === 'text' ? 'comment.kind.embedText'
  : a.embed && a.kind === 'stamp' ? 'comment.kind.embedImage'
  : (`comment.kind.${a.tag ?? a.kind}` as MessageKey);

/** The comment list on the right: the file's own comments and the new ones, page by page. */
export default function CommentPanel({ pages, fileComments, selectedId, onSelect, onGo, onChange, onRemoveFile }: Props) {
  const { t } = useI18n();
  const entries = useMemo(() => {
    const list: Entry[] = [];
    pages.forEach((p, page) => {
      const gone = new Set(p.removed ?? []);
      for (const fc of fileComments[`${p.docId}:${p.srcIndex}`] ?? []) {
        if (!gone.has(fc.index)) list.push({ key: `f${p.id}:${fc.index}`, page, top: fc.box[1], file: fc });
      }
      for (const a of p.annots ?? []) list.push({ key: a.id, page, top: a.box[1], mine: a });
    });
    return list.sort((a, b) => a.page - b.page || a.top - b.top);
  }, [pages, fileComments]);

  return (
    <aside className="comment-panel" aria-label={t('comment.panelLabel')}>
      {entries.length === 0 ? (
        <p className="side-empty">{t('comment.empty')}</p>
      ) : (
        <ul>
          {entries.map((e) => {
            if ('file' in e) {
              const fc = e.file;
              return (
                <li key={e.key} className="comment-item">
                  <button className="comment-head" onClick={() => onGo(e.page)}>
                    <span>{t(FILE_KINDS[fc.type] ?? 'comment.kind.other')}</span>
                    <span className="comment-page">{t('comment.onPage', { number: e.page + 1 })}</span>
                  </button>
                  <p className="comment-text">{fc.contents || <em>{t('comment.noText')}</em>}</p>
                  {fc.author && <p className="comment-author">{t('comment.from', { author: fc.author })}</p>}
                  <button className="comment-delete" onClick={() => onRemoveFile(e.page, fc.index)}>
                    {t('comment.delete')}
                  </button>
                </li>
              );
            }
            const a = e.mine;
            const selected = a.id === selectedId;
            const annots = pages[e.page].annots ?? [];
            return (
              <li key={e.key} className={selected ? 'comment-item selected' : 'comment-item'} data-comment={a.kind}>
                <button
                  className="comment-head"
                  onClick={() => {
                    onSelect(a.id);
                    onGo(e.page);
                  }}
                >
                  <span className="comment-dot" style={{ background: a.color }} />
                  <span>{t(kindLabel(a))}</span>
                  <span className="comment-page">{t('comment.onPage', { number: e.page + 1 })}</span>
                </button>
                {selected ? (
                  <CommentEditor
                    key={a.id}
                    mode={a.kind === 'link' ? 'link' : a.embed ? 'embed' : 'comment'}
                    value={a.contents}
                    onCommit={(contents) => onChange(e.page, annots.map((x) => (x.id === a.id ? { ...x, contents } : x)))}
                  />
                ) : (
                  <p className="comment-text">{a.contents || <em>{t('comment.noText')}</em>}</p>
                )}
                <button
                  className="comment-delete"
                  onClick={() => {
                    onChange(e.page, annots.filter((x) => x.id !== a.id));
                    onSelect(null);
                  }}
                >
                  {t('comment.delete')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="comment-note">{t('comment.fileNote')}</p>
    </aside>
  );
}

/**
 * A text field that records the change when it is left, not with every key. It is also recorded
 * when the field goes away without losing focus first (a click elsewhere deselects the comment).
 */
function CommentEditor({ value, onCommit, mode = 'comment' }: { value: string; onCommit: (text: string) => void; mode?: 'comment' | 'link' | 'embed' }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: commit } = latest.current;
      if (d !== v) commit(d);
    },
    [],
  );
  // Inserted text is written with a font that has western European characters only.
  const missing = mode === 'embed' ? unsupportedChars(draft) : [];
  const bad = mode === 'link' && draft.trim() !== '' && !safeExternalUrl(draft.trim());
  return (
    <>
      <textarea
        className="comment-edit"
        aria-label={t(mode === 'link' ? 'comment.address' : 'comment.edit')}
        placeholder={mode === 'link' ? 'https://' : undefined}
        autoFocus={value === ''}
        value={draft}
        rows={mode === 'link' ? 1 : 3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
      />
      {missing.length > 0 && <p className="sign-problem" role="status">{t('comment.missingChars', { chars: missing.join(' ') })}</p>}
      {bad && <p className="sign-problem" role="status">{t('comment.badAddress')}</p>}
    </>
  );
}
