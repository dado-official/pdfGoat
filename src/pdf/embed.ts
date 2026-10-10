// Writes text and pictures into the content of a page, so they become part of it for good.
// Positions are given in page points as the reader shows them (y points down, the page's own
// rotation applied); this file turns them into the page's PDF coordinates.
import type { Font, Matrix, PDFDocument, PDFObject, PDFPage } from 'mupdf';
import { rgb } from '../core/annotations';
import { encodeWinAnsi, winAnsiByte } from '../core/winansi';
import type { Mupdf } from './mupdf';

interface Embedded {
  font: Font;
  obj: PDFObject;
  /** Name in the page's resources. */
  resource: string;
}
const fonts = new WeakMap<PDFDocument, Map<string, Embedded>>();
let counter = 0;

/** The font used for inserted text: an embedded Helvetica-style font with western European characters. */
function fontOf(engine: Mupdf, doc: PDFDocument, name = 'Helvetica'): Embedded {
  let byName = fonts.get(doc);
  if (!byName) fonts.set(doc, (byName = new Map()));
  let found = byName.get(name);
  if (!found) {
    const font = new engine.Font(name);
    found = { font, obj: doc.addSimpleFont(font, 'Latin'), resource: `PGfont${byName.size}` };
    byName.set(name, found);
  }
  return found;
}

/** The page's own resource dictionary, made if there is none yet. */
function resourcesOf(doc: PDFDocument, page: PDFPage): PDFObject {
  const obj = page.getObject();
  let res = obj.getInheritable('Resources');
  if (!res.isDictionary()) {
    res = doc.newDictionary();
  }
  obj.put('Resources', res);
  return res;
}

function subDict(doc: PDFDocument, res: PDFObject, key: string): PDFObject {
  let d = res.get(key);
  if (!d.isDictionary()) {
    d = doc.newDictionary();
    res.put(key, d);
  }
  return d;
}

/** Adds a content stream at the end of the page, drawn over everything else. */
function appendContent(doc: PDFDocument, page: PDFPage, source: string) {
  const stream = doc.addStream(source, doc.newDictionary());
  const obj = page.getObject();
  const old = obj.get('Contents');
  if (old.isArray()) {
    old.push(stream);
  } else if (old.isNull()) {
    obj.put('Contents', stream);
  } else {
    const list = doc.newArray();
    list.push(old);
    list.push(stream);
    obj.put('Contents', list);
  }
}

/** Page space (y down) to PDF space of this page. */
const toPdf = (engine: Mupdf, page: PDFPage, local: Matrix): Matrix =>
  engine.Matrix.concat(local, engine.Matrix.invert(page.getTransform()));

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();
const mx = (m: Matrix) => m.map(fmt).join(' ');

export interface TextBlock {
  text: string;
  /** Left edge and top of the box, in page points. */
  x: number;
  y: number;
  /** Width the lines are wrapped to; 0 for no wrapping. */
  width: number;
  size: number;
  color: string;
  /** One of the 14 standard fonts, e.g. "Times-Italic"; Helvetica when left out. */
  font?: string;
  opacity?: number;
  /** Angle in degrees, counter-clockwise on the page, around the left end of the first baseline. */
  angle?: number;
}

/** Splits text into lines that fit `width` points; a word that is too long stays on a line of its own. */
export function wrapLines(measure: (s: string) => number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!width) {
      out.push(paragraph);
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const trial = line ? `${line} ${word}` : word;
      if (line && measure(trial) > width) {
        out.push(line);
        line = word;
      } else line = trial;
    }
    out.push(line);
  }
  return out;
}

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

/** Width of a text in points at a font size. */
export function textWidth(engine: Mupdf, doc: PDFDocument, text: string, size: number, fontName?: string): number {
  const { font } = fontOf(engine, doc, fontName);
  let w = 0;
  for (const char of text) {
    const byte = winAnsiByte(char);
    w += font.advanceGlyph(font.encodeCharacter(byte === null ? 0x3f : char.codePointAt(0)!));
  }
  return w * size;
}

/** Writes text into the page. Returns the width of its widest line. */
export function embedText(engine: Mupdf, doc: PDFDocument, page: PDFPage, t: TextBlock): number {
  const { obj, resource } = fontOf(engine, doc, t.font);
  const res = resourcesOf(doc, page);
  subDict(doc, res, 'Font').put(resource, obj);
  let gs = '';
  if (t.opacity !== undefined && t.opacity < 1) {
    const name = `PGgs${counter++}`;
    const dict = doc.newDictionary();
    dict.put('ca', t.opacity);
    dict.put('CA', t.opacity);
    subDict(doc, res, 'ExtGState').put(name, dict);
    gs = `/${name} gs\n`;
  }
  const lines = wrapLines((s) => textWidth(engine, doc, s, t.size, t.font), t.text, t.width);
  const [r, g, b] = rgb(t.color);
  const rad = ((t.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let widest = 0;
  let content = `q\n${gs}${fmt(r)} ${fmt(g)} ${fmt(b)} rg\n`;
  lines.forEach((line, i) => {
    widest = Math.max(widest, textWidth(engine, doc, line, t.size, t.font));
    // Local space: x along the line, y up. In page space y points down, hence the sign of sin and the flip.
    const dy = t.size * 0.92 + i * t.size * 1.2;
    const x = t.x + sin * dy;
    const y = t.y + cos * dy;
    const local: Matrix = [cos, -sin, -sin, -cos, x, y];
    content += `q ${mx(toPdf(engine, page, local))} cm BT /${resource} ${fmt(t.size)} Tf 0 0 Td <${hex(encodeWinAnsi(line).bytes)}> Tj ET Q\n`;
  });
  appendContent(doc, page, `${content}Q\n`);
  return widest;
}

export interface PictureBlock {
  png: Uint8Array;
  /** The picture's box in page points. */
  box: [number, number, number, number];
  opacity?: number;
}

/** Writes a picture into the page, stretched to its box. */
export function embedPicture(engine: Mupdf, doc: PDFDocument, page: PDFPage, p: PictureBlock) {
  const res = resourcesOf(doc, page);
  const name = `PGimg${counter++}`;
  subDict(doc, res, 'XObject').put(name, doc.addImage(new engine.Image(p.png)));
  let gs = '';
  if (p.opacity !== undefined && p.opacity < 1) {
    const gname = `PGgs${counter++}`;
    const dict = doc.newDictionary();
    dict.put('ca', p.opacity);
    dict.put('CA', p.opacity);
    subDict(doc, res, 'ExtGState').put(gname, dict);
    gs = `/${gname} gs `;
  }
  const [x0, y0, x1, y1] = p.box;
  // The unit square of an image, turned upright and stretched onto the box.
  const local: Matrix = [x1 - x0, 0, 0, -(y1 - y0), x0, y1];
  appendContent(doc, page, `q ${gs}${mx(toPdf(engine, page, local))} cm /${name} Do Q\n`);
}
