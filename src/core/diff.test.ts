import { describe, expect, it } from 'vitest';
import { countOps, diffWords, words } from './diff';

const show = (a: string, b: string) =>
  diffWords(words(a), words(b)).map((o) => (o.type === 'same' ? o.text : o.type === 'removed' ? `-${o.text}` : `+${o.text}`)).join(' ');

describe('diffWords', () => {
  it('finds nothing in equal texts', () => {
    expect(countOps(diffWords(words('a b c'), words('a  b\nc')))).toEqual({ removed: 0, added: 0 });
  });

  it('marks a changed word as removed and added', () => {
    expect(show('Die Miete beträgt 800 Euro', 'Die Miete beträgt 850 Euro')).toBe('Die Miete beträgt -800 +850 Euro');
  });

  it('finds insertions and deletions in the middle', () => {
    expect(show('eins zwei drei vier', 'eins drei vier fünf')).toBe('eins -zwei drei vier +fünf');
    expect(show('a b c d e', 'a x y e')).toBe('a -b -c -d +x +y e');
  });

  it('handles an empty side', () => {
    expect(show('', 'neu hier')).toBe('+neu +hier');
    expect(show('weg hier', '')).toBe('-weg -hier');
  });

  it('does not take long for large texts that differ', () => {
    const a = Array.from({ length: 6000 }, (_, i) => `w${i}`);
    const b = Array.from({ length: 6000 }, (_, i) => `v${i}`);
    const start = Date.now();
    const ops = diffWords(a, b);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(countOps(ops)).toEqual({ removed: 6000, added: 6000 });
  });
});
