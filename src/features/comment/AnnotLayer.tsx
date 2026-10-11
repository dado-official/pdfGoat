import { useMemo, useState } from 'react';
import {
  arrowHead,
  boundsOf,
  boxBetween,
  screenToPage,
  moveAnnot,
  type Annot,
  type AnnotKind,
  type Pt,
} from '../../core/annotations';
import type { Size } from '../../core/readerLayout';
import { overlayTransform } from '../../core/textLayer';
import { makeStamp, type StampName } from './stamps';
import { FIELD_SIZES, newField, type FieldType } from '../../core/formfields';
import { makeCheck } from './pictures';
import { usePngUrl } from '../../ui/usePngUrl';
import { isDrawTool, type Picture, type Tool } from './tools';

interface Props {
  size: Size;
  rotation: number;
  scale: number;
  annots: Annot[];
  tool: Tool;
  color: string;
  stamp: { name: StampName; text: string };
  /** Today's date as it is written into the page, and the signature or initials waiting to be placed. */
  dateText: string;
  picture: Picture | null;
  /** Name and value for a new form field of a type. */
  fieldDefaults: (type: FieldType) => { name: string; exportValue: string };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (annots: Annot[]) => void;
  /** A comment was placed; the tool is used up (it is picked again for the next one). */
  onPlaced: () => void;
}

const newId = () => crypto.randomUUID();

