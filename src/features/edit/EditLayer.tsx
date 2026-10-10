import { useEffect, useMemo, useState } from 'react';
import { screenToPage, type Pt } from '../../core/annotations';
import { lineBox, moveBox, type Edit } from '../../core/edits';
import type { Size } from '../../core/readerLayout';
import { overlayTransform, type Box } from '../../core/textLayer';
import type { TextLine } from '../../pdf/view';

interface Props {
  size: Size;
  rotation: number;
  scale: number;
  edits: Edit[];
  tool: 'editText' | 'editImage' | null;
  /** Text lines and picture boxes of the page, for picking. */
  lines: TextLine[];
  images: Box[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (edits: Edit[]) => void;
  onPickLine: (line: TextLine) => void;
  onPickImage: (index: number, box: Box) => void;
}

const FAMILY = (e: Extract<Edit, { kind: 'text' }>) =>
  e.font.mono ? '"Courier New", Courier, monospace' : e.font.serif ? '"Times New Roman", Times, serif' : 'Helvetica, Arial, sans-serif';

const boxStyle = (b: Box, pad = 0) => ({ left: b[0] - pad, top: b[1] - pad, width: b[2] - b[0] + 2 * pad, height: b[3] - b[1] + 2 * pad });

/** Changes to existing text and pictures, drawn over the page, and the picking of what to change. */
export default function EditLayer({ size, rotation, scale, edits, tool, lines, images, selectedId, onSelect, onChange, onPickLine, onPickImage }: Props) {
  const [moving, setMoving] = useState<{ id: string; from: Pt; dx: number; dy: number } | null>(null);
  const at = (e: React.PointerEvent, el: Element): Pt => {
    const r = el.getBoundingClientRect();
    return screenToPage(e.clientX - r.left, e.clientY - r.top, size, rotation, scale);
  };
  if (!edits.length && !tool) return null;
  const level = { width: size.width, height: size.height, transform: overlayTransform(size, rotation, scale) };

  return (
    <div className="annot-layer edit-layer" style={level}>
      {edits.map((e) => {
        const selected = e.id === selectedId;
        if (e.kind === 'text') {
          return (
            <div key={e.id}>
              <div className="edit-cover" style={boxStyle(e.box, 1.5)} />
              <div
                className={selected ? 'edit-text selected' : 'edit-text'}
                data-annot={e.id}
                style={{
                  left: e.baseline[0],
                  top: e.baseline[1] - e.size * 0.86,
                  fontSize: e.size,
                  lineHeight: `${e.size}px`,
                  color: e.color,
                  fontFamily: FAMILY(e),
                  fontWeight: e.font.bold ? 700 : 400,
                  fontStyle: e.font.italic ? 'italic' : 'normal',
                }}
                onPointerDown={() => onSelect(e.id)}
              >
                {e.text}
              </div>
            </div>
          );
        }
        const live = moving?.id === e.id && e.target ? moveBox(e.target, moving.dx, moving.dy) : e.target;
        return (
          <div key={e.id}>
            <div className="edit-cover" style={boxStyle(e.box, 0.5)} />
            {live && (
              <EditPicture
                png={e.png}
                style={boxStyle(live)}
                selected={selected}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onSelect(e.id);
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  setMoving({ id: e.id, from: at(ev, ev.currentTarget.parentElement!), dx: 0, dy: 0 });
                }}
                onPointerMove={(ev) => {
                  if (!moving || moving.id !== e.id) return;
                  const p = at(ev, ev.currentTarget.parentElement!);
                  setMoving({ ...moving, dx: p[0] - moving.from[0], dy: p[1] - moving.from[1] });
                }}
                onPointerUp={() => {
                  if (moving && moving.id === e.id && (moving.dx || moving.dy) && e.target) {
                    const target = moveBox(e.target, moving.dx, moving.dy);
                    onChange(edits.map((x) => (x.id === e.id && x.kind === 'image' ? { ...x, target } : x)));
                  }
                  setMoving(null);
                }}
              />
            )}
          </div>
        );
      })}
      {tool === 'editText' &&
        lines
          .filter((l) => Math.abs(l.dy) < 0.01 && l.dx > 0)
          .map((l, i) => (
            <button key={i} type="button" className="edit-pick" style={boxStyle(lineBox(l.x, l.y, l.length, l.size))} aria-label={l.text} onClick={() => onPickLine(l)} />
          ))}
      {tool === 'editImage' &&
        images.map((b, i) => (
          <button key={i} type="button" className="edit-pick edit-pick-image" style={boxStyle(b)} aria-label={`#${i + 1}`} onClick={() => onPickImage(i, b)} />
        ))}
    </div>
  );
}

function EditPicture({ png, style, selected, ...handlers }: { png: Uint8Array; style: React.CSSProperties; selected: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const url = useMemo(() => URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })), [png]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className={selected ? 'edit-picture selected' : 'edit-picture'} data-annot="picture" style={style} {...handlers}>
      <img src={url} alt="" draggable={false} />
    </div>
  );
}
