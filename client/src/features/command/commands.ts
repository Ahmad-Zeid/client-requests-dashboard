import type { IconName } from '../../components/Icon';

export type Command = {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  /** Shown right-aligned — usually the keyboard shortcut for the same action. */
  hint?: string;
  /** Extra text to match against that isn't in the visible label. */
  keywords?: string;
  run: () => void;
};

type Scored = { command: Command; score: number };

/**
 * Ranking, deliberately hand-written rather than pulled from a fuzzy-match library.
 *
 * A command list this size does not need trigram scoring, and a dependency here
 * would be harder to read than the twenty lines it replaces. The ordering that
 * actually matters to a user is: what I typed starts the label, then starts a word
 * in the label, then appears anywhere.
 */
function score(command: Command, query: string): number {
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.keywords ?? ''} ${command.group}`.toLowerCase();

  if (label === query) return 100;
  if (label.startsWith(query)) return 80;

  // Start of any word in the label — "req" matching "New request".
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 60;

  if (label.includes(query)) return 40;
  if (haystack.includes(query)) return 20;

  return 0;
}

export function filterCommands(commands: Command[], rawQuery: string): Command[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return commands;

  return commands
    .map((command): Scored => ({ command, score: score(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

/** Groups in stable order — the order commands were registered in, not alphabetical. */
export function groupCommands(commands: Command[]): Array<[string, Command[]]> {
  const groups = new Map<string, Command[]>();

  for (const command of commands) {
    const existing = groups.get(command.group);
    if (existing) existing.push(command);
    else groups.set(command.group, [command]);
  }

  return [...groups.entries()];
}