/** Comments of one page, drawn over it, and the pointer handling that creates and moves them. */
export default function AnnotLayer({ size, rotation, scale, annots, tool, color, stamp, dateText, picture, fieldDefaults, selectedId, onSelect, onChange, onPlaced }: Props) {
  const [draft, setDraft] = useState<{ start: Pt; points: Pt[] } | null>(null);
  const [moving, setMoving] = useState<{ id: string; from: Pt; dx: number; dy: number } | null>(null);
  const drawing = isDrawTool(tool);

  const at = (e: React.PointerEvent, el: Element): Pt => {
    const r = el.getBoundingClientRect();
    return screenToPage(e.clientX - r.left, e.clientY - r.top, size, rotation, scale);
  };

  async function finish(kind: Exclude<NonNullable<Tool>, 'highlight' | 'underline' | 'strikeout'>, d: { start: Pt; points: Pt[] }) {
    const end = d.points.at(-1) ?? d.start;
    const base = { id: newId(), kind: kind as AnnotKind, color, contents: '', created: Date.now() };
    const dist = Math.hypot(end[0] - d.start[0], end[1] - d.start[1]);
    let made: Annot | null = null;
    switch (kind) {
      case 'note':
        made = { ...base, box: [d.start[0], d.start[1], d.start[0] + 20, d.start[1] + 20] };
        break;
      case 'text': {
        const box = dist > 12 ? boxBetween(d.start, end) : ([d.start[0], d.start[1], d.start[0] + 180, d.start[1] + 40] as const);
        made = { ...base, box: [...box], fontSize: 12 };
        break;
      }
      case 'ink':
        if (d.points.length > 1) made = { ...base, box: boundsOf(d.points, 1.5), strokes: [d.points], width: 2 };
        break;
      case 'square':
      case 'circle':
        if (dist > 6) made = { ...base, box: boxBetween(d.start, end), width: 2 };
        break;
      case 'line':
      case 'arrow':
        if (dist > 6) made = { ...base, box: boundsOf([d.start, end], 2), line: [d.start, end], width: 2 };
        break;
      case 'embedText': {
        const box = dist > 12 ? boxBetween(d.start, end) : ([d.start[0], d.start[1], d.start[0] + 200, d.start[1] + 30] as const);
        made = { ...base, kind: 'text', embed: true, box: [...box], fontSize: 12 };
        break;
      }
      case 'fieldText':
      case 'fieldCheck':
      case 'fieldRadio':
      case 'fieldChoice': {
        const type = kind.slice(5).toLowerCase() as FieldType;
        const [w, h] = FIELD_SIZES[type];
        const small = type === 'check' || type === 'radio';
        const box = dist > 8 && !small ? boxBetween(d.start, end) : small ? ([d.start[0] - w / 2, d.start[1] - h / 2, d.start[0] + w / 2, d.start[1] + h / 2] as const) : ([d.start[0], d.start[1], d.start[0] + w, d.start[1] + h] as const);
        const { name, exportValue } = fieldDefaults(type);
        made = { ...base, kind: 'field', color: '#3347c9', box: [...box], field: newField(type, name, exportValue) };
        break;
      }
      case 'redact':
        if (dist > 6) made = { ...base, kind: 'redact', color: '#14161a', box: boxBetween(d.start, end) };
        break;
      case 'link':
        if (dist > 6) made = { ...base, kind: 'link', color: '#3347c9', box: boxBetween(d.start, end) };
        break;
      case 'embedImage': {
        if (!picture) return;
        const w = dist > 12 ? Math.abs(end[0] - d.start[0]) : Math.min(200, picture.ratio >= 1 ? 200 : 200 * picture.ratio);
        const h = w / picture.ratio;
        const x = dist > 12 ? Math.min(d.start[0], end[0]) : d.start[0];
        const y = dist > 12 ? Math.min(d.start[1], end[1]) : d.start[1];
        made = { ...base, kind: 'stamp', embed: true, color: '#14161a', box: [x, y, x + w, y + h], image: picture.bytes };
        break;
      }
      case 'date':
        made = { ...base, kind: 'text', tag: 'date', contents: dateText, box: [d.start[0], d.start[1], d.start[0] + 90, d.start[1] + 18], fontSize: 12 };
        break;
      case 'check': {
        const check = await makeCheck(color);
        made = { ...base, kind: 'stamp', tag: 'check', box: [d.start[0] - 7, d.start[1] - 7, d.start[0] + 7, d.start[1] + 7], image: check.bytes };
        break;
      }
      case 'signature':
      case 'initials': {
        if (!picture) return;
        const w = dist > 12 ? Math.abs(end[0] - d.start[0]) : kind === 'signature' ? 150 : 60;
        const h = w / picture.ratio;
        const x = dist > 12 ? Math.min(d.start[0], end[0]) : d.start[0] - w / 2;
        const y = dist > 12 ? Math.min(d.start[1], end[1]) : d.start[1] - h / 2;
        made = { ...base, kind: 'stamp', tag: kind, color: '#14161a', box: [x, y, x + w, y + h], image: picture.bytes };
        break;
      }
      case 'stamp': {
        const w = dist > 12 ? Math.abs(end[0] - d.start[0]) : 150;
        const h = dist > 12 ? Math.abs(end[1] - d.start[1]) : 48;
        const x = dist > 12 ? Math.min(d.start[0], end[0]) : d.start[0] - w / 2;
        const y = dist > 12 ? Math.min(d.start[1], end[1]) : d.start[1] - h / 2;
        made = { ...base, color: '#14161a', box: [x, y, x + w, y + h], image: await makeStamp(stamp.name, stamp.text, w, h) };
        break;
      }
    }
    if (!made) return;
    onChange([...annots, made]);
    onSelect(made.id);
    onPlaced();
  }

  const shown = useMemo(() => annots.map((a) => (moving && moving.id === a.id ? moveAnnot(a, moving.dx, moving.dy) : a)), [annots, moving]);

  return (
    <>
      <div className="annot-layer" style={{ width: size.width, height: size.height, transform: overlayTransform(size, rotation, scale) }}>
        <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
          {shown.map((a) => (
            <Shape
              key={a.id}
              a={a}
              hit={12 / scale}
              selected={a.id === selectedId}
              onDown={(e) => {
                if (drawing) return;
                e.stopPropagation();
                onSelect(a.id);
                const surface = e.currentTarget.ownerSVGElement!.parentElement!;
                const from = at(e, surface);
                e.currentTarget.setPointerCapture(e.pointerId);
                setMoving({ id: a.id, from, dx: 0, dy: 0 });
              }}
              onMove={(e) => {
                if (!moving || moving.id !== a.id) return;
                const p = at(e, e.currentTarget.ownerSVGElement!.parentElement!);
                setMoving({ ...moving, dx: p[0] - moving.from[0], dy: p[1] - moving.from[1] });
              }}
              onUp={() => {
                if (moving && moving.id === a.id && (moving.dx || moving.dy)) {
                  onChange(annots.map((x) => (x.id === a.id ? moveAnnot(x, moving.dx, moving.dy) : x)));
                }
                setMoving(null);
              }}
            />
          ))}
          {draft && drawing && <Draft tool={tool} color={color} d={draft} />}
        </svg>
        {shown.filter((a) => a.kind === 'text').map((a) => (
          <div
            key={a.id}
            className={a.id === selectedId ? 'annot-text selected' : 'annot-text'}
            style={{ left: a.box[0], top: a.box[1], width: a.box[2] - a.box[0], height: a.box[3] - a.box[1], color: a.color, fontSize: a.fontSize ?? 12 }}
            data-annot={a.id}
            onPointerDown={(e) => {
              if (drawing) return;
              e.stopPropagation();
              onSelect(a.id);
              const surface = e.currentTarget.parentElement!;
              e.currentTarget.setPointerCapture(e.pointerId);
              setMoving({ id: a.id, from: at(e, surface), dx: 0, dy: 0 });
            }}
            onPointerMove={(e) => {
              if (!moving || moving.id !== a.id) return;
              const p = at(e, e.currentTarget.parentElement!);
              setMoving({ ...moving, dx: p[0] - moving.from[0], dy: p[1] - moving.from[1] });
            }}
            onPointerUp={() => {
              if (moving && moving.id === a.id && (moving.dx || moving.dy)) {
                onChange(annots.map((x) => (x.id === a.id ? moveAnnot(x, moving.dx, moving.dy) : x)));
              }
              setMoving(null);
            }}
          >
            {a.contents}
          </div>
        ))}
      </div>
      {drawing && (
        <div
          className="annot-capture"
          data-tool={tool}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = at(e, e.currentTarget);
            setDraft({ start: p, points: [p] });
          }}
          onPointerMove={(e) => {
            if (!draft) return;
            const p = at(e, e.currentTarget);
            setDraft({ ...draft, points: tool === 'ink' ? [...draft.points, p] : [p] });
          }}
          onPointerUp={(e) => {
            if (!draft) return;
            const p = at(e, e.currentTarget);
            const d = { start: draft.start, points: tool === 'ink' ? [...draft.points, p] : [p] };
            setDraft(null);
            void finish(tool, d);
          }}
          onPointerCancel={() => setDraft(null)}
        />
      )}
    </>
  );
}

