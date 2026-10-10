import { useState } from 'react';
import { COMMENT_COLORS } from '../../core/annotations';
import { MARK_PLACES, type Mark, type MarkPlace } from '../../core/marks';
import type { PageRef } from '../../core/types';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import { unsupportedChars } from '../../core/winansi';
import PageDialog from './PageDialog';

type Preset = 'number' | 'header' | 'footer' | 'watermark';

const PRESETS: Record<Preset, Omit<Mark, 'id'>> = {
  number: { text: '{n} / {total}', place: 'bottomCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  header: { text: '', place: 'topCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  footer: { text: '', place: 'bottomLeft', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  watermark: { text: 'ENTWURF', place: 'center', size: 90, color: '#e5484d', opacity: 0.2, diagonal: true },
};

interface Props {
  scope: string;
  /** The pages the marks are put on or taken from. */
  target: PageRef[];
  onAdd: (mark: Mark) => void;
  onRemove: (markId: string) => void;
  onClose: () => void;
}

/** Header, footer, page numbers and watermark: set up one text, and see or remove the ones already there. */
export default function MarkDialog({ scope, target, onAdd, onRemove, onClose }: Props) {
  const { t } = useI18n();
  const [preset, setPreset] = useState<Preset>('number');
  const [mark, setMark] = useState<Omit<Mark, 'id'>>(PRESETS.number);
  const present = [...new Map(target.flatMap((p) => p.marks ?? []).map((m) => [m.id, m])).values()];
  const missing = unsupportedChars(mark.text);
  const set = (patch: Partial<Omit<Mark, 'id'>>) => setMark((m) => ({ ...m, ...patch }));

  return (
    <PageDialog
      title={t('mark.title')}
      scope={scope}
      submitLabel={t('mark.add')}
      submitDisabled={!mark.text.trim()}
      onSubmit={() => {
        onAdd({ ...mark, id: crypto.randomUUID() });
        onClose();
      }}
      onClose={onClose}
    >
      <label>
        {t('mark.preset')}
        <select
          value={preset}
          onChange={(e) => {
            const p = e.target.value as Preset;
            setPreset(p);
            setMark(PRESETS[p]);
          }}
        >
          {(Object.keys(PRESETS) as Preset[]).map((p) => (
            <option key={p} value={p}>{t(`mark.preset.${p}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <label>
        {t('mark.text')}
        <input value={mark.text} onChange={(e) => set({ text: e.target.value })} />
        <small>{t('mark.textHint')}</small>
      </label>
      {missing.length > 0 && <p className="sign-problem" role="status">{t('comment.missingChars', { chars: missing.join(' ') })}</p>}
      <div className="dialog-row">
        <label>
          {t('mark.place')}
          <select value={mark.place} onChange={(e) => set({ place: e.target.value as MarkPlace, diagonal: e.target.value === 'center' ? mark.diagonal : false })}>
            {MARK_PLACES.map((p) => (
              <option key={p} value={p}>{t(`mark.place.${p}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('mark.size')}
          <input type="number" min={6} max={200} value={mark.size} onChange={(e) => set({ size: Math.max(6, Math.min(200, Number(e.target.value) || 10)) })} />
        </label>
        <label>
          {t('mark.color')}
          <select value={mark.color} onChange={(e) => set({ color: e.target.value })}>
            {COMMENT_COLORS.map((c) => (
              <option key={c} value={c}>{t(`mark.color.${c.slice(1)}` as MessageKey)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="dialog-row">
        <label>
          {t('mark.opacity')}
          <input type="range" min={10} max={100} step={5} value={Math.round(mark.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
        </label>
        {mark.place === 'center' && (
          <label className="check">
            <input type="checkbox" checked={mark.diagonal} onChange={(e) => set({ diagonal: e.target.checked })} />
            {t('mark.diagonal')}
          </label>
        )}
      </div>
      {present.length > 0 && (
        <div className="mark-list">
          <p>{t('mark.present')}</p>
          <ul>
            {present.map((m) => (
              <li key={m.id}>
                <span>{m.text}</span>
                <button type="button" className="comment-delete" onClick={() => onRemove(m.id)}>{t('comment.delete')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageDialog>
  );
}
