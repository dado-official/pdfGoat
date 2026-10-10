import type { Mark } from './marks';

export type MarkPreset = 'number' | 'header' | 'footer' | 'watermark';

export const MARK_PRESETS: Record<MarkPreset, Omit<Mark, 'id'>> = {
  number: { text: '{n} / {total}', place: 'bottomCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  header: { text: '', place: 'topCenter', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  footer: { text: '', place: 'bottomLeft', size: 10, color: '#14161a', opacity: 1, diagonal: false },
  watermark: { text: 'ENTWURF', place: 'center', size: 90, color: '#e5484d', opacity: 0.2, diagonal: true },
};

