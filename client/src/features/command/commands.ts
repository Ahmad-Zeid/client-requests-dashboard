import type { IconName } from '../../components/Icon';

export type Command = {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  /** Shown right-aligned — the keyboard shortcut for the same action, where one exists. */
  hint?: string;
  /** Extra terms to match against that aren't in the visible label. */
  keywords?: string;
  /** Nudges a command up or down the list. 1 is neutral. */
  weight?: number;
  run: () => void;
};

/**
 * Does `query` appear inside `text` in order, allowing gaps?
 *
 * "sim conf" finds "Simulate a stale conflict"; "nreq" finds "New request". This is
 * what makes a palette forgiving — exact substring matching fails the moment someone
 * types the words in their head rather than the words on screen.
 *
 * Returns a score rather than a boolean so tighter matches sort higher: consecutive
 * hits and matches at the start of a word are worth more than scattered letters.
 */
function subsequenceScore(text: string, query: string): number {
  let score = 0;
  let textIndex = 0;
  let consecutive = 0;

  for (const char of query) {
    const found = text.indexOf(char, textIndex);
    if (found === -1) return 0;

    // Start of a word is a strong signal — it is how people abbreviate.
    const atWordStart = found === 0 || text[found - 1] === ' ';
    score += atWordStart ? 6 : 1;

    consecutive = found === textIndex ? consecutive + 1 : 0;
    score += consecutive * 2;

    textIndex = found + 1;
  }

  // Shorter labels containing the same match are more likely to be the intended one.
  return score + Math.max(0, 12 - text.length / 4);
}

function score(command: Command, query: string): number {
  const label = command.label.toLowerCase();
  const aliases = `${command.keywords ?? ''} ${command.group}`.toLowerCase();
  const weight = command.weight ?? 1;

  if (label === query) return 1000 * weight;
  if (label.startsWith(query)) return 500 * weight;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 300 * weight;
  if (label.includes(query)) return 200 * weight;

  // Fall back to fuzzy: the label first, then the hidden alias text at a discount so
  // a keyword match never outranks a visible-label match.
  const labelFuzzy = subsequenceScore(label, query);
  if (labelFuzzy > 0) return (60 + labelFuzzy) * weight;

  const aliasFuzzy = subsequenceScore(aliases, query);
  if (aliasFuzzy > 0) return (10 + aliasFuzzy * 0.5) * weight;

  return 0;
}

export function filterCommands(commands: Command[], rawQuery: string): Command[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return commands;

  return commands
    .map((command) => ({ command, score: score(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

/** Groups in registration order, not alphabetical — the order was chosen deliberately. */
export function groupCommands(commands: Command[]): Array<[string, Command[]]> {
  const groups = new Map<string, Command[]>();

  for (const command of commands) {
    const existing = groups.get(command.group);
    if (existing) existing.push(command);
    else groups.set(command.group, [command]);
  }

  return [...groups.entries()];
}
