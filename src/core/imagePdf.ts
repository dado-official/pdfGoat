/**
 * A PDF with one page that shows a JPEG picture over the whole page. Written by hand, so it needs
 * no engine. `dpi` says how many pixels make an inch; the page gets the size of the picture then.
 */
export function pdfFromJpeg(jpeg: Uint8Array, width: number, height: number, dpi = 150): Uint8Array {
  const w = Math.round(((width * 72) / dpi) * 100) / 100;
  const h = Math.round(((height * 72) / dpi) * 100) / 100;
  const enc = new TextEncoder();
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, head: string, body?: Uint8Array) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${head}`);
    if (body) {
      push('\nstream\n');
      push(body);
      push('\nendstream');
    }
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  object(4, `<< /Length ${content.length} >>`, enc.encode(content));
  object(5, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let n = 1; n <= 5; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
