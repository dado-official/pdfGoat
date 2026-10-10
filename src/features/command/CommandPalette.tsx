import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { filterCommands, type Command } from './commands';

interface Props {
  commands: Command[];
  onClose: () => void;
}

/** A search box that finds every function by typing a few letters (Ctrl+K). */
export default function CommandPalette({ commands, onClose }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const found = useMemo(() => filterCommands(commands, query), [commands, query]);
  const index = Math.min(selected, Math.max(0, found.length - 1));

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    document.getElementById(`cmd-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function run(command: Command | undefined) {
    if (!command) return;
    dialog.current?.close();
    // After the dialog is gone, so a command that opens another dialog gets the focus.
    command.run();
  }

  return (
    <dialog ref={dialog} className="palette" onClose={onClose} aria-label={t('command.title')}>
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="cmd-list"
        aria-activedescendant={found.length ? `cmd-${index}` : undefined}
        aria-label={t('command.search')}
        placeholder={t('command.search')}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSelected((index + 1) % Math.max(1, found.length));
          else if (e.key === 'ArrowUp') setSelected((index - 1 + found.length) % Math.max(1, found.length));
          else if (e.key === 'Enter') run(found[index]);
          else return;
          e.preventDefault();
        }}
      />
      <ul id="cmd-list" role="listbox" aria-label={t('command.title')}>
        {found.map((c, i) => (
          <li
            key={c.id}
            id={`cmd-${i}`}
            role="option"
            aria-selected={i === index}
            onMouseMove={() => setSelected(i)}
            onClick={() => run(c)}
          >
            <span>{c.label}</span>
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </li>
        ))}
        {!found.length && <li className="none">{t('command.none')}</li>}
      </ul>
    </dialog>
  );
}
