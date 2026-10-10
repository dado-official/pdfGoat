// Stamps are drawn as pictures: a coloured frame with a word in it, made on a canvas and kept
// as PNG bytes. The same bytes are drawn on the page and written into the PDF.

export const STAMPS = ['approved', 'rejected', 'draft', 'confidential', 'reviewed'] as const;
export type StampName = (typeof STAMPS)[number];

const COLOR: Record<StampName, string> = {
  approved: '#2f7d3f',
  rejected: '#c0392b',
  draft: '#3347c9',
  confidential: '#c0392b',
  reviewed: '#3347c9',
};

/** A stamp with the word `text` as PNG bytes, drawn for a box of `w` × `h` points at 4 pixels per point. */
export async function makeStamp(name: StampName, text: string, w: number, h: number): Promise<Uint8Array> {
  const k = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(w * k));
  canvas.height = Math.max(8, Math.round(h * k));
  const ctx = canvas.getContext('2d')!;
  const color = COLOR[name];
  text = text.toUpperCase();
  const line = Math.max(2, Math.min(w, h) * 0.06) * k;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = line;
  const r = Math.min(canvas.height * 0.18, 24);
  ctx.beginPath();
  ctx.roundRect(line / 2, line / 2, canvas.width - line, canvas.height - line, r);
  ctx.stroke();
  // The word is as large as the frame allows.
  let size = canvas.height * 0.5;
  ctx.font = `700 ${size}px sans-serif`;
  const room = canvas.width - line * 4;
  const wide = ctx.measureText(text).width;
  if (wide > room) size *= room / wide;
  ctx.font = `700 ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + size * 0.04);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Stamp could not be drawn');
  return new Uint8Array(await blob.arrayBuffer());
}
