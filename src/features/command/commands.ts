// The list of things the command palette can do, and how a typed text finds them.

export interface Command {
  id: string;
  label: string;
  /** More words that find the command, e.g. synonyms. */
  keywords?: string;
  /** Shown next to the label as a reminder. */
  shortcut?: string;
  /** Commands that cannot run now are not offered. */
  enabled: boolean;
  run: () => void;
}

/** Lower case without accents, so "schliessen" finds "schließen" and "Zuruck" finds "Zurück". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * The enabled commands that contain every word of the query, best first: a label that starts
 * with the first word comes before one that merely contains it, and those before a hit in the keywords.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const available = commands.filter((c) => c.enabled);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return available;

  const scored: { command: Command; score: number; order: number }[] = [];
  available.forEach((command, order) => {
    const label = normalize(command.label);
    const all = `${label} ${normalize(command.keywords ?? '')}`;
    if (!words.every((w) => all.includes(w))) return;
    const inLabel = words.every((w) => label.includes(w));
    const score = (label.startsWith(words[0]) ? 0 : inLabel ? 1 : 2) + (label.split(/\s+/).some((w) => w.startsWith(words[0])) ? 0 : 0.5);
    scored.push({ command, score, order });
  });
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.command);
}
