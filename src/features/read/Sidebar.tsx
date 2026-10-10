import { useEffect, useRef, useState } from 'react';
import { countOutline, type PlacedOutline } from '../../core/outline';
import type { Size } from '../../core/readerLayout';
import type { PageRef } from '../../core/types';
import { useI18n } from '../../i18n/context';
import { useWhenVisible } from '../../ui/useWhenVisible';
import { thumbKey } from '../organize/useThumbnails';

export type SidebarTab = 'pages' | 'bookmarks';

interface Props {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  pages: PageRef[];
  baseSizes: Size[];
  current: number;
  thumbs: Record<string, string>;
  failedThumbs: ReadonlySet<string>;
  onNeedThumb: (page: PageRef) => void;
  outline: PlacedOutline[];
  onGo: (position: number) => void;
}

export default function Sidebar(p: Props) {
  const { t } = useI18n();
  const hasOutline = p.outline.length > 0;
  return (
    <aside className="side" aria-label={t('read.sidebar')}>
      <div className="side-tabs" role="tablist">
        {(['pages', 'bookmarks'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={p.tab === tab}
            onClick={() => p.onTab(tab)}
          >
            {t(`read.side.${tab}`)}
          </button>
        ))}
      </div>
      {p.tab === 'pages' ? (
        <Thumbnails {...p} />
      ) : hasOutline ? (
        <nav className="outline" aria-label={t('read.side.bookmarks')}>
          <OutlineList nodes={p.outline} depth={0} onGo={p.onGo} startOpen={countOutline(p.outline) <= 80} />
        </nav>
      ) : (
        <p className="side-empty">{t('read.noBookmarks')}</p>
      )}
    </aside>
  );
}

function Thumbnails({ pages, baseSizes, current, thumbs, failedThumbs, onNeedThumb, onGo }: Props) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);

  // Keep the thumbnail of the page being read in view, without moving the rest of the screen.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-position="${current}"]`);
    const box = list.current;
    if (!el || !box) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 8;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 8;
    }
  }, [current]);

  return (
    <div className="thumbs" ref={list}>
      {pages.map((page, i) => (
        <Thumb
          key={page.id}
          page={page}
          position={i}
          size={baseSizes[i]}
          url={thumbs[thumbKey(page)]}
          failed={failedThumbs.has(thumbKey(page))}
          active={i === current}
          onNeed={() => onNeedThumb(page)}
          onGo={() => onGo(i)}
          label={t('read.goToPage', { number: i + 1 })}
        />
      ))}
    </div>
  );
}

interface ThumbProps {
  page: PageRef;
  position: number;
  size: Size;
  url?: string;
  failed: boolean;
  active: boolean;
  onNeed: () => void;
  onGo: () => void;
  label: string;
}

function Thumb({ page, position, size, url, failed, active, onNeed, onGo, label }: ThumbProps) {
  const root = useRef<HTMLButtonElement>(null);
  useWhenVisible(root, !url && !failed, onNeed);
  const turned = page.rotation % 180 !== 0;
  const ratio = turned ? size.width / size.height : size.height / size.width;
  return (
    <button
      ref={root}
      className={active ? 'thumb active' : 'thumb'}
      data-position={position}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onGo}
    >
      <span className="thumb-box" style={{ aspectRatio: `1 / ${ratio}` }}>
        {url ? <img src={url} alt="" style={{ transform: `rotate(${page.rotation}deg)` }} draggable={false} /> : failed ? '⚠' : null}
      </span>
      <span className="thumb-number">{position + 1}</span>
    </button>
  );
}

function OutlineList({ nodes, depth, onGo, startOpen }: { nodes: PlacedOutline[]; depth: number; onGo: (p: number) => void; startOpen: boolean }) {
  return (
    <ul style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map((n, i) => (
        <OutlineItem key={i} node={n} depth={depth} onGo={onGo} startOpen={startOpen} />
      ))}
    </ul>
  );
}

function OutlineItem({ node, depth, onGo, startOpen }: { node: PlacedOutline; depth: number; onGo: (p: number) => void; startOpen: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen || depth === 0);
  const has = node.children.length > 0;
  return (
    <li>
      <div className="outline-row">
        {has ? (
          <button
            className="outline-toggle"
            aria-expanded={open}
            aria-label={t(open ? 'read.collapse' : 'read.expand', { title: node.title })}
            onClick={() => setOpen(!open)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="outline-toggle" aria-hidden="true" />
        )}
        <button
          className="outline-title"
          disabled={node.target === null}
          title={node.target === null ? t('read.bookmarkGone') : undefined}
          onClick={() => node.target !== null && onGo(node.target)}
        >
          {node.title}
        </button>
      </div>
      {has && open && <OutlineList nodes={node.children} depth={depth + 1} onGo={onGo} startOpen={startOpen} />}
    </li>
  );
}
