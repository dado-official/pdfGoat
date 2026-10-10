import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import type { Tab } from '../../state/workspace';

interface Props {
  tabs: Tab[];
  /** Tab ids in the order the documents should follow each other. */
  onMerge: (ids: string[]) => void;
  onClose: () => void;
}

/** Chooses which open documents are joined, and in what order, into a new document. */
export default function MergeDialog({ tabs, onMerge, onClose }: Props) {
  const { t, tn } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [order, setOrder] = useState(tabs.map((tab) => tab.id));
  const [chosen, setChosen] = useState(new Set(tabs.map((tab) => tab.id)));
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const move = (id: string, step: number) =>
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + step;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = order.filter((id) => chosen.has(id));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ids.length < 2) return;
    onMerge(ids);
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="split merge" onClose={onClose} aria-labelledby="merge-title">
      <form onSubmit={submit}>
        <h2 id="merge-title">{t('merge.title')}</h2>
        <p className="hint">{t('merge.hint')}</p>
        <ol className="merge-list">
          {order.map((id, i) => {
            const tab = byId.get(id)!;
            return (
              <li key={id}>
                <label>
                  <input type="checkbox" checked={chosen.has(id)} onChange={() => toggle(id)} />
                  <span className="merge-name">{tab.title}</span>
                  <small>{tn('status.pages', tab.editor.pages.length)}</small>
                </label>
                <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={t('merge.up', { title: tab.title })}>↑</button>
                <button type="button" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={t('merge.down', { title: tab.title })}>↓</button>
              </li>
            );
          })}
        </ol>
        <div className="dialog-buttons">
          <button type="button" onClick={() => dialog.current?.close()}>{t('split.cancel')}</button>
          <button type="submit" className="primary" data-testid="merge-submit" disabled={ids.length < 2}>{t('merge.submit')}</button>
        </div>
      </form>
    </dialog>
  );
}
