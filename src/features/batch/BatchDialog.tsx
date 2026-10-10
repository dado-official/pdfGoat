import { useMemo, useRef, useState } from 'react';
import type { CompressLevel } from '../../core/compress';
import { MARK_PRESETS } from '../../core/markPresets';
import { ALL_ALLOWED, noCleaning } from '../../core/protect';
import { parseWorkflow, STEP_TYPES, type Step, type StepType, type Workflow } from '../../core/workflow';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';
import { applyWorkflow } from '../../pdf/batch';
import { zip } from '../../pdf/build';
import { download } from '../../ui/download';
import PageDialog from '../edit/PageDialog';
import StepEditor from './StepEditor';
import { loadWorkflows, storeWorkflows, withoutSecrets } from './storage';

const NEW_STEP: Record<StepType, () => Step> = {
  mark: () => ({ type: 'mark', ...MARK_PRESETS.number }),
  rotate: () => ({ type: 'rotate', degrees: 90 }),
  crop: () => ({ type: 'crop', margins: { top: 10, right: 10, bottom: 10, left: 10 } }),
  resize: () => ({ type: 'resize', paper: 'a4', orientation: 'keep' }),
  compress: () => ({ type: 'compress', level: 'medium' as CompressLevel }),
  protect: () => ({ type: 'protect', userPassword: '', ownerPassword: '', allow: { ...ALL_ALLOWED } }),
  clean: () => ({ type: 'clean', what: { ...noCleaning(), metadata: true } }),
  flatten: () => ({ type: 'flatten' }),
};

interface Row {
  name: string;
  state: 'waiting' | 'working' | 'done' | 'failed';
  bytes?: Uint8Array;
  error?: string;
}

interface Props {
  date: string;
  onClose: () => void;
}

