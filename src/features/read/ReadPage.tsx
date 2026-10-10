import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Size } from '../../core/readerLayout';
import { safeExternalUrl } from '../../core/outline';
import { lineStyle, overlayTransform, type Box } from '../../core/textLayer';
import { markPosition, markText } from '../../core/marks';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { getFields, getImagePng, getImages, getLinks, getText, renderPage, type FormField, type PageLink, type SourceDoc, type TextLine } from '../../pdf/view';
import FormLayer from '../form/FormLayer';
import EditLayer from '../edit/EditLayer';
import { lineBox, type Edit } from '../../core/edits';
import { useNearViewport } from '../../ui/useNearViewport';
import AnnotLayer from '../comment/AnnotLayer';
import { isDrawTool, type Picture, type Tool } from '../comment/tools';
import type { Annot } from '../../core/annotations';
import type { StampName } from '../comment/stamps';

interface Props {
  page: PageRef;
  doc: SourceDoc;
  number: number;
  /** Number of pages in the document, for page numbers. */
  total: number;
  /** Size on screen in CSS pixels. */
  width: number;
  height: number;
  /** The page is damaged and cannot be drawn. */
  damaged: boolean;
  /** Size of the page in points before the extra rotation, and pixels per point. */
  size: Size;
  scale: number;
  /** Search matches on this page. */
  hits: { boxes: Box[]; active: boolean }[];
  /** Position in the page list of a page of this page's file, or null when it was deleted. */
  linkTarget: (docId: string, srcIndex: number) => number | null;
  onGo: (position: number) => void;
  /** Comment tool in use, and what it needs. */
  tool: Tool;
  color: string;
  stamp: { name: StampName; text: string };
  dateText: string;
  picture: Picture | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAnnots: (page: PageRef, annots: Annot[]) => void;
  onPlaced: () => void;
  onFill: (page: PageRef, fields: Record<number, string>) => void;
  onEdits: (page: PageRef, edits: Edit[]) => void;
}

const NO_ANNOTS: Annot[] = [];
const NO_EDITS: Edit[] = [];
const NO_LINES: TextLine[] = [];
const NO_VALUES: Record<number, string> = {};

let measuring: CanvasRenderingContext2D | null = null;

/** Width of a text at a font size, in the font the text layer uses. */
function naturalWidth(text: string, size: number): number {
  measuring ??= document.createElement('canvas').getContext('2d');
  if (!measuring) return 0;
  measuring.font = '100px sans-serif';
  return (measuring.measureText(text).width / 100) * size;
}

// Images wider than this are stretched: very large zoom levels would need too much memory.
const MAX_RENDER_WIDTH = 2400;

