import { useRef, useState } from 'react';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import { OCR_LANGS, OcrCancelled, type OcrLang } from '../../pdf/ocr';
import PageDialog from '../edit/PageDialog';

interface Props {
  scope: string;
  /** Some of the pages already carry recognised text. */
  hasText: boolean;
  /** Runs the recognition; returns how many words were found. Reports progress and stops when aborted. */
  onRun: (lang: OcrLang, onProgress: (done: number, total: number) => void, signal: AbortSignal) => Promise<number>;
  onRemove: () => void;
  onClose: () => void;
}

/** Finds the text of scanned pages, so they can be searched and copied from. Runs on this computer. */
export default function OcrDialog({ scope, hasText, onRun, onRemove, onClose }: Props) {
  const { t } = useI18n();
  const [lang, setLang] = useState<OcrLang>('deu');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [words, setWords] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const running = progress !== null && words === null && !failed;

  return (
    <PageDialog
      title={t('ocr.title')}
      scope={scope}
      submitLabel={t(running ? 'ocr.working' : 'ocr.start')}
      submitDisabled={running}
      onSubmit={async () => {
        controller.current = new AbortController();
        setFailed(false);
        setWords(null);
        setProgress({ done: 0, total: 0 });
        try {
          setWords(await onRun(lang, (done, total) => setProgress({ done, total }), controller.current.signal));
        } catch (err) {
          if (!(err instanceof OcrCancelled)) {
            console.error(err);
            setFailed(true);
          }
          setProgress(null);
        }
      }}
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      extra={
        <>
          {running && (
            <button type="button" onClick={() => controller.current?.abort()}>
              {t('busy.cancel')}
            </button>
          )}
          {!running && hasText && (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              {t('ocr.remove')}
            </button>
          )}
        </>
      }
    >
      <label>
        {t('ocr.language')}
        <select value={lang} onChange={(e) => setLang(e.target.value as OcrLang)} disabled={running}>
          {OCR_LANGS.map((l) => (
            <option key={l} value={l}>{t(`ocr.lang.${l}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <p className="dialog-hint">{t('ocr.hint')}</p>
      {running && (
        <p role="status">
          {progress.total === 0 ? t('ocr.loading') : t('ocr.progress', { done: Math.min(progress.done + 1, progress.total), total: progress.total })}
        </p>
      )}
      {words !== null && <p role="status" className="compress-result">{words > 0 ? t('ocr.done', { count: words }) : t('ocr.none')}</p>}
      {failed && <p className="sign-problem" role="alert">{t('ocr.failed')}</p>}
    </PageDialog>
  );
}
