// A workflow: a list of steps that is saved once and applied to many files. Every step is the same
// thing the user can do by hand, so a workflow is a recorded change list plus save options.
import { applyChange, type Change } from './changes';
import type { CompressLevel } from './compress';
import type { MarkPlace } from './marks';
import { cropFromMargins, MM, paperSize, type Margins, type Orientation, type PaperName } from './paper';
import type { Cleaning, Permissions } from './protect';
import type { Size } from './readerLayout';
import type { PageRef } from './types';

export type Step =
  | { type: 'mark'; text: string; place: MarkPlace; size: number; color: string; opacity: number; diagonal: boolean }
  | { type: 'rotate'; degrees: 90 | 180 | 270 }
  | { type: 'crop'; margins: Margins }
  | { type: 'resize'; paper: PaperName; orientation: Orientation }
  | { type: 'compress'; level: CompressLevel }
  | { type: 'protect'; userPassword: string; ownerPassword: string; allow: Permissions }
  | { type: 'clean'; what: Cleaning }
  | { type: 'flatten' };

export interface Workflow {
  name: string;
  steps: Step[];
}

export const STEP_TYPES = ['mark', 'rotate', 'crop', 'resize', 'compress', 'protect', 'clean', 'flatten'] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** What a workflow does to the pages (as changes) and to the saved file (as save options). */
export interface Plan {
  changes: Change[];
  pages: PageRef[];
  compress?: CompressLevel;
  protect?: { userPassword: string; ownerPassword: string; allow: Permissions };
  clean?: Cleaning;
  flatten?: boolean;
}

/**
 * Works out what a workflow does to a list of pages. `own` gives the size of a page in its file
 * (null for a damaged page, which is left alone); `newId` makes ids for new header and footer texts.
 */
export function planWorkflow(steps: readonly Step[], start: PageRef[], own: (p: PageRef) => Size | null, newId: () => string): Plan {
  let pages = start;
  const changes: Change[] = [];
  const plan: Plan = { changes, pages };
  const apply = (change: Change) => {
    const next = applyChange(pages, change);
    if (next !== pages) {
      pages = next;
      changes.push(change);
    }
  };
  for (const step of steps) {
    switch (step.type) {
      case 'mark': {
        if (step.text.trim()) {
          const mark = { id: newId(), text: step.text, place: step.place, size: step.size, color: step.color, opacity: step.opacity, diagonal: step.diagonal };
          apply({ type: 'mark', ids: pages.map((p) => p.id), mark });
        }
        break;
      }
      case 'rotate':
        apply({ type: 'rotate', ids: pages.map((p) => p.id), delta: step.degrees });
        break;
      case 'crop': {
        const crops: Record<string, [number, number, number, number] | null> = {};
        for (const p of pages) {
          const size = own(p);
          if (!size) continue;
          const m = step.margins;
          crops[p.id] = cropFromMargins(size, p.rotation, { top: m.top * MM, right: m.right * MM, bottom: m.bottom * MM, left: m.left * MM });
        }
        apply({ type: 'crop', crops });
        break;
      }
      case 'resize': {
        const sizes: Record<string, [number, number] | null> = {};
        for (const p of pages) {
          const size = own(p);
          if (!size) continue;
          const shown = p.rotation % 180 === 0 ? size : { width: size.height, height: size.width };
          const [w, h] = paperSize(step.paper, step.orientation, shown);
          sizes[p.id] = p.rotation % 180 === 0 ? [w, h] : [h, w];
        }
        apply({ type: 'resize', sizes });
        break;
      }
      case 'compress':
        plan.compress = step.level;
        break;
      case 'protect':
        plan.protect = { userPassword: step.userPassword, ownerPassword: step.ownerPassword, allow: step.allow };
        break;
      case 'clean':
        // Several cleaning steps add up.
        plan.clean = Object.fromEntries(Object.entries(step.what).map(([k, v]) => [k, v || plan.clean?.[k as keyof Cleaning] || false])) as unknown as Cleaning;
        break;
      case 'flatten':
        plan.flatten = true;
        break;
    }
  }
  plan.pages = pages;
  return plan;
}

/** A short description of a step for lists. */
export const stepKey = (s: Step): StepType => s.type;

/** Reads a workflow from text (a saved file); null when it is not one. Unknown steps are dropped. */
export function parseWorkflow(text: string): Workflow | null {
  try {
    const raw = JSON.parse(text) as { name?: unknown; steps?: unknown };
    if (typeof raw.name !== 'string' || !Array.isArray(raw.steps)) return null;
    const steps = raw.steps.filter((s): s is Step => !!s && typeof s === 'object' && STEP_TYPES.includes((s as { type: StepType }).type));
    return { name: raw.name.slice(0, 80), steps };
  } catch {
    return null;
  }
}
