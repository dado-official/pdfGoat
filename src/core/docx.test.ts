import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx';

const read = (bytes: Uint8Array, name: string) => new TextDecoder().decode(unzipSync(bytes)[name]);

describe('buildDocx', () => {
  const docx = buildDocx([
    [{ text: 'Titel & <Untertitel>', heading: 1 }, { text: 'Ein Absatz mit "Umlauten": äöü.', heading: 0 }],
    [{ text: 'Seite zwei', heading: 0 }],
  ]);

  it('contains the parts Word needs', () => {
    expect(Object.keys(unzipSync(docx)).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
  });

  it('writes headings with their style, escapes text and puts a page break between pages', () => {
    const body = read(docx, 'word/document.xml');
    expect(body).toContain('<w:pStyle w:val="Heading1"/>');
    expect(body).toContain('Titel &amp; &lt;Untertitel&gt;');
    expect(body).toContain('äöü');
    expect(body.match(/w:type="page"/g)).toHaveLength(1);
  });

  it('writes well-formed XML: every opened tag is closed', () => {
    for (const name of ['word/document.xml', 'word/styles.xml', '[Content_Types].xml']) {
      const text = read(docx, name).replace(/<\?xml[^>]*\?>/, '');
      const stack: string[] = [];
      for (const [, closing, tag, selfClosing] of text.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
        if (selfClosing) continue;
        if (closing) expect(stack.pop(), name).toBe(tag);
        else stack.push(tag);
      }
      expect(stack, name).toEqual([]);
    }
  });
});