/** One page of the reading view. It has its final size from the start and draws itself while it is near the screen. */
function ReadPage({ page, doc, number, total, width, height, damaged, size, scale, hits, linkTarget, onGo, tool, color, stamp, dateText, picture, selectedId, onSelect, onAnnots, onPlaced, onFill, onEdits }: Props) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const near = useNearViewport(root);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lines, setLines] = useState<TextLine[] | null>(null);
  const [links, setLinks] = useState<PageLink[]>([]);
  // Null until the form fields are known: the page is drawn without them when it has any.
  const [imageBoxes, setImageBoxes] = useState<Box[]>([]);
  const [fieldList, setFieldList] = useState<FormField[] | null>(null);
  const current = useRef<string | null>(null);
  const renderWidth = Math.min(width, MAX_RENDER_WIDTH);
  // Comments of the file that were deleted are left out of the picture. A string, so that the
  // picture is only drawn again when the set really changes.
  const removedKey = (page.removed ?? []).join(',');
  const removed = useMemo(() => (removedKey ? removedKey.split(',').map(Number) : undefined), [removedKey]);

  const show = (url: string | null) => {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = url;
    setImage(url);
  };

  useEffect(() => {
    if (damaged || fieldList === null) return;
    // A page far away gives its image back; it is drawn again when it comes close.
    if (!near) return show(null);
    let cancelled = false;
    // The delay saves drawing at every step while the zoom is being changed.
    const timer = setTimeout(() => {
      renderPage(doc, page.srcIndex, { width: renderWidth, rotation: page.rotation, hidden: removed, hideForms: fieldList.length > 0 })
        .then((url) => {
          if (cancelled) URL.revokeObjectURL(url);
          else show(url);
        })
        .catch((err) => {
          console.warn('Page render failed', err);
          if (!cancelled) setFailed(true);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `show` only touches refs and state setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [near, damaged, doc, page.srcIndex, page.rotation, renderWidth, removed, fieldList]);

  // The text is only held while the page is near, like its image.
  useEffect(() => {
    if (damaged || !near) {
      setLines(null);
      setLinks([]);
      return;
    }
    let cancelled = false;
    getText(doc, page.srcIndex)
      .then((l) => !cancelled && setLines(l))
      .catch(() => !cancelled && setLines(null));
    getFields(doc, page.srcIndex)
      .then((f) => !cancelled && setFieldList(f))
      .catch(() => !cancelled && setFieldList([]));
    getLinks(doc, page.srcIndex)
      .then((l) => !cancelled && setLinks(l))
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [near, damaged, doc, page.srcIndex]);

  // The pictures of the page are only looked for while the tool that picks one is in use.
  const pickingImages = tool === 'editImage';
  useEffect(() => {
    if (!pickingImages || !near || damaged) {
      setImageBoxes([]);
      return;
    }
    let cancelled = false;
    getImages(doc, page.srcIndex)
      .then((b) => !cancelled && setImageBoxes(b))
      .catch(() => !cancelled && setImageBoxes([]));
    return () => {
      cancelled = true;
    };
  }, [pickingImages, near, damaged, doc, page.srcIndex]);

  const edits = page.edits ?? NO_EDITS;
  const pickLine = (line: TextLine) => {
    const existing = edits.find((e) => e.kind === 'text' && e.original === line.text && Math.abs(e.baseline[0] - line.x) < 1 && Math.abs(e.baseline[1] - line.y) < 1);
    if (existing) onSelect(existing.id);
    else {
      const made: Edit = {
        id: crypto.randomUUID(),
        kind: 'text',
        original: line.text,
        box: lineBox(line.x, line.y, line.length, line.size),
        baseline: [line.x, line.y],
        size: line.size,
        color: line.color,
        font: line.font,
        text: line.text,
      };
      onEdits(page, [...edits, made]);
      onSelect(made.id);
    }
    onPlaced();
  };
  const pickImage = (index: number, box: Box) => {
    getImagePng(doc, page.srcIndex, index)
      .then((png) => {
        const made: Edit = { id: crypto.randomUUID(), kind: 'image', box, target: box, png };
        onEdits(page, [...edits, made]);
        onSelect(made.id);
        onPlaced();
      })
      .catch((err) => console.warn('Picture could not be read', err));
  };

  const shapes = useMemo(
    () => (lines ?? []).map((line) => ({ line, style: lineStyle(line, naturalWidth(line.text, line.size)) })),
    [lines],
  );

  useEffect(() => () => {
    if (current.current) URL.revokeObjectURL(current.current);
  }, []);

  const problem = damaged || failed;
  return (
    <div
      ref={root}
      className="read-page"
      style={{ width, height }}
      role="img"
      aria-label={t('read.pageLabel', { number })}
      data-page={number}
    >
      {image && !problem && <img src={image} alt="" draggable={false} />}
      {!problem && (hits.length > 0 || shapes.length > 0 || links.length > 0) && (
        <div
          className="overlay"
          style={{ width: size.width, height: size.height, transform: overlayTransform(size, page.rotation, scale) }}
        >
          {hits.map((hit, i) =>
            hit.boxes.map((b, k) => (
              <span
                key={`${i}-${k}`}
                className={hit.active ? 'hit active' : 'hit'}
                data-hit={hit.active ? 'active' : undefined}
                style={{ left: b[0], top: b[1], width: b[2] - b[0], height: b[3] - b[1] }}
              />
            )),
          )}
          <div className="text-layer">
            {shapes.map(({ line, style }, i) => (
              <span key={i} style={style}>
                {line.text}
              </span>
            ))}
          </div>
          {links.map((link, i) => {
            const style = { left: link.box[0], top: link.box[1], width: link.box[2] - link.box[0], height: link.box[3] - link.box[1] };
            if (link.uri !== undefined) {
              const url = safeExternalUrl(link.uri);
              return url ? (
                <a key={i} className="page-link" style={style} href={url} target="_blank" rel="noopener noreferrer" title={url}>
                  <span className="sr-only">{url}</span>
                </a>
              ) : null;
            }
            const target = link.page === undefined ? null : linkTarget(page.docId, link.page);
            if (target === null) return null;
            return (
              <a
                key={i}
                className="page-link"
                style={style}
                href="#"
                title={t('read.linkToPage', { number: target + 1 })}
                onClick={(e) => {
                  e.preventDefault();
                  onGo(target);
                }}
              >
                <span className="sr-only">{t('read.linkToPage', { number: target + 1 })}</span>
              </a>
            );
          })}
        </div>
      )}
      {!problem && (page.marks?.length || page.crop) && (
        <div className="annot-layer page-extras" style={{ width: size.width, height: size.height, transform: overlayTransform(size, page.rotation, scale) }}>
          {page.crop && (
            <div
              className="crop-mask"
              style={{ left: page.crop[0], top: page.crop[1], width: page.crop[2] - page.crop[0], height: page.crop[3] - page.crop[1] }}
            />
          )}
          {page.marks?.map((m) => {
            const text = markText(m, number, total, dateText);
            const w = naturalWidth(text, m.size);
            const { x, y } = markPosition(m.place, size, w, m.size);
            const style: React.CSSProperties = { left: x, top: y, fontSize: m.size, color: m.color, opacity: m.opacity };
            if (m.place === 'center' && m.diagonal) {
              Object.assign(style, { left: size.width / 2 - w / 2, transform: 'rotate(-45deg)' });
            }
            return (
              <span key={m.id} className="page-mark" style={style}>
                {text}
              </span>
            );
          })}
        </div>
      )}
      {!problem && (
        <EditLayer
          size={size}
          rotation={page.rotation}
          scale={scale}
          edits={edits}
          tool={tool === 'editText' || tool === 'editImage' ? tool : null}
          lines={lines ?? NO_LINES}
          images={imageBoxes}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={(next) => onEdits(page, next)}
          onPickLine={pickLine}
          onPickImage={pickImage}
        />
      )}
      {!problem && fieldList && (
        <FormLayer
          fields={fieldList}
          values={page.fields ?? NO_VALUES}
          size={size}
          rotation={page.rotation}
          scale={scale}
          inactive={isDrawTool(tool)}
          onChange={(fields) => onFill(page, fields)}
        />
      )}
      {!problem && (
        <AnnotLayer
          size={size}
          rotation={page.rotation}
          scale={scale}
          annots={page.annots ?? NO_ANNOTS}
          tool={tool}
          color={color}
          stamp={stamp}
          dateText={dateText}
          picture={picture}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={(annots) => onAnnots(page, annots)}
          onPlaced={onPlaced}
        />
      )}
      {problem && (
        <span className="thumb-failed">
          <span aria-hidden="true">⚠</span>
          {t('card.previewFailed')}
        </span>
      )}
    </div>
  );
}

export default memo(ReadPage);
