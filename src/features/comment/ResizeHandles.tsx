import { useRef, useState } from 'react';
import { screenToPage, type Pt } from '../../core/annotations';
import type { Size } from '../../core/readerLayout';
import { cursorOf, HANDLES, SIDES, type Handle, type LineEnd } from '../../core/resize';
import type { Box } from '../../core/textLayer';

// Fingers need bigger targets than a mouse pointer.
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const HANDLE_PX = COARSE ? 22 : 10;

interface Props {
  /** The corners and edges of a box, or the two ends of a line. */
  grip: 'box' | 'ends';
  box: Box;
  line?: [Pt, Pt];
  size: Size;
  rotation: number;
  scale: number;
  /** A handle is being pulled to this point of the page; `shift` is held. */
  onDrag: (handle: Handle | LineEnd, point: Pt, shift: boolean) => void;
  /** The pointer was released (`true`) or the gesture was cancelled (`false`). */
  onEnd: (done: boolean) => void;
}

/**
 * Handles on the selected object, to be placed inside an svg that sits in the page's layer. They
 * keep the same size on the screen at every zoom. Dragging is reported as points of the page, so
 * a turned page needs no special care here.
 */
export default function ResizeHandles({ grip, box, line, size, rotation, scale, onDrag, onEnd }: Props) {
  const active = useRef<string | null>(null);
  // The handle in the hand stays on screen, even when the box gets too small for the edge handles.
  const [held, setHeld] = useState<string | null>(null);
  const side = HANDLE_PX / scale;
  const at = (e: React.PointerEvent<SVGElement>) => {
    const r = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
    return screenToPage(e.clientX - r.left, e.clientY - r.top, size, rotation, scale);
  };
  const events = (key: Handle | LineEnd) => ({
    onPointerDown: (e: React.PointerEvent<SVGElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = key;
      setHeld(key);
    },
    onPointerMove: (e: React.PointerEvent<SVGElement>) => {
      if (active.current === key) onDrag(key, at(e), e.shiftKey);
    },
    onPointerUp: () => {
      if (active.current === key) onEnd(true);
      active.current = null;
      setHeld(null);
    },
    // Also when the browser takes the pointer away (a scroll, a system gesture).
    onPointerCancel: () => {
      if (active.current === key) onEnd(false);
      active.current = null;
      setHeld(null);
    },
    onLostPointerCapture: () => {
      if (active.current === key) onEnd(false);
      active.current = null;
      setHeld(null);
    },
  });
  // The class makes a press on a handle count as "on the object", so the selection stays.
  const common = { className: 'annot-shape annot-handle', style: { pointerEvents: 'all' as const } };

  if (grip === 'ends') {
    const [p, q] = line ?? [[box[0], box[1]], [box[2], box[3]]];
    return (
      <g>
        {([['start', p], ['end', q]] as const).map(([key, end]) => (
          <circle key={key} {...common} {...events(key)} data-handle={key} cx={end[0]} cy={end[1]} r={side / 2} style={{ ...common.style, cursor: 'crosshair' }} />
        ))}
      </g>
    );
  }
  const [x0, y0, x1, y1] = box;
  // Small objects keep their corners only, so the handles do not cover each other.
  const roomy = Math.min(x1 - x0, y1 - y0) >= side * 3;
  return (
    <g>
      {HANDLES.filter((h) => roomy || h.length === 2 || h === held).map((h) => (
        <rect
          key={h}
          {...common}
          {...events(h)}
          data-handle={h}
          x={x0 + ((x1 - x0) * (SIDES[h][0] + 1)) / 2 - side / 2}
          y={y0 + ((y1 - y0) * (SIDES[h][1] + 1)) / 2 - side / 2}
          width={side}
          height={side}
          style={{ ...common.style, cursor: cursorOf(h, rotation) }}
        />
      ))}
    </g>
  );
}
