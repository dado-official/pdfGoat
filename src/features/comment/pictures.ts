// Pictures made by the user: signatures, initials and check marks. All drawn on a canvas and
// kept as PNG bytes with a transparent background.
import type { Picture } from './tools';

const toPicture = async (canvas: HTMLCanvasElement): Promise<Picture> => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Picture could not be made');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ratio: canvas.width / canvas.height };
};

/** Cuts a canvas down to the area that has ink on it, with a small margin. Null when it is empty. */
export function trim(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = source.getContext('2d')!;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 6;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + 2 * pad;
  out.height = y1 - y0 + 1 + 2 * pad;
  out.getContext('2d')!.drawImage(source, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  return out;
}

/** A check mark in `color`. */
export async function makeCheck(color: string): Promise<Picture> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(16, 52);
  ctx.lineTo(38, 76);
  ctx.lineTo(80, 20);
  ctx.stroke();
  return toPicture(canvas);
}

/** The text in a handwriting-like font, as a picture. */
export async function typedPicture(text: string, color: string): Promise<Picture | null> {
  if (!text.trim()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 400 120px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
  let size = 120;
  const room = canvas.width - 40;
  const wide = ctx.measureText(text).width;
  if (wide > room) size = Math.floor((size * room) / wide);
  ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
  ctx.fillText(text, 20, canvas.height / 2);
  const cut = trim(canvas);
  return cut ? toPicture(cut) : null;
}

/** Any picture file the browser can read, as a PNG that is at most `max` pixels wide. */
export async function imagePicture(file: File, max = 800): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, max / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return toPicture(canvas);
}

export const fromCanvas = async (canvas: HTMLCanvasElement): Promise<Picture | null> => {
  const cut = trim(canvas);
  return cut ? toPicture(cut) : null;
};

// Remembering a signature in this browser. Nothing leaves the device; the data stays in local storage.
const key = (kind: 'signature' | 'initials') => `pdfgoat.${kind}`;

export function loadSaved(kind: 'signature' | 'initials'): Picture | null {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return null;
    const { png, ratio } = JSON.parse(raw) as { png: string; ratio: number };
    return { bytes: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)), ratio };
  } catch {
    return null;
  }
}

export function save(kind: 'signature' | 'initials', picture: Picture | null) {
  try {
    if (!picture) return localStorage.removeItem(key(kind));
    let binary = '';
    picture.bytes.forEach((b) => (binary += String.fromCharCode(b)));
    localStorage.setItem(key(kind), JSON.stringify({ png: btoa(binary), ratio: picture.ratio }));
  } catch {
    // Storage can be off or full; the signature is then simply not remembered.
  }
}
