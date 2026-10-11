import { useCallback, useRef, useState } from 'react';
import { CancelledError, type JobOptions } from '../pdf/engine';

/** The one job the app runs at a time (opening, saving, printing …), with its label, progress and error. */
export function useJob(errorText: (err: unknown) => string) {
  const [busy, setBusy] = useState('');
  // Set while a job in the engine can be cancelled, with how far it is (0 to 1).
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const job = useRef<AbortController | null>(null);

  const run = useCallback(
    async (label: string, task: (job: JobOptions) => Promise<void>) => {
      const controller = new AbortController();
      job.current = controller;
      setBusy(label);
      setProgress(0);
      setError('');
      try {
        await task({ signal: controller.signal, onProgress: setProgress });
      } catch (err) {
        // Cancelling is the user's choice, not a failure.
        if (!(err instanceof CancelledError)) {
          console.error(err);
          setError(errorText(err));
        }
      } finally {
        job.current = null;
        setBusy('');
        setProgress(null);
      }
    },
    [errorText],
  );

  return { busy, setBusy, progress, error, setError, run, cancel: () => job.current?.abort() };
}

export type RunJob = ReturnType<typeof useJob>['run'];
