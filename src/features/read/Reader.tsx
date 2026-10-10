import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  FALLBACK_SIZE,
  layoutPages,
  pageAt,
  PAD,
  percentOf,
  scaleFor,
  stepZoom,
  turnedSize,
  ZOOM_STEPS,
  type Size,
  type Zoom,
} from '../../core/readerLayout';
import { placeOutline, type FileOutline } from '../../core/outline';
import { boxOnScreen, type Box } from '../../core/textLayer';
import type { PageRef } from '../../core/types';
import type { ReaderMemory } from '../../state/workspace';
import { useI18n } from '../../i18n/context';
import { getOutline, type SourceDoc } from '../../pdf/view';
import ReadPage from './ReadPage';
import Sidebar, { type SidebarTab } from './Sidebar';
import { MAX_MATCHES, useSearch } from './useSearch';

const NO_HITS: { boxes: Box[]; active: boolean }[] = [];

interface Props {
  pages: PageRef[];
  docs: Record<string, SourceDoc>;
  thumbs: Record<string, string>;
  failedThumbs: ReadonlySet<string>;
  onNeedThumb: (page: PageRef) => void;
  /** Where the reader was left last time, and where to report the place when it closes. */
  memory: ReaderMemory | null;
  onMemory: (memory: ReaderMemory) => void;
}

