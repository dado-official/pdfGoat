import { describe, expect, it } from 'vitest';
import { noCleaning, ALL_ALLOWED } from './protect';
import type { PageRef } from './types';
import { parseWorkflow, planWorkflow, type Step } from './workflow';

const pages: PageRef[] = [
  { id: 'a', docId: 'd', srcIndex: 0, rotation: 0 },
  { id: 'b', docId: 'd', srcIndex: 1, rotation: 0 },
];
const own = () => ({ width: 595, height: 842 });
let n = 0;
const newId = () => `m${n++}`;

describe('planWorkflow', () => {
  it('turns steps into changes on the pages and options for saving', () => {
    const steps: Step[] = [
      { type: 'mark', text: '{n}/{total}', place: 'bottomCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false },
      { type: 'rotate', degrees: 90 },
      { type: 'compress', level: 'medium' },
      { type: 'flatten' },
      { type: 'protect', userPassword: 'x', ownerPassword: '', allow: ALL_ALLOWED },
    ];
    const plan = planWorkflow(steps, pages, own, newId);
    expect(plan.changes.map((c) => c.type)).toEqual(['mark', 'rotate']);
    expect(plan.pages.map((p) => p.rotation)).toEqual([90, 90]);
    expect(plan.pages.every((p) => p.marks?.[0].text === '{n}/{total}')).toBe(true);
    expect(plan.compress).toBe('medium');
    expect(plan.flatten).toBe(true);
    expect(plan.protect?.userPassword).toBe('x');
  });

  it('crops after turning by what the user sees, and scales to a paper size', () => {
    const plan = planWorkflow(
      [{ type: 'rotate', degrees: 90 }, { type: 'crop', margins: { top: 10, right: 0, bottom: 0, left: 0 } }, { type: 'resize', paper: 'a5', orientation: 'portrait' }],
      pages.slice(0, 1),
      own,
      newId,
    );
    const [p] = plan.pages;
    // Turned by 90°, the shown top edge is the page's own left edge: 10 mm cut from x.
    expect(p.crop![0]).toBeCloseTo(10 * (72 / 25.4), 3);
    expect(p.crop![1]).toBe(0);
    // A5 portrait as shown; stored in the page's own orientation (turned).
    expect(p.size).toEqual([595, 420]);
  });

  it('skips a header without text, leaves damaged pages alone and combines cleaning steps', () => {
    const plan = planWorkflow(
      [
        { type: 'mark', text: '  ', place: 'topLeft', size: 10, color: '#000000', opacity: 1, diagonal: false },
        { type: 'crop', margins: { top: 5, right: 5, bottom: 5, left: 5 } },
        { type: 'clean', what: { ...noCleaning(), metadata: true } },
        { type: 'clean', what: { ...noCleaning(), comments: true } },
      ],
      pages,
      (p) => (p.id === 'a' ? null : own()),
      newId,
    );
    expect(plan.changes.map((c) => c.type)).toEqual(['crop']);
    expect(plan.pages[0].crop).toBeUndefined();
    expect(plan.pages[1].crop).toBeDefined();
    expect(plan.clean).toMatchObject({ metadata: true, comments: true, attachments: false });
  });
});

describe('parseWorkflow', () => {
  it('reads a saved workflow and drops what it does not know', () => {
    const w = parseWorkflow(JSON.stringify({ name: 'Rechnung', steps: [{ type: 'flatten' }, { type: 'launch-rocket' }, 5] }));
    expect(w).toEqual({ name: 'Rechnung', steps: [{ type: 'flatten' }] });
  });
  it('refuses anything else', () => {
    expect(parseWorkflow('nicht json')).toBeNull();
    expect(parseWorkflow('{"name":1}')).toBeNull();
    expect(parseWorkflow('[]')).toBeNull();
  });
});

describe('normalizeStep', () => {
  it('fills in what is missing and keeps values in range, so that a damaged file cannot break the screen', async () => {
    const { normalizeStep } = await import('./workflow');
    expect(normalizeStep({ type: 'crop' })).toEqual({ type: 'crop', margins: { top: 10, right: 10, bottom: 10, left: 10 } });
    expect(normalizeStep({ type: 'crop', margins: { top: -5, right: 'x', bottom: 9999, left: 3 } })).toEqual({ type: 'crop', margins: { top: 0, right: 10, bottom: 500, left: 3 } });
    expect(normalizeStep({ type: 'mark', size: 'groß', place: 'nirgends', color: 'rot' })).toMatchObject({ size: 10, place: 'bottomCenter', color: '#14161a', text: '' });
    expect(normalizeStep({ type: 'rotate', degrees: 45 })).toEqual({ type: 'rotate', degrees: 90 });
    expect(normalizeStep({ type: 'protect' })).toMatchObject({ allow: { print: true, copy: true, edit: true, annotate: true } });
    expect(normalizeStep({ type: 'clean' })).toEqual({ type: 'clean', what: { metadata: false, attachments: false, comments: false, thumbnails: false, scripts: false } });
    expect(normalizeStep(null)).toBeNull();
    expect(normalizeStep({ type: 'x' })).toBeNull();
  });

  it('never takes passwords from a file', async () => {
    const { normalizeStep } = await import('./workflow');
    expect(normalizeStep({ type: 'protect', userPassword: 'geheim', ownerPassword: 'auch' })).toMatchObject({ userPassword: '', ownerPassword: '' });
  });
});
