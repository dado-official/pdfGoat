import { useI18n } from '../../i18n/context';
import type { Tab } from '../../state/workspace';

interface Props {
  tabs: Tab[];
  active: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: () => void;
}

/** One tab per open document. */
export default function TabBar({ tabs, active, onActivate, onClose, onOpen }: Props) {
  const { t } = useI18n();
  return (
    <div className="tabs">
      <div role="tablist" aria-label={t('tabs.label')}>
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === active ? 'tab active' : 'tab'}>
            <button
              role="tab"
              aria-selected={tab.id === active}
              title={tab.title}
              onClick={() => onActivate(tab.id)}
            >
              {tab.title}
            </button>
            <button className="tab-close" aria-label={t('tabs.close', { title: tab.title })} onClick={() => onClose(tab.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new" onClick={onOpen} aria-label={t('cmd.open')} title={t('cmd.open')}>
        ＋
      </button>
    </div>
  );
}
