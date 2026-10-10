import { useEffect, useRef, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';

interface Props {
  name: string;
  /** True when the last password did not fit. */
  wrong: boolean;
  /** The password, or null when the user skips the file. */
  onResult: (password: string | null) => void;
}

export default function PasswordDialog({ name, wrong, onResult }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Submitting closes the dialog, which fires onClose as well; only the first answer counts.
  const answered = useRef(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  function answer(value: string | null) {
    if (answered.current) return;
    answered.current = true;
    onResult(value);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    answer(input.current?.value ?? '');
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="split password" onClose={() => answer(null)} aria-labelledby="password-title">
      <form onSubmit={submit}>
        <h2 id="password-title">{t('password.title')}</h2>
        <p>{t('error.passwordRequired', { name })}</p>
        <input
          ref={input}
          className="text"
          type="password"
          autoFocus
          autoComplete="off"
          aria-label={t('password.label')}
        />
        {wrong && (
          <p className="error-text" role="alert">
            {t('error.passwordWrong')}
          </p>
        )}
        <p className="hint">{t('password.hint')}</p>
        <div className="dialog-buttons">
          <button type="button" onClick={() => dialog.current?.close()}>{t('password.cancel')}</button>
          <button type="submit" className="primary">{t('password.submit')}</button>
        </div>
      </form>
    </dialog>
  );
}
