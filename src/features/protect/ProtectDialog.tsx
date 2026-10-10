import { useEffect, useState } from 'react';
import { noCleaning, noProtection, passwordProblem, type Cleaning, type Protection } from '../../core/protect';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import { inspectDoc, type Inspection, type SourceDoc } from '../../pdf/view';
import PageDialog from '../edit/PageDialog';

interface Props {
  protect: Protection | null;
  clean: Cleaning;
  /** The files that make up the pages of this tab. */
  docs: SourceDoc[];
  onApply: (protect: Protection | null, clean: Cleaning) => void;
  onClose: () => void;
}

type Tab = 'password' | 'check';

const CLEAN_KEYS = ['metadata', 'attachments', 'comments', 'thumbnails', 'scripts'] as const;

/** Password and permissions for the saved file, and the check of what a file carries before it is given away. */
export default function ProtectDialog({ protect, clean, docs, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('password');
  const [p, setP] = useState<Protection>(protect ?? noProtection());
  const [c, setC] = useState<Cleaning>(clean);
  const [reports, setReports] = useState<{ name: string; report: Inspection | null }[] | null>(null);
  const problem = passwordProblem(p.userPassword) || passwordProblem(p.ownerPassword);

  useEffect(() => {
    if (tab !== 'check' || reports) return;
    let cancelled = false;
    Promise.all(docs.map(async (d) => ({ name: d.name, report: await inspectDoc(d).catch(() => null) }))).then((r) => !cancelled && setReports(r));
    return () => {
      cancelled = true;
    };
  }, [tab, reports, docs]);

  const total = (pick: (r: Inspection) => number) => (reports ?? []).reduce((n, r) => n + (r.report ? pick(r.report) : 0), 0);
  const counts: Record<(typeof CLEAN_KEYS)[number], number | null> = {
    metadata: null,
    attachments: reports && total((r) => r.attachments.length),
    comments: reports && total((r) => r.comments),
    thumbnails: reports && total((r) => r.thumbnails),
    scripts: reports && total((r) => (r.scripts ? 1 : 0)),
  };
  const allow = (key: keyof Protection['allow']) => (
    <label key={key} className="check">
      <input type="checkbox" checked={p.allow[key]} onChange={(e) => setP({ ...p, allow: { ...p.allow, [key]: e.target.checked } })} />
      {t(`protect.allow.${key}` as MessageKey)}
    </label>
  );

  return (
    <PageDialog
      title={t('protect.title')}
      scope={t('protect.scope')}
      submitLabel={t('protect.apply')}
      submitDisabled={problem}
      onSubmit={() => {
        onApply(p.userPassword || p.ownerPassword || Object.values(p.allow).some((v) => !v) ? p : null, c);
        onClose();
      }}
      onClose={onClose}
    >
      <div className="side-tabs" role="tablist">
        {(['password', 'check'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`protect.tab.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      {tab === 'password' ? (
        <>
          <p className="dialog-hint">{t('protect.hint')}</p>
          <label>
            {t('protect.user')}
            <input type="password" autoComplete="new-password" value={p.userPassword} onChange={(e) => setP({ ...p, userPassword: e.target.value })} />
          </label>
          <label>
            {t('protect.owner')}
            <input type="password" autoComplete="new-password" value={p.ownerPassword} onChange={(e) => setP({ ...p, ownerPassword: e.target.value })} />
            <small>{t('protect.ownerHint')}</small>
          </label>
          {problem && <p className="sign-problem" role="alert">{t('protect.badPassword')}</p>}
          <fieldset className="permissions">
            <legend>{t('protect.allow')}</legend>
            {(['print', 'copy', 'edit', 'annotate'] as const).map(allow)}
          </fieldset>
          <p className="dialog-hint">{t('protect.remove')}</p>
        </>
      ) : (
        <>
          <p className="dialog-hint">{t('protect.checkHint')}</p>
          {!reports ? (
            <p className="dialog-hint">{t('protect.checking')}</p>
          ) : (
            <ul className="report">
              {reports.map(({ name, report }) => (
                <li key={name}>
                  <strong>{name}</strong>
                  {report ? (
                    <dl>
                      {([['title', report.title], ['author', report.author], ['subject', report.subject], ['keywords', report.keywords], ['creator', report.creator]] as const)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}><dt>{t(`protect.info.${k}` as MessageKey)}</dt><dd>{v}</dd></div>
                        ))}
                      <div><dt>{t('protect.info.layers')}</dt><dd>{report.layers}</dd></div>
                      <div><dt>{t('protect.info.fields')}</dt><dd>{report.fields}</dd></div>
                      {report.attachments.length > 0 && <div><dt>{t('protect.info.attachments')}</dt><dd>{report.attachments.join(', ')}</dd></div>}
                    </dl>
                  ) : (
                    <p className="dialog-hint">{t('protect.unreadable')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {reports && total((r) => r.layers) > 0 && <p className="dialog-hint">{t('protect.layersHint')}</p>}
          <fieldset className="permissions">
            <legend>{t('protect.removeLegend')}</legend>
            {CLEAN_KEYS.map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} />
                {t(`protect.clean.${k}` as MessageKey)}
                {counts[k] !== null && counts[k] !== undefined && <span className="count"> ({counts[k]})</span>}
              </label>
            ))}
            <button type="button" className="comment-delete" onClick={() => setC(noCleaning())}>{t('protect.cleanNone')}</button>
          </fieldset>
        </>
      )}
    </PageDialog>
  );
}
