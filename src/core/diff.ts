// Differences between two texts, word by word.

export interface WordOp {
  type: 'same' | 'removed' | 'added';
  text: string;
}

/** Above this many word pairs the comparison is not done word by word (it would take too long). */
const MAX_PAIRS = 16_000_000;

export const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** The words that are the same, removed from `a` and added in `b`, in reading order. */
export function diffWords(a: readonly string[], b: readonly string[]): WordOp[] {
  // The words at the start and at the end that agree are set aside first; most pages differ little.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: WordOp[] = a.slice(0, start).map((text) => ({ type: 'same', text }));
  const tail: WordOp[] = a.slice(endA).map((text) => ({ type: 'same', text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (!midA.length || !midB.length || midA.length * midB.length > MAX_PAIRS) {
    return [...head, ...midA.map((text): WordOp => ({ type: 'removed', text })), ...midB.map((text): WordOp => ({ type: 'added', text })), ...tail];
  }
  // Longest common subsequence.
  const n = midA.length;
  const m = midB.length;
  const table = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = midA[i] === midB[j] ? table[at(i + 1, j + 1)] + 1 : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }
  const ops: WordOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      ops.push({ type: 'same', text: midA[i] });
      i++;
      j++;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) ops.push({ type: 'removed', text: midA[i++] });
    else ops.push({ type: 'added', text: midB[j++] });
  }
  while (i < n) ops.push({ type: 'removed', text: midA[i++] });
  while (j < m) ops.push({ type: 'added', text: midB[j++] });
  return [...head, ...ops, ...tail];
}

export const countOps = (ops: readonly WordOp[]) => ({
  removed: ops.filter((o) => o.type === 'removed').length,
  added: ops.filter((o) => o.type === 'added').length,
});
