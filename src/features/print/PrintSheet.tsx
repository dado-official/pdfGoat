import { useEffect } from 'react';

export interface PrintPage {
  url: string;
  landscape: boolean;
}

interface Props {
  pages: PrintPage[];
  /** Called when the print dialog is closed, whether printed or cancelled. */
  onDone: () => void;
}

/**
 * The pages as images, hidden on screen and the only thing shown when printing.
 * Printing starts once every image is ready; the images are freed when the dialog closes.
 */
export default function PrintSheet({ pages, onDone }: Props) {
  useEffect(() => {
    let cancelled = false;
    const done = () => onDone();
    window.addEventListener('afterprint', done, { once: true });
    const images = [...document.querySelectorAll<HTMLImageElement>('.print-sheet img')];
    Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
    };
    // The sheet is created for one print and replaced as a whole.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="print-sheet" aria-hidden="true">
      {pages.map((p, i) => (
        <img key={i} className={p.landscape ? 'print-page landscape' : 'print-page portrait'} src={p.url} alt="" />
      ))}
    </div>
  );
}
