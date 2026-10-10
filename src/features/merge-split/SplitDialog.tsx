import { useEffect, useRef, useState, type FormEvent } from 'react';
import { chunk, parseRanges } from '../../core/ranges';
import { useI18n } from '../../i18n/context';

/** One group of 0-based page positions per output file, or the current selection. */
export type SplitPlan = number[][] | 'selection';

interface Props {
  total: number;
  selectedCount: number;
  onSplit: (plan: SplitPlan) => void;
  onClose: () => void;
}

type Mode = 'selection' | 'ranges' | 'every';

export default function SplitDialog({ total, selectedCount, onSplit, onClose }: Props) {
  const { t, tn, errorText } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>(selectedCount ? 'selection' : 'ranges');
  const [ranges, setRanges] = useState('');
  const [every, setEvery] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  function plan(): SplitPlan {
    if (mode === 'selection') return 'selection';
    if (mode === 'ranges') return parseRanges(ranges, total);
    return chunk(total, every);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onSplit(plan());
      dialog.current?.close();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const half = Math.ceil(total / 2);

  return (
    <dialog ref={dialog} className="split" onClose={onClose} aria-labelledby="split-title">
      <form onSubmit={submit}>
        <h2 id="split-title">{t('split.title')}</h2>

        <label className="option">
          <input
            type="radio"
            name="mode"
            checked={mode === 'selection'}
            onChange={() => setMode('selection')}
            disabled={!selectedCount}
          />
          <span>
            {t('split.selection')}
            <small>{selectedCount ? tn('split.selected', selectedCount) : t('split.selection.empty')}</small>
          </span>
        </label>

        <label className="option">
          <input type="radio" name="mode" checked={mode === 'ranges'} onChange={() => setMode('ranges')} />
          <span>
            {t('split.ranges')}
            <small>
              {t('split.ranges.hint')} <code>1-3, 4, 5-</code>
            </small>
          </span>
        </label>
        {mode === 'ranges' && (
          <input
            id="split-ranges"
            className="text"
            type="text"
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            placeholder={`1-${half}, ${half + 1}-${total}`}
            aria-label={t('split.ranges.label')}
          />
        )}

        <label className="option">
          <input type="radio" name="mode" checked={mode === 'every'} onChange={() => setMode('every')} />
          <span>
            {t('split.every.before')}{' '}
            <input
              className="num"
              type="number"
              min={1}
              max={total}
              value={every}
              onChange={(e) => setEvery(Number(e.target.value))}
              onFocus={() => setMode('every')}
            />{' '}
            {t('split.every.after')}
            <small>{t('split.every.hint')}</small>
          </span>
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <p className="hint">{t('split.hint')}</p>

        <div className="dialog-buttons">
          <button type="button" onClick={() => dialog.current?.close()}>{t('split.cancel')}</button>
          <button type="submit" className="primary">{t('split.submit')}</button>
        </div>
      </form>
    </dialog>
  );
}
