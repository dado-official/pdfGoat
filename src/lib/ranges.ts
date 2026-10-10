// Pure helpers for splitting. Page numbers in the UI are 1-based; groups are 0-based positions.

/** Parses "1-3, 5, 7-" into groups of 0-based positions; throws a readable German error. */
export function parseRanges(text: string, count: number): number[][] {
  const groups: number[][] = [];
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$|^(\d+)$/);
    if (!m) throw new Error(`„${part}“ ist kein gültiger Bereich.`);
    let from: number, to: number;
    if (m[3]) from = to = Number(m[3]);
    else {
      from = m[1] ? Number(m[1]) : 1;
      to = m[2] ? Number(m[2]) : count;
    }
    if (from < 1 || to > count || from > to) {
      throw new Error(`„${part}“ liegt außerhalb von 1–${count}.`);
    }
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  }
  if (!groups.length) throw new Error('Bitte mindestens einen Bereich angeben.');
  return groups;
}

/** Splits `count` pages into groups of `size` (the last group may be smaller). */
export function chunk(count: number, size: number): number[][] {
  const n = Math.max(1, Math.floor(size) || 1);
  const out: number[][] = [];
  for (let i = 0; i < count; i += n) {
    out.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
  }
  return out;
}

export const baseName = (name: string) => name.replace(/\.pdf$/i, '');

/** Output name: the source name if all pages come from one file, otherwise "zusammengefuegt". */
export function outputBase(sourceNames: string[]): string {
  const unique = [...new Set(sourceNames)];
  return unique.length === 1 ? baseName(unique[0]) : 'zusammengefuegt';
}

/** "dokument-02_S4-6.pdf" for the second part covering pages 4 to 6. */
export function partName(base: string, index: number, group: number[]): string {
  const first = group[0] + 1;
  const last = group[group.length - 1] + 1;
  const range = first === last ? `${first}` : `${first}-${last}`;
  return `${base}-${String(index + 1).padStart(2, '0')}_S${range}.pdf`;
}