interface ShapeProps {
  a: Annot;
  /** Width in page points of the area around a line that still grabs it (about 12 screen pixels). */
  hit: number;
  selected: boolean;
  onDown: (e: React.PointerEvent<SVGElement>) => void;
  onMove: (e: React.PointerEvent<SVGElement>) => void;
  onUp: (e: React.PointerEvent<SVGElement>) => void;
}

function Shape({ a, hit, selected, onDown, onMove, onUp }: ShapeProps) {
  const handlers = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp };
  const stroke = { stroke: a.color, strokeWidth: a.width ?? 1.5, fill: 'none', className: 'annot-shape' };
  // A wide invisible copy of the line under the visible one, so thin lines are easy to grab.
  const grab = { className: 'annot-shape', stroke: 'transparent', strokeWidth: Math.max(a.width ?? 1.5, hit), fill: 'none' };
  const ring = selected ? (
    <rect className="annot-ring" x={a.box[0] - 3} y={a.box[1] - 3} width={a.box[2] - a.box[0] + 6} height={a.box[3] - a.box[1] + 6} />
  ) : null;
  switch (a.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return (
        <g className="annot-markup" data-selected={selected || undefined}>
          {(a.quads ?? [a.box]).map((q, i) =>
            a.kind === 'highlight' ? (
              <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0]} height={q[3] - q[1]} fill={a.color} opacity={0.4} style={{ mixBlendMode: 'multiply' }} />
            ) : (
              <line key={i} x1={q[0]} x2={q[2]} y1={a.kind === 'underline' ? q[3] - 1 : (q[1] + q[3]) / 2} y2={a.kind === 'underline' ? q[3] - 1 : (q[1] + q[3]) / 2} stroke={a.color} strokeWidth={1} />
            ),
          )}
          {selected && ring}
        </g>
      );
    case 'note':
      return (
        <g {...handlers} className="annot-shape annot-note" style={{ pointerEvents: 'all' }}>
          <rect x={a.box[0]} y={a.box[1]} width={20} height={20} rx={4} fill={a.color} stroke="#fff" strokeWidth={1} />
          <path d={`M${a.box[0] + 5} ${a.box[1] + 7}h10M${a.box[0] + 5} ${a.box[1] + 11}h10M${a.box[0] + 5} ${a.box[1] + 15}h6`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
          {ring}
        </g>
      );
    case 'text':
      return selected ? <g>{ring}</g> : null;
    case 'ink':
      return (
        <g {...handlers} style={{ pointerEvents: 'stroke' }}>
          {(a.strokes ?? []).map((s, i) => (
            <polyline key={i} {...stroke} points={s.map((p) => p.join(',')).join(' ')} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {(a.strokes ?? []).map((s, i) => (
            <polyline key={`grab${i}`} {...grab} points={s.map((p) => p.join(',')).join(' ')} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {ring}
        </g>
      );
    case 'square':
      return (
        <g {...handlers} style={{ pointerEvents: 'stroke' }}>
          <rect {...stroke} x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} />
          <rect {...grab} x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} />
          {ring}
        </g>
      );
    case 'circle':
      return (
        <g {...handlers} style={{ pointerEvents: 'stroke' }}>
          <ellipse {...stroke} cx={(a.box[0] + a.box[2]) / 2} cy={(a.box[1] + a.box[3]) / 2} rx={(a.box[2] - a.box[0]) / 2} ry={(a.box[3] - a.box[1]) / 2} />
          <ellipse {...grab} cx={(a.box[0] + a.box[2]) / 2} cy={(a.box[1] + a.box[3]) / 2} rx={(a.box[2] - a.box[0]) / 2} ry={(a.box[3] - a.box[1]) / 2} />
          {ring}
        </g>
      );
    case 'line':
    case 'arrow': {
      const [p, q] = a.line ?? [[a.box[0], a.box[1]], [a.box[2], a.box[3]]];
      const head = a.kind === 'arrow' ? arrowHead(p, q, 10) : null;
      return (
        <g {...handlers} style={{ pointerEvents: 'stroke' }}>
          <line {...grab} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeLinecap="round" />
          <line {...stroke} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeLinecap="round" />
          {head && <polyline {...stroke} points={`${head[0].join(',')} ${q.join(',')} ${head[1].join(',')}`} strokeLinecap="round" strokeLinejoin="round" />}
          {ring}
        </g>
      );
    }
    case 'field': {
      const f = a.field;
      const radio = f?.type === 'radio';
      return (
        <g {...handlers} className="annot-shape" style={{ pointerEvents: 'all' }}>
          {radio ? (
            <ellipse cx={(a.box[0] + a.box[2]) / 2} cy={(a.box[1] + a.box[3]) / 2} rx={(a.box[2] - a.box[0]) / 2} ry={(a.box[3] - a.box[1]) / 2} fill="rgb(51 71 201 / 0.1)" stroke={a.color} strokeWidth={1} />
          ) : (
            <rect x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} fill="rgb(51 71 201 / 0.1)" stroke={a.color} strokeWidth={1} />
          )}
          {f && (f.type === 'text' || f.type === 'choice') && (
            <text x={a.box[0] + 3} y={(a.box[1] + a.box[3]) / 2 + 3} fontSize={Math.min(10, (a.box[3] - a.box[1]) * 0.6)} fill={a.color} style={{ pointerEvents: 'none' }}>
              {f.name}
              {f.type === 'choice' ? ' ▾' : ''}
            </text>
          )}
          {ring}
        </g>
      );
    }
    case 'redact':
      return (
        <g {...handlers} className="annot-shape" style={{ pointerEvents: 'all' }}>
          <rect x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} fill="rgb(20 22 26 / 0.5)" stroke="#e5484d" strokeWidth={1.2} strokeDasharray="4 3" />
          {ring}
        </g>
      );
    case 'link':
      return (
        <g {...handlers} className="annot-shape" style={{ pointerEvents: 'all' }}>
          <rect x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} fill="rgb(51 71 201 / 0.1)" stroke={a.color} strokeWidth={1} strokeDasharray="4 3" />
          {ring}
        </g>
      );
    case 'stamp':
      return (
        <g {...handlers} style={{ pointerEvents: 'all' }}>
          <StampImage a={a} />
          {ring}
        </g>
      );
  }
}

