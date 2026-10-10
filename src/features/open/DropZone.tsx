import { useI18n } from '../../i18n/context';

/** The empty workbench: one large target that opens the file picker. Files can also be dropped anywhere. */
export default function DropZone({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button className="drop" onClick={onOpen}>
      <strong>{t('drop.title')}</strong>
      <span>{t('drop.hint')}</span>
    </button>
  );
}
