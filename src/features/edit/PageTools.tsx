import { useI18n } from '../../i18n/context';
import Icon from '../../ui/Icon';

interface Props {
  disabled: boolean;
  onBlank: () => void;
  onMark: () => void;
  onCrop: () => void;
  onResize: () => void;
  onProtect: () => void;
  protectActive: boolean;
  onExport: () => void;
  onCompress: () => void;
  /** Two or more documents are open. */
  canCompare: boolean;
  onCompare: () => void;
}

/** Tools that change whole pages: an empty page, header and footer, cropping, paper size. */
export default function PageTools({ disabled, onBlank, onMark, onCrop, onResize, onProtect, protectActive, onExport, onCompress, canCompare, onCompare }: Props) {
  const { t } = useI18n();
  return (
    <div className="ribbon page-tools" role="toolbar" aria-label={t('pagetools.label')}>
      <button className="ribbon-button" onClick={onBlank}><Icon name="blank" size={22} />
        <span>{t('pagetools.blank')}</span></button>
      <button className="ribbon-button" onClick={onMark} disabled={disabled}><Icon name="mark" size={22} />
        <span>{t('pagetools.mark')}</span></button>
      <button className="ribbon-button" onClick={onCrop} disabled={disabled}><Icon name="crop" size={22} />
        <span>{t('pagetools.crop')}</span></button>
      <button className="ribbon-button" onClick={onCompare} disabled={!canCompare} title={canCompare ? undefined : t('compare.needTwo')}>
        <Icon name="compare" size={22} />
        <span>{t('pagetools.compare')}</span>
      </button>
      <button className="ribbon-button" onClick={onCompress} disabled={disabled}>
        <Icon name="compress" size={22} />
        <span>{t('pagetools.compress')}</span>
      </button>
      <button className="ribbon-button" onClick={onExport} disabled={disabled}>
        <Icon name="export" size={22} />
        <span>{t('pagetools.export')}</span>
      </button>
      <button className="ribbon-button" aria-pressed={protectActive} onClick={onProtect} disabled={disabled}>
        <Icon name="lock" size={22} />
        <span>{t('protect.open')}</span>
      </button>
      <button className="ribbon-button" onClick={onResize} disabled={disabled}><Icon name="resize" size={22} />
        <span>{t('pagetools.resize')}</span></button>
    </div>
  );
}
