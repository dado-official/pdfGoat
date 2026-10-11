import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { AppError } from '../core/errors';
import { toMegabytes } from '../core/limits';
import type { WorkspaceAction } from '../state/workspace';
import { useI18n } from '../i18n/context';
import { openPdf, type OpenedPdf, type SourceDoc } from '../pdf/view';
import { useFileDrop } from '../ui/useWindowEvents';
import { canPickWithHandles, pickPdfs, receiveLaunchedFiles, type OpenedFile } from '../features/open/fileAccess';
import { imageToPdfFile, isImage } from '../features/open/imageFile';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isOpenable = (f: File) => isPdf(f) || isImage(f);

interface Params {
  dispatchWs: Dispatch<WorkspaceAction>;
  setDocs: Dispatch<(d: Record<string, SourceDoc>) => Record<string, SourceDoc>>;
  setBusy: (label: string) => void;
  setError: (text: string) => void;
  setNotice: (text: string) => void;
}

/** Opening files: picker, drop, files handed over by the system, passwords. Each file gets its own tab. */
export function useOpenFiles({ dispatchWs, setDocs, setBusy, setError, setNotice }: Params) {
  const { t, errorText } = useI18n();
  const nextTab = useRef(1);
  const newTabId = () => `tab${nextTab.current++}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [passwordAsk, setPasswordAsk] = useState<{ name: string; wrong: boolean; answer: (p: string | null) => void } | null>(null);

  /** Opens a file; protected files ask for their password until it fits or the user skips them. */
  const openWithPassword = useCallback(async (file: File): Promise<OpenedPdf | null> => {
    let password: string | undefined;
    for (;;) {
      try {
        return await openPdf(file, password);
      } catch (err) {
        if (!(err instanceof AppError) || (err.code !== 'passwordRequired' && err.code !== 'passwordWrong')) throw err;
        const wrong = err.code === 'passwordWrong';
        const answer = await new Promise<string | null>((resolve) =>
          setPasswordAsk({ name: file.name, wrong, answer: resolve }),
        );
        setPasswordAsk(null);
        if (answer === null) return null;
        password = answer;
      }
    }
  }, []);

  const addFiles = useCallback(
    async (list: FileList | File[], handles?: Map<File, OpenedFile['handle']>) => {
      setError('');
      setNotice('');
      const files = [...list].filter(isOpenable);
      if (!files.length) {
        setError(t('error.noPdfSelected'));
        return;
      }
      const opened: OpenedPdf[] = [];
      const errors: string[] = [];
      const notices: string[] = [];
      for (const file of files) {
        setBusy(t('busy.opening', { name: file.name }));
        try {
          // A picture becomes a PDF of one page first.
          const result = await openWithPassword(isImage(file) ? await imageToPdfFile(file) : file);
          if (!result) continue;
          // Only a PDF can be written back; a picture that was made into a PDF must never be overwritten by it.
          if (isPdf(file)) result.doc.handle = handles?.get(file);
          opened.push(result);
          if (result.encrypted) notices.push(t('warning.encrypted', { name: file.name }));
          if (result.large) notices.push(t('warning.large', { name: file.name, size: toMegabytes(file.size) }));
        } catch (err) {
          errors.push(errorText(err));
        }
      }
      setBusy('');
      setError(errors.join(' '));
      setNotice(notices.join(' '));
      if (!opened.length) return;
      setDocs((d) => ({ ...d, ...Object.fromEntries(opened.map((o) => [o.doc.id, o.doc])) }));
      // Every file gets its own tab; the last one opened is shown.
      for (const o of opened) {
        dispatchWs({ type: 'open', id: newTabId(), title: o.doc.name, pages: o.pages });
      }
    },
    [t, errorText, openWithPassword, setBusy, setDocs, setError, setNotice, dispatchWs],
  );

  const openFilePicker = async () => {
    // Where the browser allows it, files are picked with handles, so they can be saved in place.
    if (canPickWithHandles()) {
      const picked = await pickPdfs(t('open.pdfFiles'), t('open.pictures')).catch(() => null);
      if (picked) void addFiles(picked.map((p) => p.file), new Map(picked.map((p) => [p.file, p.handle])));
      return;
    }
    fileInput.current?.click();
  };

  const fileDragging = useFileDrop(addFiles);

  // Files that the system opens with the installed app ("Open with PDFgoat").
  useEffect(() => {
    receiveLaunchedFiles((files) => void addFiles(files.map((f) => f.file), new Map(files.map((f) => [f.file, f.handle]))));
  }, [addFiles]);

  return { addFiles, openFilePicker, fileInput, passwordAsk, fileDragging, newTabId };
}
