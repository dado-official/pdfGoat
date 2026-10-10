import { describe, expect, it } from 'vitest';
import { filterCommands, normalize, type Command } from './commands';

const cmd = (id: string, label: string, extra: Partial<Command> = {}): Command => ({
  id,
  label,
  enabled: true,
  run: () => undefined,
  ...extra,
});

const commands = [
  cmd('save', 'PDF speichern', { keywords: 'download herunterladen' }),
  cmd('close', 'Dokument schließen'),
  cmd('closeAll', 'Alle Dokumente schließen'),
  cmd('rotate', 'Links drehen', { enabled: false }),
  cmd('undo', 'Rückgängig', { keywords: 'zurück' }),
];

describe('normalize', () => {
  it('ignores case and accents', () => {
    expect(normalize('Rückgängig SCHLIEßEN')).toBe('ruckgangig schliessen');
  });
});

describe('filterCommands', () => {
  const ids = (q: string) => filterCommands(commands, q).map((c) => c.id);

  it('offers every enabled command for an empty query', () => {
    expect(ids('')).toEqual(['save', 'close', 'closeAll', 'undo']);
    expect(ids('   ')).toEqual(['save', 'close', 'closeAll', 'undo']);
  });

  it('never offers a command that cannot run', () => {
    expect(ids('drehen')).toEqual([]);
  });

  it('finds by part of a word, without caring for accents', () => {
    expect(ids('schliessen')).toEqual(['close', 'closeAll']);
    expect(ids('ruckg')).toEqual(['undo']);
  });

  it('needs every word, in any order', () => {
    expect(ids('schließen alle')).toEqual(['closeAll']);
  });

  it('finds by keyword, after matches in the label', () => {
    expect(ids('download')).toEqual(['save']);
    expect(ids('zuruck')).toEqual(['undo']);
  });

  it('ranks a label that starts with the word before one that contains it', () => {
    expect(ids('dokument')).toEqual(['close', 'closeAll']);
    expect(ids('doku')[0]).toBe('close');
  });
});
