// Opening files with a handle, so that a changed document can be written back into the same file.
// This is the File System Access API: it exists in Chromium browsers (and when the app is
// installed and a PDF is opened with it). Elsewhere files are opened and downloaded as before.

/** The parts of the API that the app uses (the browser's own types do not have them all). */
export interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array | Blob): Promise<void>; close(): Promise<void> }>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

export interface OpenedFile {
  file: File;
  handle: FileHandle;
}

interface PickerWindow {
  showOpenFilePicker?: (options: { multiple: boolean; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle[]>;
  launchQueue?: { setConsumer(consumer: (params: { files: FileHandle[] }) => void): void };
}

const w = (): PickerWindow => window as unknown as PickerWindow;

export const canPickWithHandles = () => typeof w().showOpenFilePicker === 'function';

/** Lets the user pick PDF files and returns them with their handles; null when the picker is closed without a choice. */
export async function pickPdfs(description: string, picturesDescription: string): Promise<OpenedFile[] | null> {
  try {
    const handles = await w().showOpenFilePicker!({ multiple: true, types: [
        { description, accept: { 'application/pdf': ['.pdf'] } },
        { description: picturesDescription, accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/gif': ['.gif'], 'image/bmp': ['.bmp'] } },
      ],
    });
    return await Promise.all(handles.map(async (handle) => ({ handle, file: await handle.getFile() })));
  } catch (err) {
    // Closing the picker is not an error.
    if ((err as DOMException).name === 'AbortError') return null;
    throw err;
  }
}

/** Calls `onFiles` for the files the system hands to the installed app ("Open with"). */
export function receiveLaunchedFiles(onFiles: (files: OpenedFile[]) => void) {
  w().launchQueue?.setConsumer(async (params) => {
    if (!params.files?.length) return;
    onFiles(await Promise.all(params.files.map(async (handle) => ({ handle, file: await handle.getFile() }))));
  });
}

/** Writes bytes into the file of a handle. Asks for permission first, which needs a click that is still fresh. */
export async function allowWriting(handle: FileHandle): Promise<boolean> {
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeInto(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
  } finally {
    await writable.close();
  }
}
