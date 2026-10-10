// Applies a workflow to a file: open it, work out what the steps do to its pages, save the result.
import { AppError } from '../core/errors';
import { LEVELS } from '../core/compress';
import type { Protection } from '../core/protect';
import { planWorkflow, type Workflow } from '../core/workflow';
import { buildPdf } from './engine';
import { closePdf, openPdf } from './view';

/** The result for one file: the new bytes, or why it could not be done. */
export type BatchResult = { name: string; bytes: Uint8Array } | { name: string; error: unknown };

export async function applyWorkflow(file: File, workflow: Workflow, date: string): Promise<BatchResult> {
  const name = file.name;
  let opened: Awaited<ReturnType<typeof openPdf>> | null = null;
  try {
    // A file with a password cannot be asked for it in the middle of a batch.
    opened = await openPdf(file);
    const { doc, pages } = opened;
    const plan = planWorkflow(
      workflow.steps,
      pages,
      (p) => {
        const s = doc.sizes[p.srcIndex];
        return s ? { width: s[0], height: s[1] } : null;
      },
      () => crypto.randomUUID(),
    );
    const protect: Protection | null = plan.protect ?? null;
    const bytes = await buildPdf(plan.pages, { [doc.id]: doc }, {
      date,
      flatten: plan.flatten,
      protect,
      clean: plan.clean,
      compress: plan.compress ? LEVELS[plan.compress] : undefined,
    });
    return { name, bytes };
  } catch (error) {
    return { name, error: error instanceof AppError ? error : error };
  } finally {
    if (opened) void closePdf(opened.doc);
  }
}
