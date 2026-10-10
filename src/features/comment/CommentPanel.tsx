import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annot } from '../../core/annotations';
import { replacementFont, scaleBox, type Edit } from '../../core/edits';
import { imagePicture } from './pictures';
import { safeExternalUrl } from '../../core/outline';
import { unsupportedChars } from '../../core/winansi';
import type { PageRef } from '../../core/types';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import type { FileComment, FormField } from '../../pdf/view';
import type { FieldSpec } from '../../core/formfields';

/** Comments that a file already had, by `docId:srcIndex`. */
export type FileComments = Record<string, FileComment[]>;

interface Props {
  pages: PageRef[];
  fileComments: FileComments;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGo: (pageIndex: number) => void;
  onChange: (pageIndex: number, annots: Annot[]) => void;
  onEdits: (pageIndex: number, edits: Edit[]) => void;
  onRemoveFile: (pageIndex: number, index: number) => void;
  /** Form fields of the files, by `docId:srcIndex`, and deleting one of them. */
  fileFields: Record<string, FormField[]>;
  onDropField: (pageIndex: number, index: number) => void;
}

type Entry =
  | { key: string; page: number; top: number; mine: Annot }
  | { key: string; page: number; top: number; file: FileComment }
  | { key: string; page: number; top: number; edit: Edit }
  | { key: string; page: number; top: number; formField: FormField };

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
  a.kind === 'field' ? (`comment.kind.field.${a.field?.type ?? 'text'}` as MessageKey)
  : a.kind === 'redact' ? 'comment.kind.redact'
  : a.embed && a.kind === 'text' ? 'comment.kind.embedText'
  : a.embed && a.kind === 'stamp' ? 'comment.kind.embedImage'
  : (`comment.kind.${a.tag ?? a.kind}` as MessageKey);

