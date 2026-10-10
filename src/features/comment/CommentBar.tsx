import { COMMENT_COLORS } from '../../core/annotations';
import { useI18n } from '../../i18n/context';
import type { MessageKey as TKey } from '../../i18n/de';
import { STAMPS, type StampName } from './stamps';
import { FILL_TOOLS, INSERT_TOOLS, TOOLS, type Tool } from './tools';

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  color: string;
  onColor: (color: string) => void;
  stamp: StampName;
  onStamp: (stamp: StampName) => void;
}

/** The comment tools above the pages: pick a tool and a colour, then use it on a page. */
export default function CommentBar({ tool, onTool, color, onColor, stamp, onStamp }: Props) {
  const { t } = useI18n();
  return (
    <div className="comment-bar" role="toolbar" aria-label={t('comment.tools')}>
      <div className="tool-group">
        {TOOLS.map((k) => (
          <button key={k} aria-pressed={tool === k} data-tool={k} onClick={() => onTool(tool === k ? null : k)}>
            {t(`comment.tool.${k}` as TKey)}
          </button>
        ))}
      </div>
      <div className="tool-group" role="group" aria-label={t('comment.fillTools')}>
        {FILL_TOOLS.map((k) => (
          <button key={k} aria-pressed={tool === k} data-tool={k} onClick={() => onTool(tool === k ? null : k)}>
            {t(`comment.tool.${k}` as TKey)}
          </button>
        ))}
      </div>
      <div className="tool-group" role="group" aria-label={t('comment.insertTools')}>
        {INSERT_TOOLS.map((k) => (
          <button key={k} aria-pressed={tool === k} data-tool={k} onClick={() => onTool(tool === k ? null : k)}>
            {t(`comment.tool.${k}` as TKey)}
          </button>
        ))}
      </div>
      {tool === 'stamp' && (
        <select value={stamp} aria-label={t('comment.stampChoice')} onChange={(e) => onStamp(e.target.value as StampName)}>
          {STAMPS.map((s) => (
            <option key={s} value={s}>{t(`stamp.${s}` as TKey)}</option>
          ))}
        </select>
      )}
      <div className="swatches" role="radiogroup" aria-label={t('comment.color')}>
        {COMMENT_COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            className="swatch"
            style={{ background: c }}
            onClick={() => onColor(c)}
          />
        ))}
      </div>
    </div>
  );
}
