import { useI18n } from '../../i18n/context';

const FEATURES = ['sort', 'rotate', 'merge', 'split'] as const;

export default function DropZone({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <button className="drop" onClick={onOpen}>
        <span className="big" aria-hidden="true">📄</span>
        <strong>{t('drop.title')}</strong>
        <span>{t('drop.hint')}</span>
      </button>
      <ul className="features">
        {FEATURES.map((name) => (
          <li key={name}>
            <strong>{t(`feature.${name}.title`)}</strong> {t(`feature.${name}.text`)}
          </li>
        ))}
      </ul>
    </>
  );
}
