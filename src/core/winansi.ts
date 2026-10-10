// The characters of the embedded font. Text is written with a Windows-1252 ("WinAnsi") font, which
// covers German, French, Spanish and most other western European languages, the euro sign and
// typographic quotes. Other characters cannot be written and are reported.

const HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** The byte for a character, or null when the font has none. */
export function winAnsiByte(char: string): number | null {
  const code = char.codePointAt(0)!;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return HIGH[code] ?? null;
}

/** Text as bytes of the font, and the characters it could not write (each listed once). */
export function encodeWinAnsi(text: string): { bytes: number[]; missing: string[] } {
  const bytes: number[] = [];
  const missing = new Set<string>();
  for (const char of text) {
    const byte = winAnsiByte(char);
    if (byte === null) {
      // Line breaks and tabs are handled by the caller; anything else becomes a question mark.
      if (char !== '\n' && char !== '\r' && char !== '\t') missing.add(char);
      bytes.push(char === '\t' ? 0x20 : 0x3f);
    } else bytes.push(byte);
  }
  return { bytes, missing: [...missing] };
}

/** The characters of a text that the font cannot write. */
export const unsupportedChars = (text: string): string[] => encodeWinAnsi(text.replace(/[\n\r\t]/g, '')).missing;
