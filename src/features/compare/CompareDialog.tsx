import { useEffect, useRef, useState } from 'react';
import { countOps, diffWords, words, type WordOp } from '../../core/diff';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { getText, renderPage, type SourceDoc } from '../../pdf/view';
import type { Tab } from '../../state/workspace';
import PageDialog from '../edit/PageDialog';

interface Props {
  tabs: Tab[];
  docs: Record<string, SourceDoc>;
  onClose: () => void;
}

interface Row {
  index: number;
  ops: WordOp[];
  removed: number;
  added: number;
  pageA: PageRef | undefined;
  pageB: PageRef | undefined;
}

async function textOf(page: PageRef | undefined, docs: Record<string, SourceDoc>): Promise<string> {
  const doc = page && docs[page.docId];
  if (!page || !doc?.sizes[page.srcIndex]) return '';
  const lines = await getText(doc, page.srcIndex);
  return lines.map((l) => l.text).join(' ');
}

/** Compares two open documents page by page: the words that differ, and a picture of what differs. */
export default function CompareDialog({ tabs, docs, onClose }: Props) {
  const { t } = useI18n();
  const [a, setA] = useState(tabs[0]?.id ?? '');
  const [b, setB] = useState(tabs[1]?.id ?? tabs[0]?.id ?? '');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [visual, setVisual] = useState(false);
  const tab = (id: string) => tabs.find((x) => x.id === id);

  async function compare() {
    const pagesA = tab(a)?.editor.pages ?? [];
    const pagesB = tab(b)?.editor.pages ?? [];
    setWorking(true);
    setRows(null);
    setSelected(null);
    const out: Row[] = [];
    for (let i = 0; i < Math.max(pagesA.length, pagesB.length); i++) {
      const [ta, tb] = await Promise.all([textOf(pagesA[i], docs), textOf(pagesB[i], docs)]);
      const ops = diffWords(words(ta), words(tb));
      out.push({ index: i, ops, ...countOps(ops), pageA: pagesA[i], pageB: pagesB[i] });
    }
    setRows(out);
    setWorking(false);
    const first = out.find((r) => r.removed || r.added || !r.pageA || !r.pageB);
    setSelected(first ? first.index : null);
  }

  const changed = rows?.filter((r) => r.removed || r.added || !r.pageA || !r.pageB) ?? [];
  const current = rows && selected !== null ? rows[selected] : null;

  return (
    <PageDialog
      wide
      title={t('compare.title')}
      scope={t('compare.scope')}
      submitLabel={t(working ? 'compare.working' : 'compare.apply')}
      submitDisabled={working || a === b}
      onSubmit={compare}
      onClose={onClose}
    >
      <div className="dialog-row">
        <label>
          {t('compare.first')}
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {tabs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <label>
          {t('compare.second')}
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {tabs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
      </div>
      {a === b && <p className="dialog-hint">{t('compare.same')}</p>}
      {rows && (
        <div className="compare-body">
          <p role="status">{changed.length === 0 ? t('compare.identical') : tn(t, changed.length, rows.length)}</p>
          {changed.length > 0 && (
            <div className="compare-main">
              <ul className="compare-pages">
                {changed.map((r) => (
                  <li key={r.index}>
                    <button type="button" aria-pressed={selected === r.index} onClick={() => setSelected(r.index)}>
                      {t('compare.page', { number: r.index + 1 })}
                      <span className="count"> {!r.pageA || !r.pageB ? t('compare.missing') : `−${r.removed} +${r.added}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {current && (
                <div className="compare-view">
                  <label className="check">
                    <input type="checkbox" checked={visual} onChange={(e) => setVisual(e.target.checked)} />
                    {t('compare.visual')}
                  </label>
                  {visual ? (
                    <VisualDiff a={current.pageA} b={current.pageB} docs={docs} />
                  ) : (
                    <div className="compare-columns">
                      <p className="compare-text" aria-label={t('compare.first')}>
                        {current.ops.filter((o) => o.type !== 'added').map((o, i) => (o.type === 'removed' ? <del key={i}>{o.text} </del> : `${o.text} `))}
                      </p>
                      <p className="compare-text" aria-label={t('compare.second')}>
                        {current.ops.filter((o) => o.type !== 'removed').map((o, i) => (o.type === 'added' ? <ins key={i}>{o.text} </ins> : `${o.text} `))}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageDialog>
  );
}

const tn = (t: ReturnType<typeof useI18n>['t'], changed: number, total: number) => t('compare.summary', { changed, total });

/** Both pages on top of each other; what is the same turns white, what differs stays dark. */
function VisualDiff({ a, b, docs }: { a: PageRef | undefined; b: PageRef | undefined; docs: Record<string, SourceDoc> }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const load = async (p: PageRef | undefined) => {
      const doc = p && docs[p.docId];
      if (!p || !doc) return null;
      const url = await renderPage(doc, p.srcIndex, { width: 560, rotation: p.rotation, dpr: 1, hidden: p.removed, annots: p.annots, fields: p.fields });
      urls.push(url);
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    };
    Promise.all([load(a), load(b)])
      .then(([ia, ib]) => {
        const el = canvas.current;
        if (cancelled || !el) return;
        const w = Math.max(ia?.width ?? 0, ib?.width ?? 0);
        const h = Math.max(ia?.height ?? 0, ib?.height ?? 0);
        el.width = w;
        el.height = h;
        const ctx = el.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        if (ia) ctx.drawImage(ia, 0, 0);
        ctx.globalCompositeOperation = 'difference';
        if (ib) ctx.drawImage(ib, 0, 0);
        else ctx.fillRect(0, 0, w, h);
        setProblem(false);
      })
      .catch(() => !cancelled && setProblem(true))
      .finally(() => urls.forEach((u) => URL.revokeObjectURL(u)));
    return () => {
      cancelled = true;
    };
  }, [a, b, docs]);

  return problem ? <p className="sign-problem" role="alert">{t('compare.visualFailed')}</p> : <canvas ref={canvas} className="compare-visual" aria-label={t('compare.visual')} />;
}
