// Page operations on MuPDF documents that keep what belongs to the pages: form fields,
// comments, links and bookmarks. MuPDF moves the page content itself; the rest is done here.
import type { PDFDocument, PDFGraftMap, PDFObject } from 'mupdf';

interface OutlineItem {
  title: string | undefined;
  uri: string | undefined;
  open: boolean;
  down?: OutlineItem[];
}

const AT_ITEM = 0;

/** Calls `fn` for every entry of a page's annotation list (comments, links, form widgets). */
function eachAnnot(doc: PDFDocument, pageIndex: number, fn: (annot: PDFObject) => void) {
  const annots = doc.findPage(pageIndex).get('Annots');
  if (!annots.isArray()) return;
  for (let k = 0; k < annots.length; k++) {
    const annot = annots.get(k);
    if (annot.isDictionary()) fn(annot);
  }
}

/** Links are not copied but created again, so that they point at the moved pages. Their pop-ups go with them. */
const isCopied = (annot: PDFObject) => !['/Link', '/Popup'].includes(annot.get('Subtype').toString());

/** Removes form fields that no longer have a widget on any page. */
function dropFieldsWithoutPage(doc: PDFDocument, form: PDFObject) {
  const fields = form.get('Fields');
  if (!fields.isArray()) return;
  const onPage = new Set<number>();
  for (let i = 0; i < doc.countPages(); i++) eachAnnot(doc, i, (a) => onPage.add(a.asIndirect()));
  const alive = (field: PDFObject): boolean => {
    const kids = field.get('Kids');
    if (!kids.isArray()) return onPage.has(field.asIndirect());
    for (let k = kids.length - 1; k >= 0; k--) if (!alive(kids.get(k))) kids.delete(k);
    return kids.length > 0;
  };
  for (let k = fields.length - 1; k >= 0; k--) if (!alive(fields.get(k))) fields.delete(k);
}

/** True when the entry jumps to a page of its own document, which holds on to that page. */
const jumpsToPage = (action: PDFObject) => action.isArray() || (action.isDictionary() && action.get('S').toString() === '/GoTo');

/**
 * Reduces the document to the given pages, in the given order (each page at most once).
 * Bookmarks and links follow their pages; those of removed pages are dropped.
 */
export function keepPages(doc: PDFDocument, order: number[]) {
  if (order.length === doc.countPages() && order.every((p, i) => p === i)) return;
  const root = doc.getTrailer().get('Root');
  const form = root.get('AcroForm');
  const kept = new Set(order.map((p) => doc.findPage(p).asIndirect()));
  doc.rearrangePages(order);
  // MuPDF 1.28 drops the whole form directory here, even when all pages stay. Put it back.
  if (form.isDictionary()) {
    root.put('AcroForm', form);
    dropFieldsWithoutPage(doc, form);
  }
  // "Open at page N" still points at the page object. Without this a removed page would stay
  // in the saved file, invisible but readable.
  const action = root.get('OpenAction');
  if (jumpsToPage(action)) {
    const dest = action.isArray() ? action : action.get('D');
    const target = dest.isArray() && dest.length ? dest.get(0) : null;
    if (!(target?.isIndirect() && kept.has(target.asIndirect()))) root.delete('OpenAction');
  }
}

/** Rewrites a link inside `from` so that it means the same place after its pages moved by `shift` in `to`. */
function shiftUri(from: PDFDocument, to: PDFDocument, uri: string | undefined, shift: number): string | undefined {
  if (!uri?.startsWith('#')) return uri;
  const dest = from.resolveLinkDestination(uri);
  return to.formatLinkURI({ ...dest, page: dest.page + shift });
}

const pageUri = (doc: PDFDocument, page: number) =>
  doc.formatLinkURI({ type: 'Fit', chapter: 0, page, x: 0, y: 0, width: 0, height: 0, zoom: 0 });

/** Adds bookmarks after the last one on the top level. */
function addOutline(doc: PDFDocument, items: OutlineItem[]) {
  const it = doc.outlineIterator();
  while (it.item() && it.next() === AT_ITEM);
  const insert = (list: OutlineItem[]) => {
    for (const item of list) {
      // New entries go in front of the iterator, which stays on the empty place at the end.
      it.insert({ title: item.title, uri: item.uri, open: item.open });
      if (item.down?.length) {
        it.prev();
        it.down();
        insert(item.down);
        it.up();
        it.next();
      }
    }
  };
  insert(items);
}

/** Puts all bookmarks of the document below one new entry that points at its first page. */
export function nestOutline(doc: PDFDocument, title: string) {
  const items = (doc.loadOutline() ?? []) as OutlineItem[];
  const it = doc.outlineIterator();
  while (it.item()) it.delete();
  addOutline(doc, [{ title, uri: pageUri(doc, 0), open: false, down: items }]);
}

