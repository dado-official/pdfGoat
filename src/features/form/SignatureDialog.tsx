import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { fromCanvas, imagePicture, loadSaved, save, typedPicture } from '../comment/pictures';
import type { Picture } from '../comment/tools';

type Kind = 'signature' | 'initials';
type Mode = 'saved' | 'draw' | 'type' | 'image';

interface Props {
  kind: Kind;
  color: string;
  onDone: (picture: Picture | null) => void;
}

/** Makes a signature or initials: draw it, type it or load a picture. It can be remembered in this browser. */
export default function SignatureDialog({ kind, color, onDone }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState(() => loadSaved(kind));
  const [mode, setMode] = useState<Mode>(saved ? 'saved' : 'draw');
  const [text, setText] = useState('');
  const [file, setFile] = useState<Picture | null>(null);
  const [remember, setRemember] = useState(false);
  const [inked, setInked] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const savedUrl = useMemo(() => (saved ? URL.createObjectURL(new Blob([saved.bytes as BlobPart], { type: 'image/png' })) : ''), [saved]);
  useEffect(() => () => URL.revokeObjectURL(savedUrl), [savedUrl]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  }

  async function use() {
    setProblem('');
    let picture: Picture | null = null;
    if (mode === 'saved') picture = saved;
    else if (mode === 'draw' && canvas.current) picture = await fromCanvas(canvas.current);
    else if (mode === 'type') picture = await typedPicture(text, '#14161a');
    else picture = file;
    if (!picture) return setProblem(t('sign.empty'));
    if (remember && mode !== 'saved') save(kind, picture);
    onDone(picture);
  }

  const modes: Mode[] = saved ? ['saved', 'draw', 'type', 'image'] : ['draw', 'type', 'image'];
  return (
    <dialog ref={dialog} className="split sign" aria-labelledby="sign-title" onClose={() => onDone(null)}>
      <h2 id="sign-title">{t(kind === 'signature' ? 'sign.title' : 'sign.titleInitials')}</h2>
      <div className="side-tabs" role="tablist">
        {modes.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {t(`sign.mode.${m}` as 'sign.mode.draw')}
          </button>
        ))}
      </div>
      <div className="sign-body">
        {mode === 'saved' && saved && (
          <div className="sign-saved">
            <img src={savedUrl} alt={t('sign.savedAlt')} />
            <button
              className="comment-delete"
              onClick={() => {
                save(kind, null);
                setSaved(null);
                setMode('draw');
              }}
            >
              {t('sign.forget')}
            </button>
          </div>
        )}
        {mode === 'draw' && (
          <>
            <canvas
              ref={canvas}
              className="sign-canvas"
              width={720}
              height={240}
              aria-label={t('sign.canvas')}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const ctx = e.currentTarget.getContext('2d')!;
                ctx.strokeStyle = '#14161a';
                ctx.lineWidth = 5;
                ctx.lineCap = ctx.lineJoin = 'round';
                const [x, y] = point(e);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + 0.1, y);
                ctx.stroke();
                setInked(true);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = e.currentTarget.getContext('2d')!;
                const [x, y] = point(e);
                ctx.lineTo(x, y);
                ctx.stroke();
              }}
              onPointerUp={() => (drawing.current = false)}
            />
            <button
              className="comment-delete"
              disabled={!inked}
              onClick={() => {
                canvas.current?.getContext('2d')?.clearRect(0, 0, 720, 240);
                setInked(false);
              }}
            >
              {t('sign.clear')}
            </button>
          </>
        )}
        {mode === 'type' && (
          <>
            <input className="sign-type" value={text} placeholder={t('sign.typePlaceholder')} aria-label={t('sign.typeLabel')} onChange={(e) => setText(e.target.value)} />
            <p className="sign-preview" style={{ color }}>{text}</p>
          </>
        )}
        {mode === 'image' && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={t('sign.imageLabel')}
            data-testid="sign-image"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setFile(await imagePicture(f));
                setProblem('');
              } catch {
                setFile(null);
                setProblem(t('sign.imageFailed'));
              }
            }}
          />
        )}
      </div>
      {mode !== 'saved' && (
        <label className="sign-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('sign.remember')}
        </label>
      )}
      {problem && <p className="sign-problem" role="alert">{problem}</p>}
      <div className="dialog-buttons">
        <button onClick={() => onDone(null)}>{t('split.cancel')}</button>
        <button className="primary" onClick={use}>{t('sign.use')}</button>
      </div>
    </dialog>
  );
}
