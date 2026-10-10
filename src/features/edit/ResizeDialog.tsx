import { useState } from 'react';
import { PAPER_NAMES, type Orientation, type PaperName } from '../../core/paper';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import PageDialog from './PageDialog';

interface Props {
  scope: string;
  hasSize: boolean;
  onResize: (paper: PaperName, orientation: Orientation) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Scales the pages to a paper size. Each page is made as large as fits and centred. */
export default function ResizeDialog({ scope, hasSize, onResize, onReset, onClose }: Props) {
  const { t } = useI18n();
  const [paper, setPaper] = useState<PaperName>('a4');
  const [orientation, setOrientation] = useState<Orientation>('keep');
  return (
    <PageDialog
      title={t('resize.title')}
      scope={scope}
      submitLabel={t('resize.apply')}
      onSubmit={() => {
        onResize(paper, orientation);
        onClose();
      }}
      onClose={onClose}
      extra={
        hasSize && (
          <button
            type="button"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            {t('resize.reset')}
          </button>
        )
      }
    >
      <div className="dialog-row">
        <label>
          {t('resize.paper')}
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperName)}>
            {PAPER_NAMES.map((p) => (
              <option key={p} value={p}>{t(`resize.paper.${p}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('resize.orientation')}
          <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
            {(['keep', 'portrait', 'landscape'] as const).map((o) => (
              <option key={o} value={o}>{t(`resize.orientation.${o}` as MessageKey)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="dialog-hint">{t('resize.hint')}</p>
    </PageDialog>
  );
}