/** A list of steps that is saved and applied to many files at once. */
export default function BatchDialog({ date, onClose }: Props) {
  const { t, errorText } = useI18n();
  const [saved, setSaved] = useState<Workflow[]>(loadWorkflows);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const importer = useRef<HTMLInputElement>(null);
  const done = rows.filter((r) => r.bytes);

  const current: Workflow = useMemo(() => ({ name: name.trim() || t('batch.unnamed'), steps }), [name, steps, t]);

  function save() {
    const next = [...saved.filter((w) => w.name !== current.name), withoutSecrets(current)];
    setSaved(next);
    setProblem(storeWorkflows(next) ? '' : t('batch.notSaved'));
  }

  function load(n: string) {
    const w = saved.find((x) => x.name === n);
    setName(w?.name ?? '');
    setSteps(w ? structuredClone(w.steps) : []);
    setRows([]);
  }

  async function run() {
    setRunning(true);
    setProblem('');
    setRows(files.map((f) => ({ name: f.name, state: 'waiting' })));
    for (const [i, file] of files.entries()) {
      setRows((r) => r.map((x, k) => (k === i ? { ...x, state: 'working' } : x)));
      const result = await applyWorkflow(file, current, date);
      setRows((r) =>
        r.map((x, k) =>
          k !== i ? x : 'bytes' in result ? { ...x, state: 'done', bytes: result.bytes } : { ...x, state: 'failed', error: errorText(result.error) },
        ),
      );
    }
    setRunning(false);
  }

  async function saveResults() {
    const used = new Set<string>();
    const out = done.map((r) => {
      let base = r.name.replace(/\.pdf$/i, '') + `-${t('batch.suffix')}`;
      while (used.has(base)) base += '-2';
      used.add(base);
      return { name: `${base}.pdf`, bytes: r.bytes! };
    });
    if (out.length === 1) download(out[0].bytes, out[0].name);
    else download(await zip(out), `${t('batch.zipName')}.zip`, 'application/zip');
  }

  return (
    <PageDialog
      wide
      title={t('batch.title')}
      scope={t('batch.scope')}
      submitLabel={t(running ? 'batch.running' : 'batch.run')}
      submitDisabled={running || files.length === 0 || steps.length === 0}
      onSubmit={run}
      onClose={onClose}
      extra={done.length > 0 && !running ? <button type="button" onClick={saveResults}>{t('batch.saveResults')}</button> : null}
    >
      <div className="dialog-row">
        <label>
          {t('batch.saved')}
          <select value={saved.some((w) => w.name === name) ? name : ''} onChange={(e) => load(e.target.value)}>
            <option value="">{t('batch.new')}</option>
            {saved.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
          </select>
        </label>
        <label>
          {t('batch.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('batch.unnamed')} />
        </label>
      </div>
      <div className="edit-actions">
        <button type="button" onClick={save} disabled={steps.length === 0}>{t('batch.save')}</button>
        <button
          type="button"
          disabled={!saved.some((w) => w.name === name)}
          onClick={() => {
            const next = saved.filter((w) => w.name !== name);
            setSaved(next);
            storeWorkflows(next);
            load('');
          }}
        >
          {t('batch.delete')}
        </button>
        <button type="button" disabled={steps.length === 0} onClick={() => download(new TextEncoder().encode(JSON.stringify(withoutSecrets(current), null, 2)), `${current.name}.pdfgoat-ablauf.json`, 'application/json')}>
          {t('batch.export')}
        </button>
        <button type="button" onClick={() => importer.current?.click()}>{t('batch.import')}</button>
        <input
          ref={importer}
          type="file"
          hidden
          accept="application/json,.json"
          data-testid="workflow-input"
          aria-label={t('batch.import')}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const w = parseWorkflow(await f.text());
            if (!w) return setProblem(t('batch.badFile'));
            setName(w.name);
            setSteps(w.steps);
            setProblem('');
          }}
        />
      </div>

      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className="step">
            <div className="step-head">
              <strong>{t(`step.${s.type}` as MessageKey)}</strong>
              <span className="step-buttons">
                <button type="button" aria-label={t('batch.up')} disabled={i === 0} onClick={() => setSteps((l) => swap(l, i, i - 1))}>↑</button>
                <button type="button" aria-label={t('batch.down')} disabled={i === steps.length - 1} onClick={() => setSteps((l) => swap(l, i, i + 1))}>↓</button>
                <button type="button" aria-label={t('batch.removeStep')} onClick={() => setSteps((l) => l.filter((_, k) => k !== i))}>✕</button>
              </span>
            </div>
            <StepEditor step={s} onChange={(next) => setSteps((l) => l.map((x, k) => (k === i ? next : x)))} />
          </li>
        ))}
      </ol>
      {steps.length === 0 && <p className="dialog-hint">{t('batch.noSteps')}</p>}
      <label>
        {t('batch.addStep')}
        <select value="" onChange={(e) => e.target.value && setSteps((l) => [...l, NEW_STEP[e.target.value as StepType]()])}>
          <option value="">–</option>
          {STEP_TYPES.map((k) => <option key={k} value={k}>{t(`step.${k}` as MessageKey)}</option>)}
        </select>
      </label>

      <div className="edit-actions">
        <button type="button" onClick={() => picker.current?.click()}>{t('batch.pick')}</button>
        <span className="dialog-hint">{files.length ? t('batch.chosen', { count: files.length }) : t('batch.noFiles')}</span>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept="application/pdf,.pdf"
          data-testid="batch-input"
          aria-label={t('batch.pick')}
          onChange={(e) => {
            setFiles([...(e.target.files ?? [])]);
            setRows([]);
            e.target.value = '';
          }}
        />
      </div>
      {rows.length > 0 && (
        <ul className="batch-rows">
          {rows.map((r) => (
            <li key={r.name} data-state={r.state}>
              <span>{r.name}</span>
              <span>{r.state === 'failed' ? r.error : t(`batch.state.${r.state}` as MessageKey)}</span>
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="sign-problem" role="alert">{problem}</p>}
    </PageDialog>
  );
}

const swap = <T,>(list: T[], a: number, b: number): T[] => {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};
