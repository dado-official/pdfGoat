import { useEffect, useRef, useState } from 'react';
import type { Size } from '../../core/readerLayout';
import { overlayTransform } from '../../core/textLayer';
import type { FormField } from '../../pdf/view';

interface Props {
  fields: FormField[];
  /** Values typed so far, by the field's position among the page's widgets. */
  values: Record<number, string>;
  size: Size;
  rotation: number;
  scale: number;
  /** A drawing tool is active; the fields give way to it. */
  inactive: boolean;
  onChange: (values: Record<number, string>) => void;
}

/** The fields of a page as controls over the page. The page itself is drawn without its fields. */
export default function FormLayer({ fields, values, size, rotation, scale, inactive, onChange }: Props) {
  const valueOf = (f: FormField) => values[f.index] ?? f.value;

  /** The values with one field set; a field that is back to what the file has is dropped. */
  function set(f: FormField, value: string) {
    const next = { ...values };
    if (value === f.value) delete next[f.index];
    else next[f.index] = value;
    onChange(next);
  }

  function choose(f: FormField) {
    // Radio buttons of one group: choosing one clears the others.
    const next = { ...values };
    for (const other of fields) {
      if (other.kind !== 'radio' || other.name !== f.name) continue;
      const on = other.index === f.index ? 'on' : 'off';
      if (on === other.value) delete next[other.index];
      else next[other.index] = on;
    }
    onChange(next);
  }

  if (!fields.length) return null;
  return (
    <div
      className="form-layer"
      style={{ width: size.width, height: size.height, transform: overlayTransform(size, rotation, scale), pointerEvents: inactive ? 'none' : undefined }}
    >
      {fields.map((f) => {
        const [x0, y0, x1, y1] = f.box;
        const style = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
        const label = f.name;
        if (f.kind === 'check' || f.kind === 'radio') {
          const on = valueOf(f) === 'on';
          return (
            <button
              key={f.index}
              type="button"
              role={f.kind === 'check' ? 'checkbox' : 'radio'}
              aria-checked={on}
              aria-label={label}
              disabled={f.readOnly}
              className={`form-field form-${f.kind}`}
              style={style}
              onClick={() => (f.kind === 'check' ? set(f, on ? 'off' : 'on') : choose(f))}
            >
              {on && (f.kind === 'check' ? <svg viewBox="0 0 10 10"><path d="M1.8 5.4l2.2 2.3 4.4-5.2" /></svg> : <span className="dot" />)}
            </button>
          );
        }
        if (f.kind === 'choice') {
          return (
            <select
              key={f.index}
              className="form-field"
              style={{ ...style, fontSize: Math.max(6, Math.min(12, (y1 - y0) * 0.6)) }}
              aria-label={label}
              disabled={f.readOnly}
              value={valueOf(f)}
              onChange={(e) => set(f, e.target.value)}
            >
              <option value="" />
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          );
        }
        return (
          // The value is part of the key: a value that changes from outside (undo, redo) starts the field afresh.
          <TextField
            key={`${f.index}:${valueOf(f)}`}
            field={f}
            style={{ ...style, fontSize: Math.max(6, Math.min(12, (y1 - y0) * 0.6)) }}
            label={label}
            value={valueOf(f)}
            onCommit={(v) => set(f, v)}
          />
        );
      })}
    </div>
  );
}

/** A text field that records its value when it is left, so one typed text is one change. */
function TextField({ field, style, label, value, onCommit }: { field: FormField; style: React.CSSProperties; label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: commit } = latest.current;
      if (d !== v) commit(d);
    },
    [],
  );
  const common = {
    className: 'form-field',
    style,
    'aria-label': label,
    disabled: field.readOnly,
    value: draft,
    maxLength: field.maxLength > 0 ? field.maxLength : undefined,
    onBlur: () => draft !== value && onCommit(draft),
  };
  return field.multiline ? (
    <textarea {...common} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input
      {...common}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
