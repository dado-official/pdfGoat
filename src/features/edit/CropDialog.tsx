import { useState } from 'react';
import type { Margins } from '../../core/paper';
import { useI18n } from '../../i18n/context';
import PageDialog from './PageDialog';

interface Props {
  scope: string;
  /** Some of the pages already have a crop. */
  hasCrop: boolean;
  /** Margins in millimetres. */
  onCrop: (margins: Margins) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Cuts margins from the pages. The cut-off content stays in the file; it is only hidden. */
export default function CropDialog({ scope, hasCrop, onCrop, onReset, onClose }: Props) {
  const { t } = useI18n();
  const [m, setM] = useState<Margins>({ top: 10, right: 10, bottom: 10, left: 10 });
  const field = (key: keyof Margins) => (
    <label key={key}>
      {t(`crop.${key}`)}
      <input type="number" min={0} max={500} step={1} value={m[key]} onChange={(e) => setM({ ...m, [key]: Math.max(0, Number(e.target.value) || 0) })} />
    </label>
  );
  return (
    <PageDialog
      title={t('crop.title')}
      scope={scope}
      submitLabel={t('crop.apply')}
      onSubmit={() => {
        onCrop(m);
        onClose();
      }}
      onClose={onClose}
      extra={
        hasCrop && (
          <button
            type="button"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            {t('crop.reset')}
          </button>
        )
      }
    >
      <p className="dialog-hint">{t('crop.hint')}</p>
      <div className="dialog-row">{(['top', 'right', 'bottom', 'left'] as const).map(field)}</div>
      <p className="dialog-hint">{t('crop.unit')}</p>
    </PageDialog>
  );
}
