import { parseWorkflow, type Workflow } from '../../core/workflow';

const KEY = 'pdfgoat.workflows';

/** The workflows saved in this browser. */
export function loadWorkflows(): Workflow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((w) => parseWorkflow(JSON.stringify(w))).filter((w): w is Workflow => w !== null);
  } catch {
    return [];
  }
}

/** Remembers the workflows. Storage can be off or full; nothing is lost but the memory. */
export function storeWorkflows(list: Workflow[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map(withoutSecrets)));
    return true;
  } catch {
    return false;
  }
}

/** A workflow without the passwords: those are never kept or handed out, they are typed in again. */
export const withoutSecrets = (w: Workflow): Workflow => ({
  ...w,
  steps: w.steps.map((s) => (s.type === 'protect' ? { ...s, userPassword: '', ownerPassword: '' } : s)),
});
