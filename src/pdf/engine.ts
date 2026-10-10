// The page's door to the PDF engine. The work runs in a worker, so the page stays responsive
// and a long job can be cancelled by ending the worker.
import { AppError } from '../core/errors';
import type { PageRef } from '../core/types';
import { bytesOf, type BuildOptions, type BuildSource } from './build';
import type { WorkerRequest, WorkerResponse, WorkerSource } from './engine.worker';

export interface JobOptions extends BuildOptions {
  /** Fraction of the work that is done, 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Thrown when a job is cancelled. Not an error the user needs to be told about. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

interface Job {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: unknown) => void;
  onProgress?: (fraction: number) => void;
}

let worker: Worker | null = null;
let nextJob = 1;
const jobs = new Map<number, Job>();

function start(): Worker {
  const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const job = jobs.get(data.id);
    if (!job) return;
    if (data.type === 'progress') return job.onProgress?.(data.done / data.total);
    jobs.delete(data.id);
    if (data.type === 'done') job.resolve(data.bytes);
    else job.reject(data.code ? new AppError(data.code, data.params) : new Error(data.message));
  };
  w.onerror = (e) => stop(new Error(e.message || 'The PDF engine failed to start.'));
  return w;
}

/** Ends the worker and fails every job that is still waiting. The next job starts a fresh one. */
function stop(reason: unknown) {
  worker?.terminate();
  worker = null;
  const waiting = [...jobs.values()];
  jobs.clear();
  for (const job of waiting) job.reject(reason);
}

/** Builds a new PDF from a list of pages (possibly from several files) in the worker. */
export async function buildPdf(
  pages: PageRef[],
  sources: Record<string, BuildSource>,
  { onProgress, signal, flatten, date, numbering, protect, clean, compress }: JobOptions = {},
): Promise<Uint8Array> {
  if (signal?.aborted) throw new CancelledError();
  // The worker has no access to the files, so the bytes of the files in use are handed over.
  const used = new Set(pages.map((p) => p.docId));
  const payload: Record<string, WorkerSource> = {};
  for (const key of used) {
    const src = sources[key];
    if (!src) throw new AppError('sourceMissing', { id: key });
    payload[key] = { name: src.name, password: src.password, bytes: await bytesOf(src) };
  }
  if (signal?.aborted) throw new CancelledError();

  const id = nextJob++;
  worker ??= start();
  return new Promise<Uint8Array>((resolve, reject) => {
    const cancel = () => stop(new CancelledError());
    signal?.addEventListener('abort', cancel, { once: true });
    jobs.set(id, {
      resolve: (bytes) => (signal?.removeEventListener('abort', cancel), resolve(bytes)),
      reject: (err) => (signal?.removeEventListener('abort', cancel), reject(err)),
      onProgress,
    });
    // The bytes are copied, not moved: the opened files stay available for the next save.
    const request: WorkerRequest = { id, pages, sources: payload, options: { flatten, date, numbering, protect, clean, compress } };
    worker!.postMessage(request);
  });
}
