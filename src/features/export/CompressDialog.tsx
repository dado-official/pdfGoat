import { useState } from 'react';
import { formatBytes, savedPercent, type CompressLevel } from '../../core/compress';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import PageDialog from '../edit/PageDialog';

export interface CompressResult {
  before: number;
  after: number;
  bytes: Uint8Array;
}

interface Props {
  scope: string;
  /** Builds the file as it is and made smaller, and returns both sizes. */
  onCompress: (level: CompressLevel) => Promise<CompressResult>;
  onSave: (bytes: Uint8Array) => void;
  onClose: () => void;
}

/** Makes the saved file smaller by scaling pictures down. Shows the size before and after, then saves. */
export default function CompressDialog({ scope, onCompress, onSave, onClose }: Props) {
  const { t, lang } = useI18n();
  const [level, setLevel] = useState<CompressLevel>('medium');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [failed, setFailed] = useState(false);
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';

  return (
    <PageDialog
      title={t('compress.title')}
      scope={scope}
      submitLabel={t(working ? 'compress.working' : 'compress.apply')}
      submitDisabled={working}
      onSubmit={async () => {
        setWorking(true);
        setFailed(false);
        setResult(null);
        try {
          setResult(await onCompress(level));
        } catch (err) {
          console.error(err);
          setFailed(true);
        } finally {
          setWorking(false);
        }
      }}
      onClose={onClose}
      extra={
        result && (
          <button type="button" onClick={() => onSave(result.bytes)}>
            {t('compress.save')}
          </button>
        )
      }
    >
      <fieldset className="permissions">
        <legend>{t('compress.level')}</legend>
        {(['light', 'medium', 'strong'] as const).map((l) => (
          <label key={l} className="check">
            <input type="radio" name="compress-level" checked={level === l} onChange={() => { setLevel(l); setResult(null); }} />
            {t(`compress.level.${l}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      <p className="dialog-hint">{t('compress.hint')}</p>
      {result && (
        <p role="status" className="compress-result">
          {result.after < result.before
            ? t('compress.result', { before: formatBytes(result.before, locale), after: formatBytes(result.after, locale), percent: savedPercent(result.before, result.after) })
            : t('compress.nothing', { size: formatBytes(result.before, locale) })}
        </p>
      )}
      {failed && <p className="sign-problem" role="alert">{t('compress.failed')}</p>}
    </PageDialog>
  );
}