function StampImage({ a }: { a: Annot }) {
  const url = usePngUrl(a.image);
  return <image href={url} x={a.box[0]} y={a.box[1]} width={a.box[2] - a.box[0]} height={a.box[3] - a.box[1]} preserveAspectRatio="none" />;
}

function Draft({ tool, color, d }: { tool: NonNullable<Tool>; color: string; d: { start: Pt; points: Pt[] } }) {
  const end = d.points.at(-1) ?? d.start;
  const common = { stroke: color, strokeWidth: 2, fill: 'none', strokeDasharray: tool === 'ink' ? undefined : '4 3' };
  if (tool === 'ink') return <polyline {...common} points={d.points.map((p) => p.join(',')).join(' ')} strokeLinecap="round" strokeLinejoin="round" />;
  if (tool === 'line' || tool === 'arrow') return <line {...common} x1={d.start[0]} y1={d.start[1]} x2={end[0]} y2={end[1]} />;
  const b = boxBetween(d.start, end);
  if (tool === 'circle') return <ellipse {...common} cx={(b[0] + b[2]) / 2} cy={(b[1] + b[3]) / 2} rx={(b[2] - b[0]) / 2} ry={(b[3] - b[1]) / 2} />;
  if (tool === 'square' || tool === 'text' || tool === 'stamp' || tool === 'signature' || tool === 'initials' || tool === 'embedText' || tool === 'embedImage' || tool === 'link' || tool === 'redact' || tool === 'fieldText' || tool === 'fieldCheck' || tool === 'fieldRadio' || tool === 'fieldChoice') return <rect {...common} x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} />;
  return null;
}
