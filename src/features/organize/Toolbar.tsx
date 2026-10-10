import { useI18n } from '../../i18n/context';

import type { View } from '../../state/workspace';

interface Props {
  pageCount: number;
  docCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  view: View;
  onView: (view: View) => void;
  tabCount: number;
  onMerge: () => void;
  onAdd: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCloseTab: () => void;
  onToggleAll: () => void;
  onRotate: (delta: number) => void;
  onDelete: () => void;
  onReverse: () => void;
  onSplit: () => void;
  onPrint: () => void;
  flatten: boolean;
  onFlatten: (on: boolean) => void;
  onSave: () => void;
}

export default function Toolbar(p: Props) {
  const { t } = useI18n();
  const allSelected = p.pageCount > 0 && p.selectedCount === p.pageCount;
  const none = p.selectedCount === 0;
  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div className="group views" role="group" aria-label={t('view.label')}>
        {(['read', 'pages'] as const).map((v) => (
          <button key={v} aria-pressed={p.view === v} onClick={() => p.onView(v)}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
      <div className="group">
        <button onClick={p.onAdd} className="add">{t('toolbar.add')}</button>
        <button onClick={p.onUndo} disabled={!p.canUndo} title={t('toolbar.undo.title')}>{t('toolbar.undo')}</button>
        <button onClick={p.onRedo} disabled={!p.canRedo} title={t('toolbar.redo.title')}>{t('toolbar.redo')}</button>
        <button onClick={p.onCloseTab}>{t('toolbar.closeTab')}</button>
      </div>
      <div className="group">
        <button onClick={p.onToggleAll} disabled={!p.pageCount}>{t(allSelected ? 'toolbar.selectNone' : 'toolbar.selectAll')}</button>
        <button onClick={() => p.onRotate(-90)} disabled={none}>{t('toolbar.rotateLeft')}</button>
        <button onClick={() => p.onRotate(90)} disabled={none}>{t('toolbar.rotateRight')}</button>
        <button onClick={p.onDelete} disabled={none} className="danger">{t('toolbar.delete')}</button>
        <button onClick={p.onReverse} disabled={p.pageCount < 2}>{t('toolbar.reverse')}</button>
      </div>
      <div className="group end">
        <button onClick={p.onSplit} disabled={!p.pageCount}>{t('toolbar.split')}</button>
        <button data-testid="merge" onClick={p.onMerge} disabled={p.tabCount < 2} title={p.tabCount < 2 ? t('toolbar.merge.title') : undefined}>{t('toolbar.merge')}</button>
        <button onClick={p.onPrint} disabled={!p.pageCount || p.busy} title={t('toolbar.print.title')}>{t('toolbar.print')}</button>
        <label className="flatten" title={t('toolbar.flatten.title')}>
          <input type="checkbox" checked={p.flatten} onChange={(e) => p.onFlatten(e.target.checked)} />
          {t('toolbar.flatten')}
        </label>
        <button className="primary" onClick={p.onSave} disabled={!p.pageCount || p.busy}>
          {t(p.docCount > 1 ? 'toolbar.saveMerged' : 'toolbar.save')}
        </button>
      </div>
    </div>
  );
}
