import { useState } from 'react';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import PageDialog from '../edit/PageDialog';

export type ExportFormat = 'png' | 'txt' | 'md';
const DPIS = [72, 150, 300] as const;

interface Props {
  scope: string;
  onExport: (format: ExportFormat, dpi: number) => void;
  onClose: () => void;
}

/** Saves the pages as pictures, or their text as plain text or Markdown. */
export default function ExportDialog({ scope, onExport, onClose }: Props) {
  const { t } = useI18n();
  const [format, setFormat] = useState<ExportFormat>('png');
  const [dpi, setDpi] = useState<number>(150);
  return (
    <PageDialog
      title={t('export.title')}
      scope={scope}
      submitLabel={t('export.apply')}
      onSubmit={() => {
        onExport(format, dpi);
        onClose();
      }}
      onClose={onClose}
    >
      <fieldset className="permissions">
        <legend>{t('export.format')}</legend>
        {(['png', 'txt', 'md'] as const).map((f) => (
          <label key={f} className="check">
            <input type="radio" name="export-format" checked={format === f} onChange={() => setFormat(f)} />
            {t(`export.format.${f}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      {format === 'png' ? (
        <label>
          {t('export.dpi')}
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            {DPIS.map((d) => (
              <option key={d} value={d}>{t('export.dpiValue', { dpi: d })}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="dialog-hint">{t('export.textHint')}</p>
      )}
    </PageDialog>
  );
}
