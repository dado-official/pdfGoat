import { useI18n } from '../../i18n/context';
import PageStack from './PageStack';

const FEATURES = ['organize', 'merge', 'split', 'private'] as const;

/** The start page: says what PDFgoat does and opens the file picker. Files can also be dropped anywhere. */
export default function DropZone({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <section className="hero">
      <div className="hero-text">
        <h2>{t('hero.title')}</h2>
        <p>{t('hero.text')}</p>
        <div className="hero-action">
          <button className="open" onClick={onOpen}>{t('hero.button')}</button>
          <span>{t('hero.dropHint')}</span>
        </div>
        <ul className="can-do">
          {FEATURES.map((name) => (
            <li key={name}>{t(`hero.feature.${name}`)}</li>
          ))}
        </ul>
      </div>
      <PageStack />
    </section>
  );
}
