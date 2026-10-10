import { describe, expect, it } from 'vitest';
import { bodySize, toMarkdown, toParagraphs, toText, type Line } from './textExport';

const line = (text: string, y: number, size = 12): Line => ({ text, x: 72, y, size });

describe('toParagraphs', () => {
  it('joins the lines of a paragraph and splits at larger gaps', () => {
    const p = toParagraphs([line('Erste Zeile', 100), line('zweite Zeile.', 114), line('Neuer Absatz', 150)]);
    expect(p.map((x) => x.text)).toEqual(['Erste Zeile zweite Zeile.', 'Neuer Absatz']);
  });

  it('puts a word together that was split at the end of a line', () => {
    expect(toParagraphs([line('Dienstleis-', 100), line('tungen sind', 114)])[0].text).toBe('Dienstleistungen sind');
    expect(toParagraphs([line('Zahlen 1-', 100), line('2 und 3', 114)])[0].text).toBe('Zahlen 1- 2 und 3');
  });

  it('recognises headings by their size', () => {
    const body = [line('Fließtext', 100), line('geht weiter', 114), line('und weiter.', 128)];
    const p = toParagraphs([line('Titel', 60, 24), ...body, line('Abschnitt', 160, 16)]);
    expect(p.map((x) => x.heading)).toEqual([1, 0, 2]);
  });

  it('takes the most common size as body text', () => {
    expect(bodySize([line('aaaaaaaaaa', 1, 12), line('b', 2, 30), line('cccccccccc', 3, 12)])).toBe(12);
  });
});

describe('export formats', () => {
  const pages = [
    [{ text: 'Titel', heading: 1 as const }, { text: 'Ein *Satz* mit_Zeichen.', heading: 0 as const }],
    [{ text: 'Seite zwei', heading: 0 as const }],
  ];
  it('writes plain text with empty lines between paragraphs and pages', () => {
    expect(toText(pages)).toBe('Titel\n\nEin *Satz* mit_Zeichen.\n\nSeite zwei');
  });
  it('writes Markdown with headings and escaped characters, and a rule between pages', () => {
    expect(toMarkdown(pages)).toBe('# Titel\n\nEin \\*Satz\\* mit\\_Zeichen.\n\n---\n\nSeite zwei');
  });
});

describe('withoutCovered', () => {
  const l = (text: string, y: number, x = 72): Line & { length: number } => ({ text, x, y, size: 12, length: 80 });
  it('drops the lines that meet a box and keeps the others', async () => {
    const { withoutCovered } = await import('./textExport');
    const lines = [l('geheim', 100), l('offen', 130), l('daneben', 100, 400)];
    expect(withoutCovered(lines, [[60, 85, 200, 105]]).map((x) => x.text)).toEqual(['offen', 'daneben']);
    expect(withoutCovered(lines, [])).toHaveLength(3);
  });
});
