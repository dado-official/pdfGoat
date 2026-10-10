import { COMMENT_COLORS } from '../../core/annotations';
import type { CompressLevel } from '../../core/compress';
import { MARK_PRESETS, type MarkPreset } from '../../core/markPresets';
import { MARK_PLACES } from '../../core/marks';
import { PAPER_NAMES } from '../../core/paper';
import { passwordProblem, type Cleaning } from '../../core/protect';
import type { Step } from '../../core/workflow';
import type { MessageKey } from '../../i18n/de';
import { useI18n } from '../../i18n/context';

interface Props {
  step: Step;
  onChange: (step: Step) => void;
}

const CLEAN_KEYS = ['metadata', 'attachments', 'comments', 'thumbnails', 'scripts'] as const;

/** The settings of one step of a workflow. */
export default function StepEditor({ step, onChange }: Props) {
  const { t } = useI18n();
  const num = (v: string, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Number(v) || fallback));

  switch (step.type) {
    case 'mark':
      return (
        <div className="step-fields">
          <label>
            {t('mark.preset')}
            <select
              value=""
              onChange={(e) => {
                const p = MARK_PRESETS[e.target.value as MarkPreset];
                if (p) onChange({ type: 'mark', ...p, text: p.text || step.text });
              }}
            >
              <option value="">–</option>
              {(Object.keys(MARK_PRESETS) as MarkPreset[]).map((p) => (
                <option key={p} value={p}>{t(`mark.preset.${p}` as MessageKey)}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            {t('mark.text')}
            <input value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} />
          </label>
          <label>
            {t('mark.place')}
            <select value={step.place} onChange={(e) => onChange({ ...step, place: e.target.value as typeof step.place, diagonal: e.target.value === 'center' ? step.diagonal : false })}>
              {MARK_PLACES.map((p) => <option key={p} value={p}>{t(`mark.place.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          <label>
            {t('mark.size')}
            <input type="number" min={6} max={200} value={step.size} onChange={(e) => onChange({ ...step, size: num(e.target.value, 6, 200, 10) })} />
          </label>
          <label>
            {t('mark.color')}
            <select value={step.color} onChange={(e) => onChange({ ...step, color: e.target.value })}>
              {COMMENT_COLORS.map((c) => <option key={c} value={c}>{t(`mark.color.${c.slice(1)}` as MessageKey)}</option>)}
            </select>
          </label>
          {step.place === 'center' && (
            <label className="check">
              <input type="checkbox" checked={step.diagonal} onChange={(e) => onChange({ ...step, diagonal: e.target.checked })} />
              {t('mark.diagonal')}
            </label>
          )}
        </div>
      );
    case 'rotate':
      return (
        <div className="step-fields">
          <label>
            {t('step.rotate.by')}
            <select value={step.degrees} onChange={(e) => onChange({ type: 'rotate', degrees: Number(e.target.value) as 90 | 180 | 270 })}>
              {([90, 180, 270] as const).map((d) => <option key={d} value={d}>{t(`step.rotate.${d}` as MessageKey)}</option>)}
            </select>
          </label>
        </div>
      );
    case 'crop':
      return (
        <div className="step-fields">
          {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
            <label key={k}>
              {t(`crop.${k}`)}
              <input type="number" min={0} max={500} value={step.margins[k]} onChange={(e) => onChange({ ...step, margins: { ...step.margins, [k]: num(e.target.value, 0, 500, 0) } })} />
            </label>
          ))}
          <p className="dialog-hint wide">{t('crop.unit')}</p>
        </div>
      );
    case 'resize':
      return (
        <div className="step-fields">
          <label>
            {t('resize.paper')}
            <select value={step.paper} onChange={(e) => onChange({ ...step, paper: e.target.value as typeof step.paper })}>
              {PAPER_NAMES.map((p) => <option key={p} value={p}>{t(`resize.paper.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          <label>
            {t('resize.orientation')}
            <select value={step.orientation} onChange={(e) => onChange({ ...step, orientation: e.target.value as typeof step.orientation })}>
              {(['keep', 'portrait', 'landscape'] as const).map((o) => <option key={o} value={o}>{t(`resize.orientation.${o}` as MessageKey)}</option>)}
            </select>
          </label>
        </div>
      );
    case 'compress':
      return (
        <div className="step-fields">
          <label className="wide">
            {t('compress.level')}
            <select value={step.level} onChange={(e) => onChange({ type: 'compress', level: e.target.value as CompressLevel })}>
              {(['light', 'medium', 'strong'] as const).map((l) => <option key={l} value={l}>{t(`compress.level.${l}` as MessageKey)}</option>)}
            </select>
          </label>
        </div>
      );
    case 'protect': {
      const bad = passwordProblem(step.userPassword) || passwordProblem(step.ownerPassword);
      return (
        <div className="step-fields">
          <label>
            {t('protect.user')}
            <input type="password" autoComplete="new-password" value={step.userPassword} onChange={(e) => onChange({ ...step, userPassword: e.target.value })} />
          </label>
          <label>
            {t('protect.owner')}
            <input type="password" autoComplete="new-password" value={step.ownerPassword} onChange={(e) => onChange({ ...step, ownerPassword: e.target.value })} />
          </label>
          {bad && <p className="sign-problem wide" role="alert">{t('protect.badPassword')}</p>}
          {(['print', 'copy', 'edit', 'annotate'] as const).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={step.allow[k]} onChange={(e) => onChange({ ...step, allow: { ...step.allow, [k]: e.target.checked } })} />
              {t(`protect.allow.${k}` as MessageKey)}
            </label>
          ))}
          <p className="dialog-hint wide">{t('batch.secrets')}</p>
        </div>
      );
    }
    case 'clean':
      return (
        <div className="step-fields">
          {CLEAN_KEYS.map((k) => (
            <label key={k} className="check wide">
              <input type="checkbox" checked={step.what[k]} onChange={(e) => onChange({ ...step, what: { ...step.what, [k]: e.target.checked } as Cleaning })} />
              {t(`protect.clean.${k}` as MessageKey)}
            </label>
          ))}
        </div>
      );
    case 'flatten':
      return <p className="dialog-hint">{t('toolbar.flatten.title')}</p>;
  }
}
