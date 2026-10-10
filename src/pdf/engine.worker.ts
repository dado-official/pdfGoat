// Runs the PDF engine away from the page, so the interface stays responsive while saving.
import { AppError } from '../core/errors';
import type { PageRef } from '../core/types';
import { buildPdf } from './build';

export interface WorkerSource {
  name?: string;
  bytes: Uint8Array;
  password?: string;
}

export type WorkerRequest = { id: number; pages: PageRef[]; sources: Record<string, WorkerSource>; flatten?: boolean };

export type WorkerResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'done'; bytes: Uint8Array }
  | { id: number; type: 'error'; code?: AppError['code']; params?: AppError['params']; message: string };

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, pages, sources, flatten } = data;
  try {
    const bytes = await buildPdf(
      pages,
      Object.fromEntries(
        Object.entries(sources).map(([key, s]) => [key, { name: s.name, password: s.password, read: async () => s.bytes }]),
      ),
      (done, total) => post({ id, type: 'progress', done, total }),
      { flatten },
    );
    post({ id, type: 'done', bytes }, [bytes.buffer]);
  } catch (err) {
    if (err instanceof AppError) post({ id, type: 'error', code: err.code, params: err.params, message: err.message });
    else post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
