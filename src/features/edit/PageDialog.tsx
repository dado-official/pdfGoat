import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../../i18n/context';

interface Props {
  title: string;
  /** What the change applies to, e.g. "all 5 pages". */
  scope: string;
  children: ReactNode;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  /** An extra button next to the main one, e.g. to undo the setting. */
  extra?: ReactNode;
  /** A wide dialog, for side-by-side views. */
  wide?: boolean;
}

/** The frame of the page-tool dialogs: title, what it applies to, the form, and the buttons. */
export default function PageDialog({ title, scope, children, submitLabel, submitDisabled, onSubmit, onClose, extra, wide }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className={wide ? 'split page-dialog wide' : 'split page-dialog'} aria-labelledby="page-dialog-title" onClose={onClose}>
      <h2 id="page-dialog-title">{title}</h2>
      <p className="dialog-scope">{scope}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="dialog-fields">{children}</div>
        <div className="dialog-buttons">
          {extra}
          <button type="button" onClick={onClose}>{t('split.cancel')}</button>
          <button type="submit" className="primary" disabled={submitDisabled}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
