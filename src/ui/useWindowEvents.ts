import { useEffect, useRef, useState } from 'react';

const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files');

/** Accepts files dropped anywhere on the window. Returns true while files are dragged over it. */
export function useFileDrop(onFiles: (files: FileList) => void): boolean {
  const [depth, setDepth] = useState(0);
  const callback = useRef(onFiles);
  useEffect(() => {
    callback.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    const enter = (e: DragEvent) => isFileDrag(e) && setDepth((d) => d + 1);
    const leave = (e: DragEvent) => isFileDrag(e) && setDepth((d) => Math.max(0, d - 1));
    const over = (e: DragEvent) => isFileDrag(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDepth(0);
      if (e.dataTransfer?.files.length) callback.current(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return depth > 0;
}

/** Window keydown handler that ignores typing in form fields. */
export function useShortcuts(handler: (e: KeyboardEvent) => void, enabled = true) {
  const callback = useRef(handler);
  useEffect(() => {
    callback.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      callback.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