/** Continuous view of all pages with zoom and keyboard paging. */
export default function Reader({ pages, docs, thumbs, failedThumbs, onNeedThumb, memory, onMemory }: Props) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 800, height: 600 });
  const [zoom, setZoom] = useState<Zoom>(memory?.zoom ?? { kind: 'width' });
  const [current, setCurrent] = useState(0);
  const [typed, setTyped] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchField = useRef<HTMLInputElement>(null);
  const [sidebar, setSidebar] = useState<SidebarTab | null>(null);
  const asked = useRef(new Set<string>());
  const [outlines, setOutlines] = useState<Record<string, FileOutline['nodes']>>({});

  // Where each page of each file stands now; the first place when a page is used several times.
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    pages.forEach((p, i) => {
      const key = `${p.docId}:${p.srcIndex}`;
      if (!map.has(key)) map.set(key, i);
    });
    return map;
  }, [pages]);

  // Bookmarks are read once per file, when the sidebar is first opened.
  useEffect(() => {
    if (!sidebar) return;
    for (const id of new Set(pages.map((p) => p.docId))) {
      if (asked.current.has(id) || !docs[id]) continue;
      asked.current.add(id);
      getOutline(docs[id])
        .then((nodes) => setOutlines((o) => ({ ...o, [id]: nodes })))
        .catch(() => undefined);
    }
  }, [sidebar, pages, docs]);

  const outline = useMemo(() => {
    const files: FileOutline[] = [...new Set(pages.map((p) => p.docId))]
      .filter((id) => docs[id])
      .map((id) => ({ docId: id, name: docs[id].name, nodes: outlines[id] ?? [] }));
    return placeOutline(files, positions);
  }, [pages, docs, outlines, positions]);

  const linkTarget = useCallback((docId: string, srcIndex: number) => positions.get(`${docId}:${srcIndex}`) ?? null, [positions]);

  // Size of every page: its own size, and as shown after the rotation chosen in the page list.
  const baseSizes = useMemo(
    () =>
      pages.map((p) => {
        const size = docs[p.docId]?.sizes[p.srcIndex];
        return size ? { width: size[0], height: size[1] } : FALLBACK_SIZE;
      }),
    [pages, docs],
  );
  const sizes = useMemo(() => baseSizes.map((s, i) => turnedSize(s, pages[i].rotation)), [baseSizes, pages]);
  const scale = scaleFor(zoom, sizes, viewport);
  const layout = useMemo(() => layoutPages(sizes, scale), [sizes, scale]);
  const percent = percentOf(scale);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The page at the top of the screen and how far into it we are, to stay there when sizes change.
  const anchor = useRef({ index: memory?.index ?? 0, fraction: memory?.fraction ?? 0 });
  // The place is handed back when the reader closes, e.g. on a switch to another tab.
  const leaving = useRef({ zoom, onMemory });
  useEffect(() => {
    leaving.current = { zoom, onMemory };
  }, [zoom, onMemory]);
  useEffect(
    () => () => leaving.current.onMemory({ ...anchor.current, zoom: leaving.current.zoom }),
    [],
  );
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const l = layoutRef.current;
    const top = el.scrollTop;
    // The reference line is PAD below the top edge, so the padding above the first page stays visible.
    const index = pageAt(l, top + PAD);
    anchor.current = { index, fraction: l.heights[index] ? (top + PAD - l.tops[index]) / l.heights[index] : 0 };
    setCurrent(pageAt(l, top + el.clientHeight * 0.35));
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const { index, fraction } = anchor.current;
    const i = Math.min(index, layout.tops.length - 1);
    if (i < 0) return;
    el.scrollTop = layout.tops[i] + fraction * layout.heights[i] - PAD;
  }, [layout]);

  const goTo = useCallback((index: number) => {
    const el = scroller.current;
    const l = layoutRef.current;
    if (!el || !l.tops.length) return;
    const i = Math.max(0, Math.min(index, l.tops.length - 1));
    el.scrollTo({ top: l.tops[i] - PAD / 2 });
  }, []);
  const go = goTo;

  const search = useSearch(pages, docs, query);
  const matches = search.matches;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  const hitsByPage = useMemo(() => {
    const byPage = new Map<number, { boxes: Box[]; active: boolean }[]>();
    matches.forEach((m, i) => {
      const list = byPage.get(m.page) ?? [];
      list.push({ boxes: m.boxes, active: i === activeIndex });
      byPage.set(m.page, list);
    });
    return byPage;
  }, [matches, activeIndex]);

  /** Scrolls so that the first box of a match is in the upper part of the screen. */
  const reveal = useCallback(
    (index: number) => {
      const el = scroller.current;
      const m = matches[index];
      if (!el || !m) return;
      const box = boxOnScreen(m.boxes[0], baseSizes[m.page], pages[m.page].rotation, scale);
      el.scrollTo({ top: layout.tops[m.page] + box.top - el.clientHeight * 0.3 });
    },
    [matches, baseSizes, pages, scale, layout],
  );

  // A new search starts at its first match, as soon as there is one.
  const revealedFor = useRef('');
  useEffect(() => {
    if (!matches.length || revealedFor.current === query) return;
    revealedFor.current = query;
    reveal(0);
  }, [matches, query, reveal]);

  function changeQuery(value: string) {
    setQuery(value);
    setActive(0);
    revealedFor.current = '';
  }

  function stepMatch(direction: 1 | -1) {
    if (!matches.length) return;
    const next = (activeIndex + direction + matches.length) % matches.length;
    setActive(next);
    reveal(next);
  }

  // Ctrl+F searches in the document instead of the browser's own search, while this view is open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchField.current?.focus();
        searchField.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const zoomBy = (direction: 1 | -1) => setZoom({ kind: 'percent', value: stepZoom(percent, direction) });

  function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === '+' || e.key === '=')) zoomBy(1);
    else if (mod && e.key === '-') zoomBy(-1);
    else if (mod && e.key === '0') setZoom({ kind: 'width' });
    else if (!mod && (e.key === 'PageDown' || e.key === 'ArrowRight')) goTo(current + 1);
    else if (!mod && (e.key === 'PageUp' || e.key === 'ArrowLeft')) goTo(current - 1);
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(pages.length - 1);
    else return;
    e.preventDefault();
  }

  function commitTyped() {
    const n = Number(typed);
    if (typed !== null && Number.isInteger(n)) goTo(n - 1);
    setTyped(null);
  }

  const zoomValue = zoom.kind === 'percent' ? (ZOOM_STEPS.includes(zoom.value) ? String(zoom.value) : 'custom') : zoom.kind;

  return (
    <div className="reader">
      <div className="reader-bar" role="toolbar" aria-label={t('read.toolbar')}>
        <button
          className="side-toggle"
          aria-pressed={sidebar !== null}
          title={t('read.sidebar')}
          aria-label={t('read.sidebar')}
          onClick={() => setSidebar(sidebar ? null : 'pages')}
        >
          ☰
        </button>
        <label className="page-field">
          {t('read.page')}{' '}
          <input
            type="text"
            inputMode="numeric"
            value={typed ?? String(current + 1)}
            onChange={(e) => setTyped(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setTyped(null);
            }}
          />
          {t('read.of', { total: pages.length })}
        </label>
        <div className="search" role="search">
          <input
            ref={searchField}
            type="search"
            value={query}
            placeholder={t('read.search')}
            aria-label={t('read.search')}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1);
              if (e.key === 'Escape') {
                changeQuery('');
                scroller.current?.focus();
              }
            }}
          />
          <span className="search-state" aria-live="polite">
            {search.status === 'searching' && matches.length === 0 && t('read.searching')}
            {matches.length > 0 &&
              t('read.matchOf', {
                number: activeIndex + 1,
                total: matches.length >= MAX_MATCHES ? `${MAX_MATCHES}+` : matches.length,
              })}
            {search.status === 'done' && matches.length === 0 && t('read.noMatch')}
          </span>
          <button onClick={() => stepMatch(-1)} disabled={!matches.length} aria-label={t('read.prevMatch')} title="Shift+Enter">↑</button>
          <button onClick={() => stepMatch(1)} disabled={!matches.length} aria-label={t('read.nextMatch')} title="Enter">↓</button>
        </div>
        <div className="zoom">
          <button onClick={() => zoomBy(-1)} disabled={percent <= ZOOM_STEPS[0]} aria-label={t('read.zoomOut')} title="Strg+−">−</button>
          <select
            value={zoomValue}
            aria-label={t('read.zoom')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'width' || v === 'page') setZoom({ kind: v });
              else if (v !== 'custom') setZoom({ kind: 'percent', value: Number(v) });
            }}
          >
            <option value="width">{t('read.zoom.width')}</option>
            <option value="page">{t('read.zoom.page')}</option>
            {zoomValue === 'custom' && <option value="custom">{percent} %</option>}
            {ZOOM_STEPS.map((s) => (
              <option key={s} value={s}>{s} %</option>
            ))}
          </select>
          <span className="zoom-now" aria-live="polite">{percent} %</span>
          <button onClick={() => zoomBy(1)} disabled={percent >= ZOOM_STEPS.at(-1)!} aria-label={t('read.zoomIn')} title="Strg++">+</button>
        </div>
      </div>

      <div className="reader-body">
      {sidebar && (
        <Sidebar
          tab={sidebar}
          onTab={setSidebar}
          pages={pages}
          baseSizes={baseSizes}
          current={current}
          thumbs={thumbs}
          failedThumbs={failedThumbs}
          onNeedThumb={onNeedThumb}
          outline={outline}
          onGo={go}
        />
      )}
      <div
        ref={scroller}
        className="reader-scroll"
        tabIndex={0}
        aria-label={t('read.label')}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        <div className="reader-pages" style={{ height: layout.total }}>
          {pages.map((p, i) => (
            <ReadPage
              key={p.id}
              page={p}
              doc={docs[p.docId]}
              number={i + 1}
              width={layout.widths[i]}
              height={layout.heights[i]}
              damaged={!docs[p.docId]?.sizes[p.srcIndex]}
              size={baseSizes[i]}
              scale={scale}
              hits={hitsByPage.get(i) ?? NO_HITS}
              linkTarget={linkTarget}
              onGo={go}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