/** The comment list on the right: the file's own comments and the new ones, page by page. */
export default function CommentPanel({ pages, fileComments, selectedId, onSelect, onGo, onChange, onEdits, onRemoveFile, fileFields, onDropField }: Props) {
  const { t } = useI18n();
  const entries = useMemo(() => {
    const list: Entry[] = [];
    pages.forEach((p, page) => {
      const gone = new Set(p.removed ?? []);
      for (const fc of fileComments[`${p.docId}:${p.srcIndex}`] ?? []) {
        if (!gone.has(fc.index)) list.push({ key: `f${p.id}:${fc.index}`, page, top: fc.box[1], file: fc });
      }
      for (const ff of fileFields[`${p.docId}:${p.srcIndex}`] ?? []) {
        if (!(p.removedFields ?? []).includes(ff.index)) list.push({ key: `w${p.id}:${ff.index}`, page, top: ff.box[1], formField: ff });
      }
      for (const a of p.annots ?? []) list.push({ key: a.id, page, top: a.box[1], mine: a });
      for (const edit of p.edits ?? []) list.push({ key: edit.id, page, top: edit.box[1], edit });
    });
    return list.sort((a, b) => a.page - b.page || a.top - b.top);
  }, [pages, fileComments, fileFields]);

  return (
    <aside className="comment-panel" aria-label={t('comment.panelLabel')}>
      {entries.length === 0 ? (
        <p className="side-empty">{t('comment.empty')}</p>
      ) : (
        <ul>
          {entries.map((e) => {
            if ('formField' in e) {
              const ff = e.formField;
              return (
                <li key={e.key} className="comment-item">
                  <button className="comment-head" onClick={() => onGo(e.page)}>
                    <span>{t('comment.kind.formField')}</span>
                    <span className="comment-page">{t('comment.onPage', { number: e.page + 1 })}</span>
                  </button>
                  <p className="comment-text">{ff.name}</p>
                  <button className="comment-delete" onClick={() => onDropField(e.page, ff.index)}>{t('comment.delete')}</button>
                </li>
              );
            }
            if ('edit' in e) {
              return (
                <EditItem
                  key={e.key}
                  edit={e.edit}
                  selected={e.edit.id === selectedId}
                  onSelect={() => {
                    onSelect(e.edit.id);
                    onGo(e.page);
                  }}
                  onChange={(next) => onEdits(e.page, (pages[e.page].edits ?? []).map((x) => (x.id === next.id ? next : x)))}
                  onReset={() => {
                    onEdits(e.page, (pages[e.page].edits ?? []).filter((x) => x.id !== e.edit.id));
                    onSelect(null);
                  }}
                />
              );
            }
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
                {a.kind === 'field' && a.field ? (
                  selected ? (
                    <FieldEditor key={a.id} spec={a.field} onChange={(field) => onChange(e.page, annots.map((x) => (x.id === a.id ? { ...x, field } : x)))} />
                  ) : (
                    <p className="comment-text">{a.field.name}</p>
                  )
                ) : a.kind === 'redact' ? (
                  <p className="comment-author">{t('redact.note')}</p>
                ) : selected ? (
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

/** One change to existing content: the new text, or what to do with the picture. */
function EditItem({ edit, selected, onSelect, onChange, onReset }: { edit: Edit; selected: boolean; onSelect: () => void; onChange: (e: Edit) => void; onReset: () => void }) {
  const { t } = useI18n();
  const replace = useRef<HTMLInputElement>(null);
  return (
    <li className={selected ? 'comment-item selected' : 'comment-item'} data-comment={`edit-${edit.kind}`}>
      <button className="comment-head" onClick={onSelect}>
        <span>{t(edit.kind === 'text' ? 'comment.kind.editText' : 'comment.kind.editImage')}</span>
      </button>
      {edit.kind === 'text' ? (
        selected ? (
          <>
            <p className="comment-author">{t('edit.was', { text: edit.original })}</p>
            <EditText key={edit.id} value={edit.text} onCommit={(text) => onChange({ ...edit, text })} />
            <p className="comment-author">{t('edit.font', { font: replacementFont(edit.font) })}</p>
          </>
        ) : (
          <p className="comment-text">{edit.text || <em>{t('edit.removed')}</em>}</p>
        )
      ) : (
        <>
          <p className="comment-text">{edit.target ? t('edit.pictureKept') : <em>{t('edit.pictureRemoved')}</em>}</p>
          {selected && (
            <div className="edit-actions">
              {edit.target ? (
                <>
                  <button onClick={() => onChange({ ...edit, target: null })}>{t('edit.remove')}</button>
                  <button onClick={() => onChange({ ...edit, target: scaleBox(edit.target!, 1.1) })}>{t('edit.bigger')}</button>
                  <button onClick={() => onChange({ ...edit, target: scaleBox(edit.target!, 1 / 1.1) })}>{t('edit.smaller')}</button>
                  <button onClick={() => replace.current?.click()}>{t('edit.replace')}</button>
                </>
              ) : (
                <button onClick={() => onChange({ ...edit, target: edit.box })}>{t('edit.restore')}</button>
              )}
              <input
                ref={replace}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                aria-label={t('edit.replace')}
                data-testid="replace-input"
                onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = '';
                  if (!f || !edit.target) return;
                  try {
                    const pic = await imagePicture(f, 1600);
                    // The new picture keeps its shape and fits inside the old one's place.
                    const [x0, y0, x1, y1] = edit.target;
                    const w = x1 - x0;
                    const h = y1 - y0;
                    const fitW = Math.min(w, h * pic.ratio);
                    const fitH = fitW / pic.ratio;
                    const cx = (x0 + x1) / 2;
                    const cy = (y0 + y1) / 2;
                    onChange({ ...edit, png: pic.bytes, target: [cx - fitW / 2, cy - fitH / 2, cx + fitW / 2, cy + fitH / 2] });
                  } catch {
                    // The old picture stays.
                  }
                }}
              />
            </div>
          )}
        </>
      )}
      <button className="comment-delete" onClick={onReset}>{t('edit.reset')}</button>
    </li>
  );
}

function EditText({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
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
  const missing = unsupportedChars(draft);
  return (
    <>
      <input className="comment-edit" aria-label={t('edit.newText')} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      {missing.length > 0 && <p className="sign-problem" role="status">{t('comment.missingChars', { chars: missing.join(' ') })}</p>}
    </>
  );
}

/** The settings of a form field the user added. Texts are recorded when the field is left. */
function FieldEditor({ spec, onChange }: { spec: FieldSpec; onChange: (f: FieldSpec) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(spec.name);
  const [options, setOptions] = useState(spec.options.join('\n'));
  const [value, setValue] = useState(spec.exportValue);
  const latest = useRef({ spec, name, options, value, onChange });
  useEffect(() => {
    latest.current = { spec, name, options, value, onChange };
  });
  const commit = () => {
    const l = latest.current;
    const entries = l.options.split('\n').map((o) => o.trim()).filter(Boolean);
    const next = { ...l.spec, name: l.name.trim() || l.spec.name, options: l.spec.type === 'choice' ? entries : l.spec.options, exportValue: l.value };
    if (next.name !== l.spec.name || next.exportValue !== l.spec.exportValue || next.options.join('\n') !== l.spec.options.join('\n')) l.onChange(next);
  };
  // A click elsewhere removes this editor without leaving the field first.
  useEffect(() => commit, []); // eslint-disable-line
  return (
    <div className="field-editor">
      <label>
        {t('field.name')}
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      </label>
      {spec.type === 'radio' && (
        <label>
          {t('field.exportValue')}
          <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} />
        </label>
      )}
      {spec.type === 'choice' && (
        <>
          <label>
            {t('field.options')}
            <textarea rows={3} value={options} onChange={(e) => setOptions(e.target.value)} onBlur={commit} />
          </label>
          <label className="check">
            <input type="checkbox" checked={spec.combo} onChange={(e) => onChange({ ...spec, combo: e.target.checked })} />
            {t('field.combo')}
          </label>
        </>
      )}
      {spec.type === 'text' && (
        <label className="check">
          <input type="checkbox" checked={spec.multiline} onChange={(e) => onChange({ ...spec, multiline: e.target.checked })} />
          {t('field.multiline')}
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={spec.required} onChange={(e) => onChange({ ...spec, required: e.target.checked })} />
        {t('field.required')}
      </label>
      <label className="check">
        <input type="checkbox" checked={spec.readOnly} onChange={(e) => onChange({ ...spec, readOnly: e.target.checked })} />
        {t('field.readOnly')}
      </label>
    </div>
  );
}
