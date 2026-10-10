// Turns the lines of text of a page into paragraphs, plain text and Markdown. A PDF knows only
// single lines at places, so paragraphs and headings are guessed from the gaps between lines and
// from the font sizes.

export interface Line {
  text: string;
  /** Start of the baseline in points, y pointing down. */
  x: number;
  y: number;
  /** Font size in points. */
  size: number;
}

export interface Paragraph {
  text: string;
  /** 0 for body text, 1 to 3 for headings (1 is the largest). */
  heading: 0 | 1 | 2 | 3;
}

/** The font size most of the text has, counted by characters. */
export function bodySize(lines: readonly Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const key = Math.round(l.size * 2) / 2;
    weight.set(key, (weight.get(key) ?? 0) + l.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weight) if (w > bestWeight) [best, bestWeight] = [size, w];
  return best || 12;
}

/** Joins lines into text; a word split by a hyphen at the end of a line is put together again. */
function join(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!out) out = part;
    else if (/[a-zäöüß]-$/.test(out) && /^[a-zäöüß]/.test(part)) out = out.slice(0, -1) + part;
    else out += ` ${part}`;
  }
  return out;
}

export function toParagraphs(lines: readonly Line[], body = bodySize(lines)): Paragraph[] {
  const out: Paragraph[] = [];
  let current: { parts: string[]; last: Line; size: number } | null = null;
  const flush = () => {
    if (!current) return;
    const text = join(current.parts).trim();
    if (text) {
      const ratio = current.size / body;
      const heading = text.length <= 100 && current.parts.length <= 2 ? (ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.15 ? 3 : 0) : 0;
      out.push({ text, heading: heading as Paragraph['heading'] });
    }
    current = null;
  };
  for (const line of lines) {
    if (!line.text.trim()) continue;
    const sameParagraph =
      current &&
      line.y > current.last.y - 0.5 &&
      line.y - current.last.y < Math.max(line.size, current.last.size) * 1.6 &&
      Math.abs(line.size - current.last.size) < 0.8;
    if (!sameParagraph) flush();
    if (current) {
      current.parts.push(line.text.trim());
      current.last = line;
    } else current = { parts: [line.text.trim()], last: line, size: line.size };
  }
  flush();
  return out;
}

/** Plain text: paragraphs separated by an empty line. */
export const toText = (pages: Paragraph[][]): string =>
  pages.map((p) => p.map((x) => x.text).join('\n\n')).filter(Boolean).join('\n\n\f\n\n').replace(/\n\n\f\n\n/g, '\n\n');

/** Markdown: headings from the font size, pages separated by a rule. */
export function toMarkdown(pages: Paragraph[][]): string {
  const escape = (s: string) => s.replace(/([\\`*_{}[\]<>#+|])/g, '\\$1');
  return pages
    .map((page) => page.map((p) => (p.heading ? `${'#'.repeat(p.heading)} ${escape(p.text)}` : escape(p.text))).join('\n\n'))
    .filter(Boolean)
    .join('\n\n---\n\n');
}
