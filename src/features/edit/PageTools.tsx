import { useI18n } from '../../i18n/context';

interface Props {
  disabled: boolean;
  onBlank: () => void;
  onMark: () => void;
  onCrop: () => void;
  onResize: () => void;
}

/** Tools that change whole pages: an empty page, header and footer, cropping, paper size. */
export default function PageTools({ disabled, onBlank, onMark, onCrop, onResize }: Props) {
  const { t } = useI18n();
  return (
    <div className="page-tools" role="toolbar" aria-label={t('pagetools.label')}>
      <button onClick={onBlank}>{t('pagetools.blank')}</button>
      <button onClick={onMark} disabled={disabled}>{t('pagetools.mark')}</button>
      <button onClick={onCrop} disabled={disabled}>{t('pagetools.crop')}</button>
      <button onClick={onResize} disabled={disabled}>{t('pagetools.resize')}</button>
    </div>
  );
}
