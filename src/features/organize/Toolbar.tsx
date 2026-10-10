import { useI18n } from '../../i18n/context';

import type { View } from '../../state/workspace';
import Icon from '../../ui/Icon';

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
  /** Name of the file on disk when the document can be written back into it. */
  overwriteName?: string;
  onOverwrite: () => void;
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
            <Icon name={v === 'read' ? 'read' : 'pages'} size={18} />
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
      <div className="group">
        <button onClick={p.onAdd} className="add"><Icon name="open" size={18} />{t('toolbar.add')}</button>
        <button onClick={p.onUndo} disabled={!p.canUndo} title={t('toolbar.undo.title')}><Icon name="undo" size={18} />{t('toolbar.undo')}</button>
        <button onClick={p.onRedo} disabled={!p.canRedo} title={t('toolbar.redo.title')}><Icon name="redo" size={18} />{t('toolbar.redo')}</button>
        <button onClick={p.onCloseTab}><Icon name="close" size={18} />{t('toolbar.closeTab')}</button>
      </div>
      <div className="group">
        <button onClick={p.onToggleAll} disabled={!p.pageCount}><Icon name="selectAll" size={18} />{t(allSelected ? 'toolbar.selectNone' : 'toolbar.selectAll')}</button>
        <button onClick={() => p.onRotate(-90)} disabled={none}><Icon name="rotateLeft" size={18} />{t('toolbar.rotateLeft')}</button>
        <button onClick={() => p.onRotate(90)} disabled={none}><Icon name="rotateRight" size={18} />{t('toolbar.rotateRight')}</button>
        <button onClick={p.onDelete} disabled={none} className="danger"><Icon name="trash" size={18} />{t('toolbar.delete')}</button>
        <button onClick={p.onReverse} disabled={p.pageCount < 2}><Icon name="reverse" size={18} />{t('toolbar.reverse')}</button>
      </div>
      <div className="group end">
        <button onClick={p.onSplit} disabled={!p.pageCount}><Icon name="split" size={18} />{t('toolbar.split')}</button>
        <button data-testid="merge" onClick={p.onMerge} disabled={p.tabCount < 2} title={p.tabCount < 2 ? t('toolbar.merge.title') : undefined}><Icon name="merge" size={18} />{t('toolbar.merge')}</button>
        <button onClick={p.onPrint} disabled={!p.pageCount || p.busy} title={t('toolbar.print.title')}><Icon name="print" size={18} />{t('toolbar.print')}</button>
        <label className="flatten" title={t('toolbar.flatten.title')}>
          <input type="checkbox" checked={p.flatten} onChange={(e) => p.onFlatten(e.target.checked)} />
          {t('toolbar.flatten')}
        </label>
        {p.overwriteName && (
          <button className="overwrite" onClick={p.onOverwrite} disabled={!p.pageCount || p.busy} title={p.overwriteName}>
            <Icon name="open" size={18} />
            {t('toolbar.overwrite')}
          </button>
        )}
        <button className="primary" onClick={p.onSave} disabled={!p.pageCount || p.busy}>
          <Icon name="save" size={18} />
          {t(p.docCount > 1 ? 'toolbar.saveMerged' : 'toolbar.save')}
        </button>
      </div>
    </div>
  );
}