/** Top-level field names must be unique in a form, or two fields would share one value. */
function renameClashingFields(to: PDFDocument, from: PDFDocument, fields: PDFObject) {
  const taken = new Set<string>();
  const existing = to.getTrailer().get('Root', 'AcroForm', 'Fields');
  if (existing.isArray()) for (let k = 0; k < existing.length; k++) taken.add(existing.get(k).get('T').asString());
  for (let k = 0; k < fields.length; k++) {
    const field = fields.get(k);
    const name = field.get('T').asString();
    let free = name;
    for (let n = 2; taken.has(free); n++) free = `${name}_${n}`;
    if (free !== name) field.put('T', from.newString(free));
    taken.add(free);
  }
}

function appendForm(to: PDFDocument, from: PDFDocument, map: PDFGraftMap) {
  const form = from.getTrailer().get('Root', 'AcroForm');
  if (!form.isDictionary()) return;
  const fields = form.get('Fields');
  if (!fields.isArray() || !fields.length) return;

  const root = to.getTrailer().get('Root');
  if (!root.get('AcroForm').isDictionary()) root.put('AcroForm', to.addObject({ Fields: [] }));
  const target = root.get('AcroForm');
  if (!target.get('Fields').isArray()) target.put('Fields', []);
  for (let k = 0; k < fields.length; k++) target.get('Fields').push(map.graftObject(fields.get(k)));

  // Fields name their font; the fonts live in the form's shared resources.
  for (const key of ['DA', 'Q']) {
    if (target.get(key).isNull() && !form.get(key).isNull()) target.put(key, map.graftObject(form.get(key)));
  }
  const fonts = form.get('DR', 'Font');
  if (fonts.isDictionary()) {
    if (!target.get('DR').isDictionary()) target.put('DR', {});
    if (!target.get('DR', 'Font').isDictionary()) target.get('DR').put('Font', {});
    const targetFonts = target.get('DR', 'Font');
    fonts.forEach((font, name) => {
      if (targetFonts.get(name as string).isNull()) targetFonts.put(name as string, map.graftObject(font));
    });
  }
}

/**
 * Appends all pages of `from` to the end of `to`, with their comments, links and form fields.
 * With `outlineTitle`, the bookmarks of `from` come along below an entry of that name.
 * `from` is changed in the process and must not be used afterwards.
 */
export function appendDocument(to: PDFDocument, from: PDFDocument, outlineTitle?: string) {
  const first = to.countPages();
  const count = from.countPages();

  // An annotation points back at its page. Copying it as it is would drag the whole source
  // page tree along, so these pointers are cut and set again on the copy.
  for (let i = 0; i < count; i++) {
    eachAnnot(from, i, (annot) => {
      if (!isCopied(annot)) return;
      for (const key of ['P', 'Popup', 'Dest']) annot.delete(key);
      if (jumpsToPage(annot.get('A'))) annot.delete('A');
    });
  }
  // Names are changed before anything is copied, because a copied widget brings its field along.
  const form = from.getTrailer().get('Root', 'AcroForm');
  const fields = form.isDictionary() ? form.get('Fields') : null;
  if (fields?.isArray()) renameClashingFields(to, from, fields);

  const map = to.newGraftMap();
  for (let i = 0; i < count; i++) map.graftPage(-1, from, i);

  for (let i = 0; i < count; i++) {
    const page = to.findPage(first + i);
    const copies: PDFObject[] = [];
    eachAnnot(from, i, (annot) => {
      if (!isCopied(annot)) return;
      const copy = map.graftObject(annot);
      copy.put('P', page);
      copies.push(copy);
    });
    if (copies.length) page.put('Annots', copies);
  }

  appendForm(to, from, map);

  for (let i = 0; i < count; i++) {
    const links = from.loadPage(i).getLinks();
    if (!links.length) continue;
    const page = to.loadPage(first + i);
    for (const link of links) {
      const uri = link.isExternal() ? link.getURI() : shiftUri(from, to, link.getURI(), first);
      if (uri) page.createLink(link.getBounds(), uri);
    }
  }

  if (outlineTitle !== undefined) {
    const shifted = (items: OutlineItem[]): OutlineItem[] =>
      items.map((item) => ({ ...item, uri: shiftUri(from, to, item.uri, first), down: item.down && shifted(item.down) }));
    const items = shifted((from.loadOutline() ?? []) as OutlineItem[]);
    addOutline(to, [{ title: outlineTitle, uri: pageUri(to, first), open: false, down: items }]);
  }
}
