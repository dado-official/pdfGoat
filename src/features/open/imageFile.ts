import { pdfFromJpeg } from '../../core/imagePdf';

export const isImage = (f: File) => /^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

/** Longest side of a picture that is kept; larger pictures are scaled down to save memory. */
const MAX_SIDE = 5000;

/**
 * Makes a PDF file of a picture: one page, the size the picture has at 150 dpi. Transparent areas
 * become white. The picture is stored as JPEG at high quality.
 */
export async function imageToPdfFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Picture could not be converted');
  const pdf = pdfFromJpeg(new Uint8Array(await blob.arrayBuffer()), width, height);
  return new File([pdf as BlobPart], file.name.replace(/\.[^.]+$/, '') + '.pdf', { type: 'application/pdf' });
}
