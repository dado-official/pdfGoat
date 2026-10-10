import { COMMENT_COLORS } from '../../core/annotations';
import { useI18n } from '../../i18n/context';
import type { MessageKey as TKey } from '../../i18n/de';
import Icon, { type IconName } from '../../ui/Icon';
import { STAMPS, type StampName } from './stamps';
import { EDIT_TOOLS, FIELD_TOOLS, FILL_TOOLS, INSERT_TOOLS, PROTECT_TOOLS, TOOLS, type Tool } from './tools';

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  color: string;
  onColor: (color: string) => void;
  stamp: StampName;
  onStamp: (stamp: StampName) => void;
  /** Search matches that could be redacted, and what to do about them. */
  matchCount: number;
  onRedactMatches: () => void;
  /** Opens the dialog for passwords and the check before giving a file away. */
  onProtect: () => void;
  /** The saved file is protected or cleaned. */
  protectActive: boolean;
}

const GROUPS: { caption: TKey; label: TKey; tools: readonly Exclude<Tool, null>[] }[] = [
  { caption: 'ribbon.comment', label: 'comment.tools', tools: TOOLS },
  { caption: 'ribbon.fill', label: 'comment.fillTools', tools: FILL_TOOLS },
  { caption: 'ribbon.insert', label: 'comment.insertTools', tools: INSERT_TOOLS },
  { caption: 'ribbon.edit', label: 'comment.editTools', tools: EDIT_TOOLS },
  { caption: 'ribbon.fields', label: 'comment.fieldTools', tools: FIELD_TOOLS },
  { caption: 'ribbon.protect', label: 'comment.protectTools', tools: PROTECT_TOOLS },
];

/** The tools above the pages as a ribbon: groups of large buttons, a symbol over a short label. */
export default function CommentBar({ tool, onTool, color, onColor, stamp, onStamp, matchCount, onRedactMatches, onProtect, protectActive }: Props) {
  const { t } = useI18n();
  return (
    <div className="ribbon comment-bar" role="toolbar" aria-label={t('comment.tools')}>
      {GROUPS.map((g) => (
        <div key={g.caption} className="ribbon-group" role="group" aria-label={t(g.label)}>
          <div className="ribbon-buttons">
            {g.tools.map((k) => (
              <button key={k} className="ribbon-button" aria-pressed={tool === k} data-tool={k} onClick={() => onTool(tool === k ? null : k)}>
                <Icon name={k as IconName} size={22} />
                <span>{t(`comment.tool.${k}` as TKey)}</span>
              </button>
            ))}
            {g.caption === 'ribbon.protect' && (
              <>
                <button className="ribbon-button" disabled={matchCount === 0} onClick={onRedactMatches} title={t('redact.matches.title')}>
                  <Icon name="search" size={22} />
                  <span>{t('redact.matches')}</span>
                </button>
                <button className="ribbon-button" aria-pressed={protectActive} onClick={onProtect}>
                  <Icon name="lock" size={22} />
                  <span>{t('protect.open')}</span>
                </button>
              </>
            )}
          </div>
          <span className="ribbon-caption">{t(g.caption)}</span>
        </div>
      ))}
      <div className="ribbon-group" role="group" aria-label={t('comment.color')}>
        <div className="ribbon-buttons ribbon-colors">
          <div className="swatches" role="radiogroup" aria-label={t('comment.color')}>
            {COMMENT_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={color === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => onColor(c)} />
            ))}
          </div>
          {tool === 'stamp' && (
            <select value={stamp} aria-label={t('comment.stampChoice')} onChange={(e) => onStamp(e.target.value as StampName)}>
              {STAMPS.map((s) => (
                <option key={s} value={s}>{t(`stamp.${s}` as TKey)}</option>
              ))}
            </select>
          )}
        </div>
        <span className="ribbon-caption">{t('comment.color')}</span>
      </div>
    </div>
  );
}
